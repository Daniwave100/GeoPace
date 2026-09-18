// Direction A — Roadbook.
//
// A survey sheet crossed with a rally roadbook. The course runs down the page as a route card,
// the way a co-driver reads one, and everything printed on it follows map conventions that
// already mean the right thing:
//   • printed ink            — measured
//   • dashed grey            — approximate (how a survey map draws a contour it didn't survey)
//   • purple pencil, by hand — what runners say. Purple is the colour survey maps overprint
//                              revisions in when nobody has field-checked them.
//   • green                  — trees, as on any topographic map
// Paper does not have a dark mode, so this direction commits to light.
import "@fontsource-variable/besley";
import "@fontsource/kalam/latin-400.css";
import "@fontsource/kalam/latin-700.css";
import "./roadbook.css";

import { type Entry, type Field, NOTE_HEADINGS, entriesNear, headlineFields, layerFields } from "../content";
import { contourSegments, sampleTerrain } from "../contours";
import { buildCredits } from "../credits";
import * as show from "../format";
import { effortReach, heightDomain, linearScale, measuredRuns, spreadLabels, windArrowOnPage } from "../layout";
import { type MaquetteStyle, renderMaquette } from "../maquette";
import { type MockupContext, startMockup } from "../shell";
import type { CourseStory, StripBin } from "../story";
import { drawToFit, html, link, perFrame, svg } from "../svg";

const INK = "#1d2a33";
const SEPIA = "#9a6a3c";
const PENCIL = "#7d2e8c";
const ROUTE_RED = "#b8322a";
const GREY = "#8d9298";

const MAQUETTE_STYLE: MaquetteStyle = {
  ground: "#e4dfcd",
  street: "#f1ede0",
  roof: "#fbf9f1",
  wallLit: "#f3efe2",
  wallShaded: "#d3cdb9",
  outline: INK,
  outlineWidth: 0.32,
  shadow: "url(#rb-hachure)",
  shadowOpacity: 1,
  courseLine: ROUTE_RED,
  runner: INK,
  annotation: INK,
  // Shadows as an engraver would cut them: a tint, then hachure lines over it.
  defs: () => [
    svg(
      "pattern",
      { id: "rb-hachure", width: 1.7, height: 1.7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(38)" },
      svg("rect", { width: 1.7, height: 1.7, fill: INK, "fill-opacity": 0.2 }),
      svg("line", { x1: 0, y1: 0.4, x2: 1.7, y2: 0.4, stroke: INK, "stroke-width": 0.34, "stroke-opacity": 0.62 }),
    ),
  ],
};

startMockup({ id: "roadbook", mount });

function mount(stage: HTMLElement, context: MockupContext): void {
  const { story } = context;
  stage.className = "rb";

  const plate = html("div", { class: "rb-plate__drawing" });
  const plateCaption = html("figcaption", { class: "rb-plate__caption" });
  const headline = html("div", { class: "rb-headline" });
  const ledger = html("table", { class: "rb-ledger" });
  const around = html("ul", { class: "rb-around" });

  stage.append(
    routeCard(context),
    html(
      "div",
      { class: "rb-sheet" },
      titleBlock(story),
      html("div", { class: "rb-now" }, headline, html("figure", { class: "rb-plate" }, plate, plateCaption)),
      html("section", { class: "rb-section" }, html("h2", { text: "At this kilometre" }), ledger),
      html("section", { class: "rb-section" }, html("h2", { text: "Coming up" }), around),
      legend(),
      buildCredits(
        story,
        "rb",
        "This direction is printed on paper, so it stays light whatever theme your system uses. The contour lines behind the title are texture, traced from invented ground; they are not this course's terrain.",
      ),
    ),
  );

  const update = () => {
    const readout = story.at(context.km);

    headline.replaceChildren(...headlineFields(story, readout).map(headlineCell));
    ledger.replaceChildren(...layerFields(story, readout).map(ledgerRow));
    around.replaceChildren(...entriesNear(story, context.km).map((entry) => aroundItem(entry, context.km)));

    plate.replaceChildren(
      renderMaquette({
        positionM: readout.km * 1000,
        headingDeg: readout.headingDeg,
        sun: readout.sun,
        seed: story.massing.seed,
        view: { acrossM: 74, aheadM: 150, behindM: 56, maxHeightM: story.massing.maxHeightM },
        style: MAQUETTE_STYLE,
      }),
    );
    plateCaption.replaceChildren(
      html("b", { text: `The street at km ${show.km(readout.km)}, ${readout.clock} ${readout.zoneLabel}. ` }),
      readout.sun.isUp
        ? `The buildings are invented stand-ins. The sun is not: it is ${show.sunWords(readout)}, and every shadow is where that sun puts it.`
        : "The buildings are invented stand-ins. The sun is below the horizon here, so nothing casts a shadow.",
    );
  };
  context.onScrub(perFrame(update));
  update();
}

// ── The sheet ───────────────────────────────────────────────────────────────────────────────

function titleBlock(story: CourseStory): HTMLElement {
  const block = html("header", { class: "rb-title" });
  block.append(contourField(story.course.id === "nyc" ? 19 : 5));

  const plan = `${story.edition.waveLabel.replace(" · ", ", ")} starts at ${story.edition.waveStartLocal}. Planned finish ${show.formatElapsed(
    story.clock.elapsedSecondsAtKm(story.lengthKm),
  )}, which is ${show.formatPace(story.clock.goalPaceSecondsPerKm)} per kilometre at an even pace.`;

  const date = html("p", { class: "rb-title__date", text: show.raceDate(story.edition.date) });
  if (!story.edition.dateConfirmed)
    date.append(html("span", { class: "rb-approx", title: story.edition.dateNote, text: " date believed, not yet confirmed" }));
  const carriedOver = story.edition.carriedOver;

  block.append(
    html("p", { class: "rb-title__series", text: "GeoPace course sheet" }),
    html("h1", { text: story.course.name }),
    date,
    html(
      "p",
      { class: "rb-title__plan" },
      plan,
      ...(carriedOver ? [html("span", { class: "rb-approx", title: carriedOver.reason, text: ` Start time carried over from ${carriedOver.fromEdition}.` })] : []),
    ),
    html("p", {
      class: "rb-title__facts",
      text: `${story.lengthKm.toFixed(2)} km along the course line. Climbs ${story.elevation.gainM.toFixed(0)} m, drops ${story.elevation.lossM.toFixed(0)} m, between ${story.elevation.minM.toFixed(0)} and ${story.elevation.maxM.toFixed(0)} m.`,
    }),
  );
  return block;
}

/** Contour lines behind the title, with every fifth one heavier — a map's index contours. */
function contourField(seed: number): SVGSVGElement {
  const columns = 72;
  const rows = 22;
  const field = sampleTerrain(columns, rows, seed);
  const node = svg("svg", {
    class: "rb-title__contours",
    viewBox: `0 0 ${columns - 1} ${rows - 1}`,
    preserveAspectRatio: "none",
    "aria-hidden": true,
  });
  for (let step = 1; step <= 14; step += 1) {
    const path = contourSegments(field, step * 0.07)
      .map(({ from, to }) => `M${from.x.toFixed(2)} ${from.y.toFixed(2)}L${to.x.toFixed(2)} ${to.y.toFixed(2)}`)
      .join("");
    node.append(
      svg("path", { d: path, fill: "none", stroke: SEPIA, "stroke-width": step % 5 === 0 ? 1.3 : 0.6, "vector-effect": "non-scaling-stroke" }),
    );
  }
  return node;
}

function headlineCell(field: Field): HTMLElement {
  const cell = html("div", { class: "rb-headline__cell" });
  cell.append(html("span", { class: "rb-headline__value", text: field.value }));
  const label = html("span", { class: "rb-headline__label", text: field.label });
  if (field.detail) label.append(` (${field.detail})`);
  cell.append(label);
  if (field.assumption) cell.append(html("span", { class: "rb-headline__assumption", text: field.assumption }));
  return cell;
}

function ledgerRow(field: Field): HTMLElement {
  const row = html("tr", { class: field.unknown ? "rb-ledger__row rb-ledger__row--unknown" : "rb-ledger__row" });
  const value = html("td", { class: "rb-ledger__value", text: field.value });
  if (field.sample) value.append(" ", stamp("sample"));
  const remarks = [
    field.unknownNote ? `${field.unknownNote[0].toUpperCase()}${field.unknownNote.slice(1)}.` : "",
    field.detail ?? "",
    field.assumption ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  row.append(html("th", { scope: "row", text: field.label }), value, html("td", { class: "rb-ledger__remark", text: remarks }));
  return row;
}

function aroundItem(entry: Entry, km: number): HTMLElement {
  const item = html("li", { class: `rb-around__item rb-around__item--${entry.provenance}` });
  const where = show.distanceWords(entry.km - km);
  item.append(html("span", { class: "rb-around__km", text: `km ${show.km(entry.km)}` }));

  const body = html("div", { class: "rb-around__body" });
  if (entry.kind === "note") {
    body.append(html("b", { text: entry.title }), ` ${entry.detail} `, html("i", { text: `(${where})` }));
  } else {
    body.append(html("b", { text: entry.title }), ` ${entry.kind === "aid" ? `${entry.detail}, ${where}` : where}. `);
    if (entry.source) body.append(link(entry.source, "source"));
  }
  if (entry.sample) body.append(" ", stamp("sample"));
  item.append(body);
  return item;
}

function legend(): HTMLElement {
  const box = html("section", { class: "rb-legend" });
  box.append(html("h2", { text: "How to read this sheet" }));
  const rows: [HTMLElement | SVGElement, string][] = [
    [
      html("span", { class: "rb-legend__printed", text: "Printed" }),
      "Measured, or computed from measurements by a published model. Sourced in the credits.",
    ],
    [
      html("span", { class: "rb-legend__pencil", text: "In pencil" }),
      "What runners report. Nobody has checked it, which is what purple means on a survey map.",
    ],
    [swatch("dashed"), "A value that isn't measured at this spot, such as the middle of the Verrazzano span, where the survey has no returns."],
    [swatch("sun"), "Share of the kilometre in direct sun. Ochre is sunny whatever the trees do; green is sunny only if the leaves are down."],
    [
      swatch("wind"),
      "Wind, drawn the way the card reads: you run down the page, so an arrow pointing up at you is a headwind (drawn heavier) and one pointing down is at your back.",
    ],
    [stamp("sample"), "An invented stand-in for a layer that isn't built yet. It shows the layout, and says nothing about the course."],
  ];
  const list = html("dl", {});
  for (const [mark, meaning] of rows) list.append(html("dt", {}, mark), html("dd", { text: meaning }));
  box.append(list);
  return box;
}

function swatch(kind: "dashed" | "sun" | "wind"): SVGSVGElement {
  const node = svg("svg", { width: 58, height: 14, viewBox: "0 0 58 14", "aria-hidden": true });
  if (kind === "wind")
    node.append(
      svg("path", { d: "M12 13V2M12 2l-3.5 4.5M12 2l3.5 4.5", fill: "none", stroke: INK, "stroke-width": 1.7, "stroke-linecap": "round" }),
      svg("path", { d: "M34 1V12M34 12l-3 -4M34 12l3 -4", fill: "none", stroke: INK, "stroke-width": 0.9, "stroke-linecap": "round" }),
    );
  else if (kind === "dashed")
    node.append(svg("path", { d: "M2 10 C14 2 24 12 34 6 S50 4 56 8", fill: "none", stroke: GREY, "stroke-width": 1.4, "stroke-dasharray": "4 3" }));
  else
    node.append(
      svg("rect", { x: 2, y: 3, width: 26, height: 8, class: "rb-fill-sun" }),
      svg("rect", { x: 28, y: 3, width: 18, height: 8, class: "rb-fill-trees" }),
    );
  return node;
}

function stamp(text: string): HTMLElement {
  return html("span", { class: "rb-stamp", text });
}

// ── The route card ──────────────────────────────────────────────────────────────────────────

/** Column widths in px, left to right after the pencil margin. */
const COLUMNS = { km: 34, profile: 112, effort: 38, sun: 66, wind: 30, aid: 22 };
const GAP = 10;
const PAD_TOP = 74;
const PAD_BOTTOM = 22;

function routeCard(context: MockupContext): HTMLElement {
  const { story } = context;
  const card = html("section", { class: "rb-card", "aria-label": "Route card: every layer, aligned by kilometre" });
  const drawing = html("div", { class: "rb-card__drawing" });
  const pencil = html("div", { class: "rb-card__pencil" });
  const marks = html("div", { class: "rb-card__marks" });
  card.append(drawing, pencil, marks);

  const notes = story.notes.map((note) => ({
    km: note.km,
    node: html("p", { class: "rb-note" }, html("b", { text: NOTE_HEADINGS[note.kind] }), html("br"), note.text),
  }));
  const landmarks = story.landmarks.map((landmark) => ({ km: landmark.km, node: html("p", { class: "rb-mark", text: landmark.name }) }));
  // The margin notes are invented too, and say so where they are written, not only in the legend.
  pencil.append(html("p", { class: "rb-card__pencil-stamp" }, stamp("sample notes")), ...notes.map((note) => note.node));
  marks.append(...landmarks.map((landmark) => landmark.node));

  let moveCursor: (() => void) | undefined;

  const draw = (width: number, height: number) => {
    const fixed = Object.values(COLUMNS).reduce((sum, value) => sum + value, 0) + GAP * 5;
    const margin = Math.max(120, (width - fixed) / 2 - 8);
    const x = {
      axis: margin + COLUMNS.km,
      profile: margin + COLUMNS.km,
      effort: margin + COLUMNS.km + COLUMNS.profile + GAP,
      sun: margin + COLUMNS.km + COLUMNS.profile + COLUMNS.effort + GAP * 2,
      wind: margin + COLUMNS.km + COLUMNS.profile + COLUMNS.effort + COLUMNS.sun + GAP * 3,
      aid: margin + COLUMNS.km + COLUMNS.profile + COLUMNS.effort + COLUMNS.sun + COLUMNS.wind + GAP * 4,
      end: margin + fixed - GAP,
    };
    const y = linearScale([0, story.lengthKm], [PAD_TOP, height - PAD_BOTTOM]);
    const bins = story.strip(Math.max(40, Math.round((height - PAD_TOP - PAD_BOTTOM) / 4)));

    const node = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "rb-card__svg" });
    node.append(
      columnHeads(x, story),
      kmAxis(x.axis, x.end, y, story.lengthKm),
      profileColumn(bins, x.profile, y, story),
      effortColumn(bins, x.effort, y),
      sunColumn(bins, x.sun, y),
      windColumn(story, x.wind, y),
      aidColumn(story, x.aid, y),
    );

    // Pencil notes to the left of the card, printed landmarks to the right; both are nudged
    // apart where the course crowds them, and tied back to their kilometre with a leader.
    pencil.style.width = `${margin - 22}px`;
    marks.style.left = `${x.end + 26}px`;
    marks.style.width = `${Math.max(90, width - x.end - 34)}px`;
    const bounds = { min: PAD_TOP - 8, max: height - 4 };
    const leaders = svg("g", { fill: "none" });

    const noteCentres = spreadLabels(
      notes.map((note) => ({ at: y(note.km), size: note.node.offsetHeight })),
      bounds,
      10,
    );
    notes.forEach((note, index) => {
      note.node.style.top = `${noteCentres[index] - note.node.offsetHeight / 2}px`;
      leaders.append(pencilLeader(margin - 16, noteCentres[index], x.axis - 3, y(note.km)));
    });

    const markCentres = spreadLabels(
      landmarks.map((landmark) => ({ at: y(landmark.km), size: landmark.node.offsetHeight })),
      bounds,
      3,
    );
    landmarks.forEach((landmark, index) => {
      landmark.node.style.top = `${markCentres[index] - landmark.node.offsetHeight / 2}px`;
      const at = y(landmark.km);
      leaders.append(
        svg("path", { d: `M${x.end + 2} ${at}H${x.end + 9}L${x.end + 17} ${markCentres[index]}H${x.end + 23}`, stroke: INK, "stroke-width": 0.7 }),
        svg("circle", { cx: x.end + 2, cy: at, r: 1.6, fill: INK }),
      );
    });
    node.append(leaders);

    const cursor = svg("g", { class: "rb-cursor" });
    const cursorLabel = svg("text", { x: x.axis - 7, y: 3.5, "text-anchor": "end", class: "rb-cursor__km" });
    cursor.append(
      svg("rect", { x: x.axis - COLUMNS.km - 10, y: -8, width: COLUMNS.km + 6, height: 16, class: "rb-cursor__tab" }),
      cursorLabel,
      svg("line", { x1: x.axis - 3, y1: 0, x2: x.end + 2, y2: 0, stroke: ROUTE_RED, "stroke-width": 1.6 }),
      svg("path", { d: `M${x.end + 2} -4.5L${x.end + 9} 0L${x.end + 2} 4.5Z`, fill: ROUTE_RED }),
    );
    node.append(cursor);
    moveCursor = () => {
      cursor.setAttribute("transform", `translate(0 ${y(context.km).toFixed(1)})`);
      cursorLabel.textContent = show.km(context.km);
    };
    moveCursor();

    drawing.replaceChildren(node);
  };

  const redraw = drawToFit(drawing, draw);
  // The labels are measured to place them, and they change height when the real fonts arrive.
  void document.fonts.ready.then(redraw);
  context.onScrub(() => moveCursor?.());
  context.scrubbable(card, {
    axis: "vertical",
    toKm: (fraction) => fraction * story.lengthKm,
    inset: { start: PAD_TOP, end: PAD_BOTTOM },
  });
  return card;
}

type Columns = { axis: number; profile: number; effort: number; sun: number; wind: number; aid: number; end: number };

function columnHeads(x: Columns, story: CourseStory): SVGGElement {
  const group = svg("g", {});
  const head = (at: number, width: number, title: string, scale: string) => {
    group.append(
      svg("text", { x: at + width / 2, y: PAD_TOP - 30, "text-anchor": "middle", class: "rb-head", text: title }),
      svg("text", { x: at + width / 2, y: PAD_TOP - 17, "text-anchor": "middle", class: "rb-head__scale", text: scale }),
      svg("line", { x1: at, y1: PAD_TOP - 10, x2: at + width, y2: PAD_TOP - 10, stroke: INK, "stroke-width": 0.8 }),
    );
  };
  head(x.profile, COLUMNS.profile, "Height", `${story.elevation.minM.toFixed(0)} to ${story.elevation.maxM.toFixed(0)} m`);
  head(x.effort, COLUMNS.effort, "Effort", "vs flat");
  head(x.sun, COLUMNS.sun, "In sun", "0 to 100%");
  head(x.wind, COLUMNS.wind, "Wind", "you run ↓");
  head(x.aid, COLUMNS.aid, "Aid", "");
  group.append(svg("text", { x: x.axis - 7, y: PAD_TOP - 17, "text-anchor": "end", class: "rb-head", text: "km" }));

  // One bracket over the three invented columns, stamped once.
  const from = x.sun;
  const to = x.aid + COLUMNS.aid;
  group.append(
    svg("path", { d: `M${from} ${PAD_TOP - 46}v-5H${to}v5`, fill: "none", class: "rb-stamp-line" }),
    svg("text", { x: (from + to) / 2, y: PAD_TOP - 56, "text-anchor": "middle", class: "rb-stamp-text", text: "sample values" }),
  );
  return group;
}

function kmAxis(axisX: number, endX: number, y: (km: number) => number, lengthKm: number): SVGGElement {
  const group = svg("g", {});
  group.append(svg("line", { x1: axisX, y1: y(0), x2: axisX, y2: y(lengthKm), stroke: INK, "stroke-width": 1.4 }));
  for (let km = 0; km <= lengthKm; km += 1) {
    const major = km % 5 === 0;
    group.append(svg("line", { x1: axisX - (major ? 6 : 3), y1: y(km), x2: axisX, y2: y(km), stroke: INK, "stroke-width": major ? 1.1 : 0.6 }));
    if (!major) continue;
    group.append(
      svg("text", { x: axisX - 9, y: y(km) + 3.5, "text-anchor": "end", class: "rb-km", text: String(km) }),
      svg("line", { x1: axisX, y1: y(km), x2: endX, y2: y(km), stroke: INK, "stroke-width": 0.4, "stroke-opacity": 0.28 }),
    );
  }
  return group;
}

/** Height drawn sideways off the axis. Where the survey has a gap, the line goes dashed and grey. */
function profileColumn(bins: StripBin[], left: number, y: (km: number) => number, story: CourseStory): SVGGElement {
  const group = svg("g", {});
  const x = linearScale(heightDomain(story), [left + 2, left + COLUMNS.profile]);

  for (const run of measuredRuns(bins, { bridgeGaps: true })) {
    if (run.bins.length < 2) continue;
    const line = run.bins.map((bin, index) => `${index === 0 ? "M" : "L"}${x(bin.elevationM).toFixed(1)} ${y(bin.midKm).toFixed(1)}`).join("");
    if (run.measured) {
      const area = `${line}L${left} ${y(run.bins[run.bins.length - 1].midKm).toFixed(1)}L${left} ${y(run.bins[0].midKm).toFixed(1)}Z`;
      group.append(
        svg("path", { d: area, fill: SEPIA, "fill-opacity": 0.2 }),
        svg("path", { d: line, fill: "none", stroke: INK, "stroke-width": 1.2, "stroke-linejoin": "round" }),
      );
    } else {
      group.append(svg("path", { d: line, fill: "none", stroke: GREY, "stroke-width": 1.2, "stroke-dasharray": "3 2.5" }));
    }
  }
  return group;
}

/** Energy cost against flat ground: bars right of the centre line are harder, left are easier. */
function effortColumn(bins: StripBin[], left: number, y: (km: number) => number): SVGGElement {
  const group = svg("g", {});
  const centre = left + COLUMNS.effort / 2;
  const reach = effortReach(bins);
  const half = COLUMNS.effort / 2;
  group.append(svg("line", { x1: centre, y1: y(bins[0].startKm), x2: centre, y2: y(bins[bins.length - 1].endKm), stroke: INK, "stroke-width": 0.6 }));

  for (const bin of bins) {
    const top = y(bin.startKm);
    const height = Math.max(1, y(bin.endKm) - top - 0.6);
    if (bin.difficulty === null) {
      group.append(svg("rect", { x: left, y: top, width: COLUMNS.effort, height, fill: GREY, "fill-opacity": 0.35 }));
      continue;
    }
    const length = (Math.abs(bin.difficulty - 1) / reach) * half;
    const harder = bin.difficulty >= 1;
    group.append(
      svg("rect", {
        x: harder ? centre : centre - length,
        y: top,
        width: length,
        height,
        fill: harder ? INK : SEPIA,
        "fill-opacity": harder ? 0.85 : 0.6,
      }),
    );
  }
  return group;
}

/** Sun exposure as the range it really is: certain sun in ochre, "only if the leaves are down" in green. */
function sunColumn(bins: StripBin[], left: number, y: (km: number) => number): SVGGElement {
  const group = svg("g", {});
  const x = linearScale([0, 100], [left, left + COLUMNS.sun]);
  group.append(
    svg("rect", {
      x: left,
      y: y(bins[0].startKm),
      width: COLUMNS.sun,
      height: y(bins[bins.length - 1].endKm) - y(bins[0].startKm),
      class: "rb-fill-blank",
    }),
  );
  for (const bin of bins) {
    const top = y(bin.startKm);
    const height = y(bin.endKm) - top + 0.3;
    if (bin.exposure === null) {
      group.append(svg("rect", { x: left, y: top, width: COLUMNS.sun, height, fill: GREY, "fill-opacity": 0.4 }));
      continue;
    }
    group.append(
      svg("rect", { x: left, y: top, width: x(bin.exposure.lowPercent) - left, height, class: "rb-fill-sun" }),
      svg("rect", {
        x: x(bin.exposure.lowPercent),
        y: top,
        width: x(bin.exposure.highPercent) - x(bin.exposure.lowPercent),
        height,
        class: "rb-fill-trees",
      }),
    );
  }
  for (const percent of [0, 50, 100]) {
    group.append(
      svg("line", {
        x1: x(percent),
        y1: y(bins[0].startKm),
        x2: x(percent),
        y2: y(bins[bins.length - 1].endKm),
        stroke: INK,
        "stroke-width": 0.5,
        "stroke-opacity": percent === 50 ? 0.35 : 0.8,
      }),
    );
  }
  return group;
}

/**
 * Wind as the runner meets it, drawn in the card's own frame: the course runs *down* the page, so
 * the runner does too. An arrow pointing up the page, against the way you read, is a headwind;
 * one pointing down with you is a tailwind. (Facing down the page, the runner's right is the
 * page's left — the same as reading a map with south at the top.)
 */
function windColumn(story: CourseStory, left: number, y: (km: number) => number): SVGGElement {
  const group = svg("g", {});
  const centre = left + COLUMNS.wind / 2;
  for (let km = 1; km < story.lengthKm; km += 2) {
    const { wind } = story.at(km);
    const { dx, dy } = windArrowOnPage(wind.angleDeg, "down");
    const reach = 9;
    const against = wind.headwindFraction > 0.5;
    const tip = { x: centre + dx * reach, y: y(km) + dy * reach };
    const tail = { x: centre - dx * reach, y: y(km) - dy * reach };
    const barb = (turn: number) => {
      const a = Math.atan2(dy, dx) + turn;
      return `L${(tip.x - Math.cos(a) * 5).toFixed(1)} ${(tip.y - Math.sin(a) * 5).toFixed(1)}`;
    };
    group.append(
      svg("path", {
        d: `M${tail.x.toFixed(1)} ${tail.y.toFixed(1)}L${tip.x.toFixed(1)} ${tip.y.toFixed(1)}${barb(0.5)}M${tip.x.toFixed(1)} ${tip.y.toFixed(1)}${barb(-0.5)}`,
        fill: "none",
        stroke: INK,
        "stroke-width": against ? 1.7 : 0.9,
        "stroke-linecap": "round",
      }),
    );
  }
  return group;
}

/** Ring: water. Half-filled: a sports drink too. Filled: gels as well. */
function aidColumn(story: CourseStory, left: number, y: (km: number) => number): SVGGElement {
  const group = svg("g", {});
  const cx = left + COLUMNS.aid / 2;
  for (const station of story.aidStations) {
    const cy = y(station.km);
    group.append(svg("circle", { cx, cy, r: 5, class: "rb-aid" }));
    if (station.offers.includes("gel")) group.append(svg("circle", { cx, cy, r: 5, fill: INK }));
    else if (station.offers.includes("sports drink")) group.append(svg("path", { d: `M${cx} ${cy - 5}a5 5 0 0 1 0 10Z`, fill: INK }));
  }
  return group;
}

/** A leader drawn the way a hand draws one: not quite straight, with a quick arrowhead. */
function pencilLeader(fromX: number, fromY: number, toX: number, toY: number): SVGPathElement {
  const bow = Math.min(14, Math.abs(toY - fromY) * 0.35 + 5);
  const midX = (fromX + toX) / 2;
  const angle = Math.atan2(toY - (fromY + toY) / 2 + bow, toX - midX);
  const barb = (turn: number) => `M${toX} ${toY}L${(toX - Math.cos(angle + turn) * 7).toFixed(1)} ${(toY - Math.sin(angle + turn) * 7).toFixed(1)}`;
  return svg("path", {
    d: `M${fromX} ${fromY}Q${midX} ${(fromY + toY) / 2 - bow} ${toX} ${toY}${barb(0.45)}${barb(-0.45)}`,
    stroke: PENCIL,
    "stroke-width": 1.2,
    "stroke-linecap": "round",
  });
}

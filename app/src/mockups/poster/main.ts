// Direction B — Race poster.
//
// One colour, and it is the blue line: both Berlin and New York paint one down the road to mark
// the course, so blue here means exactly one thing — the course and where you are on it.
// Everything else is black and white on a strict twelve-column grid, with numerals big enough to
// read from across the room.
//
// The measured/subjective split is the oldest one in graphic design: **solid is measured, hollow
// is hearsay.** Invented sample layers wear hazard stripes. Flat ink works either way up, so this
// direction follows the system's light or dark theme.
import "@fontsource-variable/archivo/wdth.css";
import "./poster.css";

import { type Entry, type Field, entriesNear, headlineFields, layerFields } from "../content";
import { buildCredits } from "../credits";
import * as show from "../format";
import { heightDomain, linearScale, spreadLabels } from "../layout";
import { type MaquetteStyle, renderMaquette } from "../maquette";
import { type MockupContext, startMockup } from "../shell";
import type { CourseStory, StripBin } from "../story";
import { drawToFit, html, link, perFrame, svg } from "../svg";

const NOTE_HEADINGS = { gps: "Watch trouble", crowd: "Crowd", surface: "Underfoot" } as const;

/** How many of the twelve columns each fact gets. Long sentences get room; numbers don't need it. */
const FIELD_SPAN: Record<string, number> = { elevation: 1, grade: 1, difficulty: 2, sun: 2, exposure: 2, wind: 2, aid: 2 };

const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

/** Shadows are solid black in either theme — a poster has no half-tones. */
function maquetteStyle(): MaquetteStyle {
  const blue = darkScheme.matches ? "#5a7dff" : "#1546ff";
  return darkScheme.matches
    ? { ground: "#8a8a86", street: "#a3a39f", roof: "#f4f4f0", wallLit: "#d2d2ce", wallShaded: "#777", outline: "#000", outlineWidth: 0.5, shadow: "#000", shadowOpacity: 1, courseLine: blue, runner: blue }
    : { ground: "#dededa", street: "#f4f4f0", roof: "#fff", wallLit: "#fff", wallShaded: "#9a9a96", outline: "#000", outlineWidth: 0.5, shadow: "#000", shadowOpacity: 1, courseLine: blue, runner: blue };
}

startMockup({ id: "poster", mount });

function mount(stage: HTMLElement, context: MockupContext): void {
  const { story } = context;
  stage.className = "ps";

  const kmWhole = html("span", { class: "ps-km__whole" });
  const kmPart = html("span", { class: "ps-km__part" });
  const clock = html("div", { class: "ps-cell ps-clock" });
  const elapsed = html("div", { class: "ps-cell ps-elapsed" });
  const next = html("ul", { class: "ps-next__list" });
  const model = html("div", { class: "ps-model__drawing" });
  const modelCaption = html("p", { class: "ps-model__caption" });
  const facts = html("div", { class: "ps-facts" });

  stage.append(
    banner(story),
    html(
      "section",
      { class: "ps-main" },
      html("div", { class: "ps-cell ps-km", "aria-live": "off" }, html("span", { class: "ps-km__number" }, kmWhole, kmPart), html("span", { class: "ps-km__unit", text: "km" })),
      clock,
      elapsed,
      html("div", { class: "ps-cell ps-model" }, model, modelCaption),
    ),
    facts,
    strip(context),
    html("section", { class: "ps-next" }, html("h2", { class: "ps-cell", text: "Coming up" }), next),
    legend(),
    buildCredits(story, "ps", "Flat ink works either way up: this direction follows your system's light or dark theme."),
  );

  const seed = story.course.id === "nyc" ? 7 : 3;
  const update = () => {
    const readout = story.at(context.km);
    const [km, clockField, elapsedField] = headlineFields(story, readout);

    const [whole, part] = km.value.split(".");
    kmWhole.textContent = whole;
    kmPart.textContent = `.${part}`;
    clock.replaceChildren(...bigNumber(clockField));
    elapsed.replaceChildren(...bigNumber(elapsedField));
    next.replaceChildren(...entriesNear(story, context.km).map((entry) => nextItem(entry, context.km)));
    facts.replaceChildren(...layerFields(story, readout).map(factCell));

    model.replaceChildren(
      renderMaquette({
        positionM: readout.km * 1000,
        headingDeg: readout.headingDeg,
        sun: readout.sun,
        seed,
        view: { acrossM: 92, aheadM: 120, behindM: 50, maxHeightM: story.course.id === "nyc" ? 64 : 30 },
        style: maquetteStyle(),
      }),
    );
    modelCaption.textContent = readout.sun.isUp
      ? `Invented buildings, real light. Sun ${show.sunWords(readout)} at ${readout.clock}.`
      : `Invented buildings. At ${readout.clock} the sun is down: no shadows.`;
  };
  context.onScrub(perFrame(update));
  darkScheme.addEventListener("change", update);
  update();
}

function banner(story: CourseStory): HTMLElement {
  const date = html("span", { class: "ps-banner__item", text: show.raceDate(story.edition.date) });
  if (!story.edition.dateVerified) date.append(html("small", { title: story.edition.dateNote, text: " unconfirmed" }));
  return html(
    "header",
    { class: "ps-banner" },
    html("h1", { text: story.course.name }),
    date,
    html("span", { class: "ps-banner__item" }, `${story.edition.waveLabel.split(" · ")[0]} starts ${story.edition.waveStartLocal} `, tape()),
    html("span", { class: "ps-banner__item", text: `Goal ${show.formatElapsed(story.clock.elapsedSecondsAtKm(story.lengthKm))} at ${show.formatPace(story.clock.goalPaceSecondsPerKm)}/km` }),
  );
}

function bigNumber(field: Field): HTMLElement[] {
  const value = html("span", { class: "ps-big__value", text: field.value });
  if (field.detail) value.append(html("small", { text: ` ${field.detail}` }));
  return [value, html("span", { class: "ps-big__label", text: field.label }), html("span", { class: "ps-big__assumption", text: field.assumption ?? "" })];
}

function factCell(field: Field): HTMLElement {
  const cell = html("div", { class: "ps-cell ps-fact", style: `grid-column: span ${FIELD_SPAN[field.key] ?? 2}`, "data-unknown": field.unknown });
  const label = html("span", { class: "ps-fact__label", text: field.label });
  if (field.sample) label.append(" ", tape());
  const small = field.unknown && field.key === "elevation" ? "not measured here" : (field.detail ?? field.assumption ?? "");
  cell.append(label, html("span", { class: "ps-fact__value", text: field.value }), html("span", { class: "ps-fact__small", title: field.detail ?? field.assumption, text: small }));
  return cell;
}

function nextItem(entry: Entry, km: number): HTMLElement {
  const item = html("li", { class: `ps-next__item ps-next__item--${entry.provenance}` });
  const distance = entry.km - km;
  const where = Math.abs(distance) < 0.05 ? "here" : distance > 0 ? `in ${show.km(distance)} km` : `${show.km(-distance)} km back`;
  const title = entry.kind === "note" ? `Runners say: ${NOTE_HEADINGS[entry.title as keyof typeof NOTE_HEADINGS].toLowerCase()}` : entry.kind === "aid" ? "Aid station" : entry.title;

  const head = html("span", { class: "ps-next__head" }, html("b", { text: title }), html("span", { text: where }));
  item.append(head);
  if (entry.kind !== "landmark") item.append(html("span", { class: "ps-next__detail", text: entry.detail }));
  if (entry.source) item.append(link(entry.source, "Source", "ps-next__source"));
  if (entry.sample) item.append(tape());
  return item;
}

function legend(): HTMLElement {
  const solid = svg("svg", { width: 30, height: 18, viewBox: "0 0 30 18", "aria-hidden": true }, svg("rect", { x: 1, y: 1, width: 28, height: 16, class: "ps-solid" }));
  const hollow = svg("svg", { width: 30, height: 18, viewBox: "0 0 30 18", "aria-hidden": true }, svg("rect", { x: 1.5, y: 1.5, width: 27, height: 15, class: "ps-hollow" }));
  const struck = html("span", { class: "ps-legend__struck", text: "75 m" });
  const rows: [Node, string, string][] = [
    [solid, "Solid is measured", "or computed from measurements by a published model. Sources are in the credits."],
    [hollow, "Hollow is hearsay", "what runners report. Worth knowing, never checked, never mixed into a number."],
    [struck, "Grey and struck is a gap", "the survey has nothing at this spot, so the value is a fill-in and says so."],
    [tape(), "Stripes are stand-ins", "invented values for layers that aren't built yet. They show layout, not the course."],
  ];
  const box = html("section", { class: "ps-legend", "aria-label": "How to read this poster" });
  for (const [mark, title, rest] of rows) box.append(html("div", { class: "ps-cell ps-legend__cell" }, html("span", { class: "ps-legend__mark" }, mark), html("p", {}, html("b", { text: `${title}: ` }), rest)));
  return box;
}

function tape(): HTMLElement {
  return html("span", { class: "ps-tape", text: "sample" });
}

// ── The strip ───────────────────────────────────────────────────────────────────────────────

const GUTTER = 132;
const RIGHT_PAD = 74;
const LABEL_BAND = 124;

interface Row {
  id: "height" | "effort" | "sun" | "wind" | "aid" | "say" | "line";
  label: string;
  weight: number;
  sample?: boolean;
  hollow?: boolean;
}

const ROWS: Row[] = [
  { id: "height", label: "Height", weight: 3 },
  { id: "effort", label: "Effort vs flat", weight: 1.5 },
  { id: "sun", label: "In the sun", weight: 2, sample: true },
  { id: "wind", label: "Wind", weight: 1.3, sample: true },
  { id: "aid", label: "Aid", weight: 1.3, sample: true },
  { id: "say", label: "Runners say", weight: 1.2, sample: true, hollow: true },
  { id: "line", label: "", weight: 1.7 },
];

function strip(context: MockupContext): HTMLElement {
  const { story } = context;
  const section = html("section", { class: "ps-strip", "aria-label": "The course, kilometre by kilometre" });
  let moveCursor: (() => void) | undefined;

  drawToFit(section, (width, height) => {
    const x = linearScale([0, story.lengthKm], [GUTTER, width - RIGHT_PAD]);
    const bins = story.strip(Math.max(60, Math.round((width - GUTTER - RIGHT_PAD) / 5)));
    const node = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "ps-strip__svg" });

    const unit = (height - LABEL_BAND - 8) / ROWS.reduce((sum, row) => sum + row.weight, 0);
    let top = LABEL_BAND;
    const band = new Map<Row["id"], { top: number; height: number }>();
    for (const row of ROWS) {
      band.set(row.id, { top, height: row.weight * unit });
      if (row.label) {
        const middle = top + (row.weight * unit) / 2;
        node.append(svg("text", { x: 20, y: middle + 4.5, class: row.hollow ? "ps-row ps-row--hollow" : "ps-row", text: row.label }));
        if (row.sample) node.append(svg("rect", { x: 6, y: top + 2, width: 7, height: row.weight * unit - 4, fill: "url(#ps-stripes)" }));
        node.append(svg("line", { x1: 0, y1: top, x2: width, y2: top, class: "ps-rule" }));
      }
      top += row.weight * unit;
    }
    const at = (id: Row["id"]) => band.get(id) as { top: number; height: number };

    node.append(
      svg(
        "defs",
        {},
        svg("pattern", { id: "ps-stripes", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, svg("rect", { width: 3, height: 6, class: "ps-solid" })),
        svg("pattern", { id: "ps-hatch", width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, svg("rect", { width: 1.6, height: 5, class: "ps-solid" })),
      ),
      landmarkLabels(story, x),
      heightRow(bins, x, at("height"), story),
      effortRow(bins, x, at("effort")),
      sunRow(bins, x, at("sun")),
      windRow(story, x, at("wind")),
      aidRow(story, x, at("aid")),
      sayRow(story, x, at("say")),
      blueLine(story, x, at("line")),
    );

    const cursor = svg("g", { class: "ps-cursor" });
    const flag = svg("text", { x: 0, y: 18, "text-anchor": "middle", class: "ps-cursor__km" });
    cursor.append(
      svg("rect", { x: -27, y: 2, width: 54, height: 22, class: "ps-cursor__flag" }),
      flag,
      svg("rect", { x: -1.5, y: 24, width: 3, height: height - 24, class: "ps-cursor__bar" }),
    );
    node.append(cursor);
    moveCursor = () => {
      cursor.setAttribute("transform", `translate(${x(context.km).toFixed(1)} 0)`);
      flag.textContent = context.km.toFixed(1);
    };
    moveCursor();
    section.replaceChildren(node);
  });

  context.onScrub(() => moveCursor?.());
  context.scrubbable(section, {
    axis: "horizontal",
    toKm: (fraction) => fraction * story.lengthKm,
    toFraction: (km) => km / story.lengthKm,
    inset: { start: GUTTER, end: RIGHT_PAD },
  });
  return section;
}

type Band = { top: number; height: number };
type X = (km: number) => number;

/** Names set on the diagonal, the way a timetable poster does. Bracketed asides are dropped here. */
function landmarkLabels(story: CourseStory, x: X): SVGGElement {
  const group = svg("g", {});
  const centres = spreadLabels(story.landmarks.map((landmark) => ({ at: x(landmark.km), size: 15 })), { min: GUTTER, max: x(story.lengthKm) + 8 }, 0);
  story.landmarks.forEach((landmark, index) => {
    const at = x(landmark.km);
    const anchor = centres[index];
    group.append(
      svg("path", { d: `M${at.toFixed(1)} ${LABEL_BAND}V${LABEL_BAND - 6}L${anchor.toFixed(1)} ${LABEL_BAND - 13}`, class: "ps-tick" }),
      svg("text", { transform: `translate(${(anchor + 3).toFixed(1)} ${LABEL_BAND - 16}) rotate(-48)`, class: "ps-landmark", text: show.shortName(landmark.name) }, svg("title", { text: landmark.name })),
    );
  });
  return group;
}

/** A solid silhouette. Where the survey has a gap the silhouette is hatched, not filled. */
function heightRow(bins: StripBin[], x: X, band: Band, story: CourseStory): SVGGElement {
  const group = svg("g", {});
  const y = linearScale(heightDomain(story), [band.top + band.height, band.top + 5]);
  const floor = band.top + band.height;
  for (const measured of [true, false]) {
    let run: StripBin[] = [];
    const flush = () => {
      if (run.length > 0) {
        const outline = run.map((bin) => `L${x(bin.startKm).toFixed(1)} ${y(bin.elevationM).toFixed(1)}L${x(bin.endKm).toFixed(1)} ${y(bin.elevationM).toFixed(1)}`).join("");
        group.append(svg("path", { d: `M${x(run[0].startKm).toFixed(1)} ${floor}${outline}L${x(run[run.length - 1].endKm).toFixed(1)} ${floor}Z`, class: measured ? "ps-solid" : "ps-gap" }));
      }
      run = [];
    };
    for (const bin of bins) {
      if (bin.elevationMeasured === measured) run.push(bin);
      else flush();
    }
    flush();
  }
  group.append(
    svg("text", { x: GUTTER - 8, y: band.top + 12, "text-anchor": "end", class: "ps-scale", text: `${story.elevation.maxM.toFixed(0)} m` }),
    svg("text", { x: GUTTER - 8, y: floor - 4, "text-anchor": "end", class: "ps-scale", text: `${story.elevation.minM.toFixed(0)} m` }),
  );
  return group;
}

/** Bars above the midline cost more energy than flat ground; bars below cost less. */
function effortRow(bins: StripBin[], x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const middle = band.top + band.height / 2;
  const reach = Math.max(0.08, ...bins.map((bin) => Math.abs((bin.difficulty ?? 1) - 1)));
  for (const bin of bins) {
    const left = x(bin.startKm);
    const width = Math.max(1, x(bin.endKm) - left - 1);
    if (bin.difficulty === null) {
      group.append(svg("rect", { x: left, y: band.top + 3, width, height: band.height - 6, class: "ps-gap" }));
      continue;
    }
    const length = (Math.abs(bin.difficulty - 1) / reach) * (band.height / 2 - 3);
    group.append(svg("rect", { x: left, y: bin.difficulty >= 1 ? middle - length : middle, width, height: Math.max(0.8, length), class: "ps-solid" }));
  }
  return group;
}

/** Solid up to the sun you get whatever the trees do; hatched above it for the part that depends on leaves. */
function sunRow(bins: StripBin[], x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const y = linearScale([0, 100], [band.top + band.height, band.top + 3]);
  for (const bin of bins) {
    const left = x(bin.startKm);
    const width = x(bin.endKm) - left + 0.4;
    if (bin.exposure === null) continue;
    group.append(
      svg("rect", { x: left, y: y(bin.exposure.lowPercent), width, height: y(0) - y(bin.exposure.lowPercent), class: "ps-solid" }),
      svg("rect", { x: left, y: y(bin.exposure.highPercent), width, height: y(bin.exposure.lowPercent) - y(bin.exposure.highPercent), fill: "url(#ps-hatch)" }),
    );
  }
  group.append(svg("text", { x: GUTTER - 8, y: band.top + 12, "text-anchor": "end", class: "ps-scale", text: "100%" }));
  return group;
}

/**
 * Wind as the runner meets it. The strip runs the way the runner runs — left to right — so a
 * wedge pointing left, back at the runner, is a headwind. Bigger wedge, more of it in your face.
 */
function windRow(story: CourseStory, x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const cy = band.top + band.height / 2;
  for (let km = 1; km < story.lengthKm; km += 2) {
    const { wind } = story.at(km);
    // Direction of travel in the runner's frame (ahead = right across the page, right = down it).
    const turn = wind.angleDeg + 180;
    const size = band.height * (0.3 + 0.16 * Math.abs(wind.headwindFraction));
    const wedge = `M${size} 0L${-size * 0.8} ${-size * 0.62}L${-size * 0.8} ${size * 0.62}Z`;
    group.append(svg("path", { d: wedge, transform: `translate(${x(km).toFixed(1)} ${cy.toFixed(1)}) rotate(${turn.toFixed(0)})`, class: "ps-solid" }));
  }
  return group;
}

/** One square per thing on the table: water, then sports drink, then gels. */
function aidRow(story: CourseStory, x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const side = Math.min(8, (band.height - 6) / 3);
  for (const station of story.aidStations) {
    station.offers.forEach((_, index) => {
      group.append(svg("rect", { x: x(station.km) - side / 2, y: band.top + band.height - 3 - (index + 1) * side - index * 1.5, width: side, height: side, class: "ps-solid" }));
    });
  }
  return group;
}

function sayRow(story: CourseStory, x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const cy = band.top + band.height / 2;
  const r = Math.min(8, band.height / 2 - 3);
  for (const note of story.notes) {
    group.append(svg("path", { d: `M${x(note.km)} ${cy - r}l${r} ${r}l${-r} ${r}l${-r} ${-r}Z`, class: "ps-hollow" }, svg("title", { text: `${NOTE_HEADINGS[note.kind]}: ${note.text}` })));
  }
  return group;
}

function blueLine(story: CourseStory, x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const y = band.top + 9;
  group.append(svg("rect", { x: x(0), y: y - 4, width: x(story.lengthKm) - x(0), height: 8, class: "ps-blue" }));
  for (let km = 0; km <= story.lengthKm; km += 5) {
    group.append(
      svg("rect", { x: x(km) - 1, y: y - 4, width: 2, height: 8, class: "ps-notch" }),
      svg("text", { x: x(km), y: y + 24, "text-anchor": "middle", class: "ps-km-tick", text: String(km) }),
    );
  }
  group.append(svg("text", { x: 20, y: y + 5, class: "ps-row ps-row--blue", text: "The blue line, km" }));
  return group;
}

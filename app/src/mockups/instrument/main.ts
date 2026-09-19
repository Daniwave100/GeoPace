// Direction C — Field instrument.
//
// The model is a well log: the chart a geologist reads a borehole from. Parallel tracks share one
// depth axis — here, kilometres — and each track's header carries its name, its scale, and the
// value under the cursor. One hairline crosses every track, so a glance down it is the whole
// story of that kilometre. The type is B612, drawn for aircraft cockpit displays: it exists to be
// read quickly, small, and without mistakes.
//
// Measured tracks are upright type and solid line. Runner reports sit below a double rule, in
// italic, with dashed open markers — a different channel, not a different colour of the same one.
// Cool greys throughout; the single warm colour is the cursor, in the orange of survey gear.
// A dark instrument is the glass HUD this project refuses to be, so this direction stays light.
import "@fontsource/b612/latin-400.css";
import "@fontsource/b612/latin-400-italic.css";
import "@fontsource/b612/latin-700.css";
import "./instrument.css";

import { type Entry, type Field, NOTE_HEADINGS, entriesNear, headlineFields, layerFields } from "../content";
import { buildCredits } from "../credits";
import * as show from "../format";
import { assignLanes, effortReach, heightDomain, linearScale, measuredRuns } from "../../core/layout";
import { type MaquetteStyle, renderMaquette } from "../maquette";
import { type MockupContext, startMockup } from "../shell";
import type { CourseStory, Readout, StripBin } from "../story";
import { drawToFit, html, link, perFrame, svg } from "../../svg";

const INK = "#17212a";
const RULE = "#aab5be";
const TRACE = "#23607a";
const CURSOR = "#e8590c";
const GREY = "#8b96a0";

const MAQUETTE_STYLE: MaquetteStyle = {
  ground: "#dfe5e9",
  street: "#eef2f4",
  roof: "#fbfcfd",
  wallLit: "#f1f4f6",
  wallShaded: "#c3ccd3",
  outline: "#5b6873",
  outlineWidth: 0.22,
  shadow: "#31424f",
  shadowOpacity: 0.5,
  courseLine: TRACE,
  runner: CURSOR,
  annotation: "#3d4a55",
};

startMockup({ id: "instrument", mount });

function mount(stage: HTMLElement, context: MockupContext): void {
  const { story } = context;
  stage.className = "fi";

  const displays = html("div", { class: "fi-displays" });
  const footnotes = html("p", { class: "fi-footnotes" });
  const viewport = html("div", { class: "fi-viewport__drawing" });
  const viewportNote = html("p", { class: "fi-panel__note" });
  const sky = html("div", { class: "fi-sky" });
  const table = html("table", { class: "fi-table" });
  const nearby = html("ul", { class: "fi-nearby" });

  stage.append(
    html("header", { class: "fi-head" }, html("div", { class: "fi-head__row" }, identity(story), displays), footnotes),
    html(
      "div",
      { class: "fi-body" },
      tracks(context),
      html(
        "aside",
        { class: "fi-side" },
        panel("Street model", viewport, viewportNote),
        panel("Sky over the runner", sky),
        panel("At the cursor", table),
        panel("Within 2.5 km", nearby),
      ),
    ),
    key(),
    buildCredits(
      story,
      "fi",
      "A dark instrument panel is the look this project set out to avoid, so this direction stays light in either system theme.",
    ),
  );

  const sunTrack = sunAlongTheRace(story);
  const update = () => {
    const readout = story.at(context.km);
    const headline = headlineFields(story, readout);
    displays.replaceChildren(...headline.map(display));
    // The assumptions behind a starred display are printed, not left in a tooltip.
    footnotes.textContent = headline
      .filter((field) => field.assumption)
      .map((field) => `* ${field.label}: ${field.assumption}.`)
      .join("  ");
    table.replaceChildren(...layerFields(story, readout).map(tableRow));
    const entries = entriesNear(story, context.km);
    nearby.replaceChildren(...entries.map((entry) => nearbyItem(entry, context.km)));

    viewport.replaceChildren(
      renderMaquette({
        positionM: readout.km * 1000,
        headingDeg: readout.headingDeg,
        sun: readout.sun,
        seed: story.massing.seed,
        view: { acrossM: 100, aheadM: 118, behindM: 46, maxHeightM: story.massing.maxHeightM },
        style: MAQUETTE_STYLE,
      }),
    );
    viewportNote.textContent = readout.sun.isUp
      ? `Massing invented. Light computed: sun ${readout.sun.altitudeDeg.toFixed(1)}° up, bearing ${readout.sun.azimuthDeg.toFixed(0)}° (${show.compass(readout.sun.azimuthDeg)}).`
      : "Massing invented. Sun below the horizon: no shadows.";
    sky.replaceChildren(skyDial(readout, sunTrack), skyLegend(readout));
  };
  context.onScrub(perFrame(update));
  update();
}

function identity(story: CourseStory): HTMLElement {
  const date = html("span", { text: show.raceDate(story.edition.date) });
  if (!story.edition.dateConfirmed) date.append(html("i", { title: story.edition.dateNote, text: " (unconfirmed)" }));
  const carriedOver = story.edition.carriedOver;
  return html(
    "div",
    { class: "fi-identity" },
    html("h1", { text: story.course.name }),
    html(
      "p",
      {},
      date,
      html(
        "span",
        {},
        `${story.edition.waveLabel} ${story.edition.waveStartLocal}`,
        ...(carriedOver ? [html("i", { title: carriedOver.reason, text: ` (carried over from ${carriedOver.fromEdition})` })] : []),
      ),
      html("span", {
        text: `goal ${show.formatElapsed(story.clock.elapsedSecondsAtKm(story.lengthKm))}, ${show.formatPace(story.clock.goalPaceSecondsPerKm)}/km even`,
      }),
      html("span", { text: `line ${story.lengthKm.toFixed(2)} km, +${story.elevation.gainM.toFixed(0)} m −${story.elevation.lossM.toFixed(0)} m` }),
    ),
  );
}

function display(field: Field): HTMLElement {
  const value = html("span", { class: "fi-display__value", text: field.value });
  if (field.detail) value.append(html("small", { text: ` ${field.detail}` }));
  return html(
    "div",
    { class: "fi-display" },
    value,
    html("span", { class: "fi-display__label", text: field.assumption ? `${field.label} *` : field.label }),
  );
}

function panel(title: string, ...body: HTMLElement[]): HTMLElement {
  return html("section", { class: "fi-panel" }, html("h2", { text: title }), ...body);
}

function tableRow(field: Field): HTMLElement {
  const value = html("td", { text: field.value });
  if (field.unknownNote) value.append(html("i", { text: field.unknownNote }));
  if (field.sample) value.append(" ", tag());
  return html(
    "tr",
    { "data-unknown": field.unknown, title: [field.detail, field.assumption].filter(Boolean).join(" · ") || undefined },
    html("th", { scope: "row", text: field.label }),
    value,
  );
}

function nearbyItem(entry: Entry, km: number): HTMLElement {
  const item = html("li", { class: `fi-nearby__item fi-nearby__item--${entry.provenance}` });
  const offset = entry.km - km;
  item.append(html("span", { class: "fi-nearby__km", text: `${offset >= 0 ? "+" : "−"}${show.km(Math.abs(offset))}` }));
  const body = html("span", {});
  if (entry.kind === "landmark") body.append(html("b", { text: entry.title }));
  else body.append(html("b", { text: `${entry.title}. ` }), entry.detail);
  if (entry.source) body.append(" ", link(entry.source, "source"));
  if (entry.sample) body.append(" ", tag());
  item.append(body);
  return item;
}

function key(): HTMLElement {
  const line = (dashed: boolean) =>
    svg(
      "svg",
      { width: 44, height: 12, viewBox: "0 0 44 12", "aria-hidden": true },
      svg("path", {
        d: "M1 8L12 4L22 7L32 3L43 6",
        fill: "none",
        stroke: dashed ? GREY : TRACE,
        "stroke-width": 1.3,
        "stroke-dasharray": dashed ? "3 2.5" : undefined,
      }),
    );
  const diamond = svg(
    "svg",
    { width: 44, height: 12, viewBox: "0 0 44 12", "aria-hidden": true },
    svg("path", { d: "M22 1l5 5l-5 5l-5-5Z", class: "fi-report-mark" }),
  );
  const rows: [Node, string][] = [
    [line(false), "Solid trace, upright type: measured, or computed from measurements by a published model."],
    [line(true), "Dashed grey: no measurement at this spot. The value is a fill-in, shown struck through."],
    [diamond, "Open dashed marker, italic type, below the double rule: a runner's report. Never checked, never averaged in."],
    [tag(), "Invented values standing in for a layer that isn't built yet."],
  ];
  const box = html("section", { class: "fi-key", "aria-label": "Key" });
  for (const [mark, text] of rows)
    box.append(html("div", { class: "fi-key__row" }, html("span", { class: "fi-key__mark" }, mark), html("span", { text })));
  return box;
}

function tag(): HTMLElement {
  return html("span", { class: "fi-tag", text: "sample" });
}

// ── Sky dial ────────────────────────────────────────────────────────────────────────────────

interface SkyPoint {
  km: number;
  altitudeDeg: number;
  azimuthDeg: number;
}

/** Where the sun is each half-kilometre, at the minute the runner gets there. */
function sunAlongTheRace(story: CourseStory): SkyPoint[] {
  const track: SkyPoint[] = [];
  for (let km = 0; km <= story.lengthKm; km += 0.5) {
    const { sun } = story.at(km);
    track.push({ km, altitudeDeg: sun.altitudeDeg, azimuthDeg: sun.azimuthDeg });
  }
  return track;
}

const DIAL = 172;
const DIAL_R = 66;

/** The sky seen from above: north up, horizon at the rim, straight overhead at the centre. */
function skyPoint(altitudeDeg: number, azimuthDeg: number): { x: number; y: number } {
  const r = ((90 - Math.max(0, altitudeDeg)) / 90) * DIAL_R;
  const a = azimuthDeg * (Math.PI / 180);
  return { x: DIAL / 2 + r * Math.sin(a), y: DIAL / 2 - r * Math.cos(a) };
}

function skyDial(readout: Readout, track: SkyPoint[]): SVGSVGElement {
  const c = DIAL / 2;
  const node = svg("svg", {
    class: "fi-sky__dial",
    width: DIAL,
    height: DIAL,
    viewBox: `0 0 ${DIAL} ${DIAL}`,
    role: "img",
    "aria-label": "Sun position, running direction and wind direction, seen from above",
  });

  for (const altitude of [0, 30, 60])
    node.append(
      svg("circle", {
        cx: c,
        cy: c,
        r: ((90 - altitude) / 90) * DIAL_R,
        fill: "none",
        stroke: altitude === 0 ? INK : RULE,
        "stroke-width": altitude === 0 ? 0.9 : 0.6,
      }),
    );
  node.append(svg("path", { d: `M${c} ${c - DIAL_R}V${c + DIAL_R}M${c - DIAL_R} ${c}H${c + DIAL_R}`, stroke: RULE, "stroke-width": 0.6 }));
  for (const [label, azimuth] of [
    ["N", 0],
    ["E", 90],
    ["S", 180],
    ["W", 270],
  ] as const) {
    const a = azimuth * (Math.PI / 180);
    node.append(
      svg("text", {
        x: c + (DIAL_R + 10) * Math.sin(a),
        y: c - (DIAL_R + 10) * Math.cos(a) + 3.5,
        "text-anchor": "middle",
        class: "fi-sky__cardinal",
        text: label,
      }),
    );
  }

  const lit = track.filter((point) => point.altitudeDeg > 0);
  if (lit.length > 1) {
    const path = lit
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${skyPoint(point.altitudeDeg, point.azimuthDeg).x.toFixed(1)} ${skyPoint(point.altitudeDeg, point.azimuthDeg).y.toFixed(1)}`,
      )
      .join("");
    node.append(svg("path", { d: path, fill: "none", stroke: TRACE, "stroke-width": 1.4 }));
  }

  // Which way the runner is heading: a line from the centre, arrowhead at the rim.
  const heading = readout.headingDeg * (Math.PI / 180);
  const tip = { x: c + (DIAL_R - 4) * Math.sin(heading), y: c - (DIAL_R - 4) * Math.cos(heading) };
  node.append(
    svg("line", { x1: c, y1: c, x2: tip.x, y2: tip.y, stroke: INK, "stroke-width": 1.1 }),
    svg("path", {
      d: "M0 -5L3.4 3L-3.4 3Z",
      fill: INK,
      transform: `translate(${tip.x.toFixed(1)} ${tip.y.toFixed(1)}) rotate(${readout.headingDeg.toFixed(0)})`,
    }),
  );

  // Wind: a wedge on the rim at the bearing it blows FROM, pointing the way it travels — inward.
  node.append(
    svg("path", {
      d: `M0 ${-DIAL_R + 9}L5 ${-DIAL_R - 3}L-5 ${-DIAL_R - 3}Z`,
      class: "fi-sky__wind",
      transform: `translate(${c} ${c}) rotate(${readout.wind.fromDeg.toFixed(0)})`,
    }),
  );

  if (readout.sun.isUp) {
    const sun = skyPoint(readout.sun.altitudeDeg, readout.sun.azimuthDeg);
    node.append(svg("circle", { cx: sun.x, cy: sun.y, r: 4.5, fill: CURSOR, stroke: "#fff", "stroke-width": 1.2 }));
  }
  return node;
}

function skyLegend(readout: Readout): HTMLElement {
  const row = (mark: string, label: string, value: string, sample = false) => {
    const item = html(
      "li",
      {},
      html("span", { class: `fi-sky__mark fi-sky__mark--${mark}` }),
      html("span", { class: "fi-sky__label", text: label }),
      html("b", { text: value }),
    );
    if (sample) item.append(tag());
    return item;
  };
  return html(
    "ul",
    { class: "fi-sky__legend" },
    row("sun", "Sun now", readout.sun.isUp ? `${readout.sun.altitudeDeg.toFixed(0)}° up, ${show.compass(readout.sun.azimuthDeg)}` : "down"),
    row("track", "Sun over the whole race", "start to finish"),
    row("heading", "You are running", `${show.compass(readout.headingDeg)} (${readout.headingDeg.toFixed(0)}°)`),
    row("wind", "Wind blows from", `${show.compass(readout.wind.fromDeg)} (${readout.wind.fromDeg.toFixed(0)}°)`, true),
  );
}

// ── Tracks ──────────────────────────────────────────────────────────────────────────────────

const HEAD_WIDTH = 178;
const RIGHT_PAD = 18;
const AXIS_HEIGHT = 30;
const DIVIDER = 16;

interface Track {
  id: "landmarks" | "elevation" | "effort" | "sun" | "wind" | "aid" | "reports";
  name: string;
  scale: (story: CourseStory) => string;
  weight: number;
  sample: boolean;
  subjective?: boolean;
  value: (story: CourseStory, readout: Readout, km: number) => { text: string; unknown?: boolean };
}

const TRACKS: Track[] = [
  {
    id: "landmarks",
    name: "Landmarks",
    scale: () => "sourced in the bundle",
    weight: 2.1,
    sample: false,
    value: (story, _readout, km) => {
      const next = story.landmarks.find((landmark) => landmark.km >= km);
      return { text: next ? `+${show.km(next.km - km)} ${show.shortName(next.name, 20)}` : "finished" };
    },
  },
  {
    id: "elevation",
    name: "Elevation",
    scale: (story) => `m, ${story.elevation.minM.toFixed(0)} to ${story.elevation.maxM.toFixed(0)}`,
    weight: 3,
    sample: false,
    value: (_story, readout) => ({
      text: `${show.metres(readout.elevationM)}  ${show.grade(readout.gradePercent)}`,
      unknown: !readout.elevationMeasured,
    }),
  },
  {
    id: "effort",
    name: "Effort",
    scale: () => "× flat ground, Minetti",
    weight: 1.7,
    sample: false,
    value: (_story, readout) => ({ text: show.difficulty(readout.difficulty), unknown: readout.difficulty === null }),
  },
  {
    id: "sun",
    name: "In the sun",
    scale: () => "%, trees in leaf to bare",
    weight: 2,
    sample: true,
    value: (_story, readout) => ({ text: show.exposure(readout.exposure) }),
  },
  {
    id: "wind",
    name: "Headwind",
    scale: () => "m/s, + against you",
    weight: 1.8,
    sample: true,
    value: (_story, readout) => {
      const component = readout.wind.headwindFraction * readout.wind.speedMs;
      return { text: `${component >= 0 ? "+" : "−"}${Math.abs(component).toFixed(1)} of ${readout.wind.speedMs.toFixed(1)}` };
    },
  },
  {
    id: "aid",
    name: "Aid",
    scale: () => "dots: water, drink, gel",
    weight: 1.5,
    sample: true,
    value: (_story, readout) => ({
      text: readout.nextAid ? `next +${show.km(Math.max(0, readout.nextAid.km - readout.km))}` : show.NOT_KNOWN,
      unknown: !readout.nextAid,
    }),
  },
  {
    id: "reports",
    name: "Runner reports",
    scale: () => "not measured",
    weight: 1.3,
    sample: true,
    subjective: true,
    value: (story, _readout, km) => {
      const near = story.notes.filter((note) => Math.abs(note.km - km) <= 2.5);
      return { text: near.length > 0 ? near.map((note) => NOTE_HEADINGS[note.kind].toLowerCase()).join(", ") : "none within 2.5 km" };
    },
  },
];

function tracks(context: MockupContext): HTMLElement {
  const { story } = context;
  const section = html("section", { class: "fi-tracks", "aria-label": "Course tracks, aligned by kilometre" });
  const chart = html("div", { class: "fi-tracks__chart" });
  const heads = html("div", { class: "fi-tracks__heads" });
  section.append(chart, heads);
  heads.style.width = `${HEAD_WIDTH}px`;

  const liveValues = new Map<Track["id"], HTMLElement>();
  for (const track of TRACKS) {
    const live = html("span", { class: "fi-trackhead__value" });
    liveValues.set(track.id, live);
    const name = html("span", { class: "fi-trackhead__name", text: track.name });
    if (track.sample) name.append(" ", tag());
    heads.append(
      html(
        "div",
        { class: track.subjective ? "fi-trackhead fi-trackhead--subjective" : "fi-trackhead", "data-track": track.id },
        name,
        html("span", { class: "fi-trackhead__scale", text: track.scale(story) }),
        live,
      ),
    );
  }

  let moveCursor: (() => void) | undefined;

  drawToFit(chart, (width, height) => {
    const x = linearScale([0, story.lengthKm], [HEAD_WIDTH, width - RIGHT_PAD]);
    const bins = story.strip(Math.max(80, Math.round((width - HEAD_WIDTH - RIGHT_PAD) / 3)));
    const node = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "fi-tracks__svg" });

    const unit = (height - AXIS_HEIGHT - DIVIDER) / TRACKS.reduce((sum, track) => sum + track.weight, 0);
    const bands = new Map<Track["id"], Band>();
    let top = 0;
    for (const track of TRACKS) {
      if (track.subjective) {
        // The double rule: everything under it is a different kind of information.
        node.append(svg("path", { d: `M0 ${top + 6}H${width}M0 ${top + 9}H${width}`, stroke: INK, "stroke-width": 0.9 }));
        top += DIVIDER;
      }
      const bandHeight = track.weight * unit;
      bands.set(track.id, { top, height: bandHeight });
      node.append(svg("line", { x1: 0, y1: top + bandHeight, x2: width, y2: top + bandHeight, stroke: RULE, "stroke-width": 0.7 }));
      const head = heads.querySelector<HTMLElement>(`[data-track="${track.id}"]`);
      if (head) {
        head.style.top = `${top}px`;
        head.style.height = `${bandHeight}px`;
      }
      top += bandHeight;
    }
    const band = (id: Track["id"]) => bands.get(id) as Band;
    const chartBottom = top;

    // Kilometre grid through every track.
    for (let km = 0; km <= story.lengthKm; km += 1) {
      const major = km % 5 === 0;
      node.append(
        svg("line", {
          x1: x(km),
          y1: 0,
          x2: x(km),
          y2: chartBottom + (major ? 7 : 3),
          stroke: major ? RULE : "#dbe1e6",
          "stroke-width": major ? 0.8 : 0.5,
        }),
      );
      if (major) node.append(svg("text", { x: x(km), y: chartBottom + 20, "text-anchor": "middle", class: "fi-axis", text: String(km) }));
    }
    node.append(
      svg("line", { x1: HEAD_WIDTH, y1: 0, x2: HEAD_WIDTH, y2: chartBottom, stroke: INK, "stroke-width": 0.9 }),
      svg("text", { x: HEAD_WIDTH - 10, y: chartBottom + 20, "text-anchor": "end", class: "fi-axis", text: "km along the course line" }),
    );

    node.append(
      landmarkTrack(story, x, band("landmarks")),
      elevationTrack(bins, x, band("elevation"), story),
      effortTrack(bins, x, band("effort")),
      sunTrackBand(bins, x, band("sun")),
      windTrack(bins, x, band("wind")),
      aidTrack(story, x, band("aid")),
      reportTrack(story, x, band("reports")),
    );

    const cursor = svg("g", {});
    const label = svg("text", { x: 0, y: chartBottom + 20, "text-anchor": "middle", class: "fi-cursor__km" });
    cursor.append(
      svg("line", { x1: 0, y1: 0, x2: 0, y2: chartBottom + 8, stroke: CURSOR, "stroke-width": 1.3 }),
      svg("rect", { x: -22, y: chartBottom + 8, width: 44, height: 17, rx: 2, fill: CURSOR }),
      label,
    );
    node.append(cursor);
    moveCursor = () => {
      cursor.setAttribute("transform", `translate(${x(context.km).toFixed(1)} 0)`);
      label.textContent = context.km.toFixed(2);
    };
    moveCursor();
    chart.replaceChildren(node);
  });

  const refresh = () => {
    moveCursor?.();
    const readout = story.at(context.km);
    for (const track of TRACKS) {
      const live = liveValues.get(track.id);
      if (!live) continue;
      const { text, unknown } = track.value(story, readout, context.km);
      live.textContent = text;
      live.toggleAttribute("data-unknown", Boolean(unknown));
    }
  };
  context.onScrub(refresh);
  refresh();

  context.scrubbable(section, {
    axis: "horizontal",
    toKm: (fraction) => fraction * story.lengthKm,
    inset: { start: HEAD_WIDTH, end: RIGHT_PAD },
  });
  return section;
}

type Band = { top: number; height: number };
type X = (km: number) => number;

/** Names in stacked lanes, each tied to its kilometre by a hairline. */
function landmarkTrack(story: CourseStory, x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const LANE = 11.5;
  const CHAR = 6.6; // B612 is a wide face; this is its average advance at 10px.
  const laneCount = Math.max(2, Math.floor((band.height - 4) / LANE));
  const names = story.landmarks.map((landmark) => show.shortName(landmark.name, 22));
  // Names near the finish are set to the left of their tick so they stay on the chart.
  const flipped = story.landmarks.map((landmark, index) => x(landmark.km) + 6 + names[index].length * CHAR > x(story.lengthKm) + 14);
  const lanes = assignLanes(
    story.landmarks.map((landmark, index) => {
      const width = 6 + names[index].length * CHAR;
      return flipped[index] ? { start: x(landmark.km) - width, end: x(landmark.km) } : { start: x(landmark.km), end: x(landmark.km) + width };
    }),
    laneCount,
    6,
  );
  story.landmarks.forEach((landmark, index) => {
    const at = x(landmark.km);
    const baseline = band.top + 11 + lanes[index] * LANE;
    group.append(
      svg("line", { x1: at, y1: baseline - 8, x2: at, y2: band.top + band.height, stroke: INK, "stroke-width": 0.7 }),
      svg(
        "text",
        {
          x: flipped[index] ? at - 4 : at + 4,
          y: baseline,
          "text-anchor": flipped[index] ? "end" : "start",
          class: "fi-landmark",
          text: names[index],
        },
        svg("title", { text: landmark.name }),
      ),
    );
  });
  return group;
}

function elevationTrack(bins: StripBin[], x: X, band: Band, story: CourseStory): SVGGElement {
  const group = svg("g", {});
  const y = linearScale(heightDomain(story), [band.top + band.height - 1, band.top + 6]);
  const floor = band.top + band.height;

  for (const run of measuredRuns(bins, { bridgeGaps: true })) {
    if (run.bins.length < 2) continue;
    const line = run.bins.map((bin, index) => `${index === 0 ? "M" : "L"}${x(bin.midKm).toFixed(1)} ${y(bin.elevationM).toFixed(1)}`).join("");
    if (run.measured) {
      const area = `${line}L${x(run.bins[run.bins.length - 1].midKm).toFixed(1)} ${floor}L${x(run.bins[0].midKm).toFixed(1)} ${floor}Z`;
      group.append(
        svg("path", { d: area, fill: TRACE, "fill-opacity": 0.12 }),
        svg("path", { d: line, fill: "none", stroke: TRACE, "stroke-width": 1.2, "stroke-linejoin": "round" }),
      );
    } else {
      group.append(svg("path", { d: line, fill: "none", stroke: GREY, "stroke-width": 1.2, "stroke-dasharray": "3 2.5" }));
    }
  }

  for (const span of story.unmeasured) {
    group.append(
      svg("path", { d: `M${x(span.fromKm)} ${band.top + 4}v-2H${x(span.toKm)}v2`, fill: "none", stroke: GREY, "stroke-width": 0.9 }),
      svg("text", { x: x(span.toKm) + 5, y: band.top + 9, class: "fi-gap-label", text: "no survey returns" }, svg("title", { text: span.reason })),
    );
  }
  return group;
}

/** A stepped trace about 1.0. Where the grade is outside the model there is no trace, only a grey block. */
function effortTrack(bins: StripBin[], x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const reach = effortReach(bins);
  const y = linearScale([1 - reach, 1 + reach], [band.top + band.height - 3, band.top + 3]);
  group.append(
    svg("line", {
      x1: x(bins[0].startKm),
      y1: y(1),
      x2: x(bins[bins.length - 1].endKm),
      y2: y(1),
      stroke: INK,
      "stroke-width": 0.5,
      "stroke-dasharray": "1 2",
    }),
  );

  let path = "";
  let penDown = false;
  for (const bin of bins) {
    if (bin.difficulty === null) {
      group.append(
        svg("rect", {
          x: x(bin.startKm),
          y: band.top + 2,
          width: x(bin.endKm) - x(bin.startKm),
          height: band.height - 4,
          fill: GREY,
          "fill-opacity": 0.3,
        }),
      );
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${x(bin.startKm).toFixed(1)} ${y(bin.difficulty).toFixed(1)}L${x(bin.endKm).toFixed(1)} ${y(bin.difficulty).toFixed(1)}`;
    penDown = true;
  }
  group.append(svg("path", { d: path, fill: "none", stroke: TRACE, "stroke-width": 1.1 }));
  return group;
}

/** The exposure range as a band between two traces: the lower one with trees in leaf, the upper with none. */
function sunTrackBand(bins: StripBin[], x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const y = linearScale([0, 100], [band.top + band.height - 2, band.top + 4]);
  group.append(
    svg("line", {
      x1: x(bins[0].startKm),
      y1: y(50),
      x2: x(bins[bins.length - 1].endKm),
      y2: y(50),
      stroke: RULE,
      "stroke-width": 0.5,
      "stroke-dasharray": "1 2",
    }),
  );

  // One band per stretch of daylight. With the sun down there is no reading, so the trace stops
  // and the stretch is greyed — it is never joined across as if the sun had stayed up.
  let lit: { km: number; low: number; high: number }[] = [];
  const flush = () => {
    if (lit.length > 1) {
      const upper = lit.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.km).toFixed(1)} ${y(point.high).toFixed(1)}`).join("");
      const lower = lit.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.km).toFixed(1)} ${y(point.low).toFixed(1)}`).join("");
      const back = [...lit]
        .reverse()
        .map((point) => `L${x(point.km).toFixed(1)} ${y(point.low).toFixed(1)}`)
        .join("");
      group.append(
        svg("path", { d: `${upper}${back}Z`, fill: TRACE, "fill-opacity": 0.2 }),
        svg("path", { d: upper, fill: "none", stroke: TRACE, "stroke-width": 0.9 }),
        svg("path", { d: lower, fill: "none", stroke: TRACE, "stroke-width": 0.9 }),
      );
    }
    lit = [];
  };
  for (const bin of bins) {
    if (bin.exposure) {
      lit.push({ km: bin.midKm, low: bin.exposure.lowPercent, high: bin.exposure.highPercent });
      continue;
    }
    flush();
    group.append(
      svg("rect", {
        x: x(bin.startKm),
        y: band.top + 2,
        width: x(bin.endKm) - x(bin.startKm),
        height: band.height - 4,
        fill: GREY,
        "fill-opacity": 0.3,
      }),
    );
  }
  flush();
  return group;
}

/** The part of the wind that is in the runner's face, as a trace about zero: above the line costs you. */
function windTrack(bins: StripBin[], x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const strongest = Math.max(0.1, ...bins.map((bin) => bin.windSpeedMs));
  const y = linearScale([-strongest, strongest], [band.top + band.height - 3, band.top + 3]);
  const line = bins
    .map((bin, index) => `${index === 0 ? "M" : "L"}${x(bin.midKm).toFixed(1)} ${y(bin.headwindFraction * bin.windSpeedMs).toFixed(1)}`)
    .join("");
  const zero = y(0).toFixed(1);
  group.append(
    svg("path", {
      d: `${line}L${x(bins[bins.length - 1].midKm).toFixed(1)} ${zero}L${x(bins[0].midKm).toFixed(1)} ${zero}Z`,
      fill: TRACE,
      "fill-opacity": 0.12,
    }),
    svg("line", {
      x1: x(bins[0].startKm),
      y1: y(0),
      x2: x(bins[bins.length - 1].endKm),
      y2: y(0),
      stroke: INK,
      "stroke-width": 0.5,
      "stroke-dasharray": "1 2",
    }),
    svg("path", { d: line, fill: "none", stroke: TRACE, "stroke-width": 1.1 }),
  );
  return group;
}

function aidTrack(story: CourseStory, x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const cy = band.top + band.height / 2;
  for (const station of story.aidStations) {
    group.append(svg("line", { x1: x(station.km), y1: band.top, x2: x(station.km), y2: band.top + band.height, stroke: TRACE, "stroke-width": 0.9 }));
    station.offers.forEach((_, index) => group.append(svg("circle", { cx: x(station.km) + 6 + index * 6.5, cy, r: 2.2, fill: TRACE })));
  }
  return group;
}

function reportTrack(story: CourseStory, x: X, band: Band): SVGGElement {
  const group = svg("g", {});
  const cy = band.top + band.height / 2;
  for (const note of story.notes) {
    group.append(
      svg("path", { d: `M${x(note.km)} ${cy - 6}l6 6l-6 6l-6-6Z`, class: "fi-report-mark" }, svg("title", { text: note.text })),
      svg("text", { x: x(note.km) + 10, y: cy + 3.5, class: "fi-report-label", text: NOTE_HEADINGS[note.kind].toLowerCase() }),
    );
  }
  return group;
}

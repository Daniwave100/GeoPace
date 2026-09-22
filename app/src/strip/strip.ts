// The strip: the whole course as one line, with a row per layer, and the control for where the
// runner is (PLAN.md D14). Drag it, click it, or use the keyboard.
//
// It is the poster's band of rows on one axis, drawn the instrument's way (D31): each row is a
// thin trace with a light fill and a labelled scale, and the value under the cursor is printed
// in the row's header. Collapsed, it is the Stops' names, the height and the blue line with where
// you are on it. A layer that is switched on adds its rows; "Show everything" adds every row.
// The names along the top are the Ride's Stops (core/stops.ts): every landmark, the start, and
// the climbs worth stopping for. Scrubbing the strip moves the Ride, as it moves the runner in Explore.
//
// To a screen reader it is a slider, which is what it is: one value between two ends. All the
// arithmetic lives in core/ (scrub.ts, trace.ts, layout.ts, units.ts), where it is tested; this
// file only listens and draws.
import { ENCODINGS } from "../core/encoding";
import type { RowMark, StripRow } from "../core/layers";
import { assignFreeLanes, linearScale, type Scale } from "../core/layout";
import { kmAfterKey, kmAtFraction } from "../core/scrub";
import { plainName } from "../core/sentence";
import { rampColor } from "../core/mark-look";
import { tracePaths } from "../core/trace";
import { axisMarks, distanceNumber, unitKm, unitName, type Units } from "../core/units";
import { html } from "../dom";
import { drawToFit, svg } from "../svg";

const RIGHT_PAD = 28;
const STOPS_HEIGHT = 58;
const STOP_LANE = 12.5;
/** Archivo at 11.5px and 78% width: its average advance, for keeping names off each other. */
const STOP_NAME_CHAR = 6;
const BASE_ROW_HEIGHT = 62;
const LAYER_ROW_HEIGHT = 48;
const LINE_HEIGHT = 40;
/** A row squeezed below this has room for its name and its value, and no more. */
const TIGHT_ROW_PX = 40;
/** One bin of a trace per this many pixels: finer than the eye needs, coarse enough to redraw on every resize. */
const PIXELS_PER_BIN = 3;

export interface StripContent {
  lengthKm: number;
  /** The Ride's Stops, named in the runner's units: every landmark is one. */
  stops: { name: string; km: number }[];
  /** The strip's own row, there whatever the layers are doing: the height of the course. */
  baseRow: StripRow;
  /** The rows of the layers that are on (or of all of them, with "Show everything"). */
  layerRows: StripRow[];
  /** What the marks on screen mean, in a line under the strip. Empty while no layer is on: the first screen needs no key. */
  key: KeyEntry[];
  /** How tall the runner has made the rows, as a multiple of their designed height (core/strip-size.ts). */
  size: number;
  units: Units;
}

export interface KeyEntry {
  name: string;
  meaning: string;
}

/** How tall the rows that resize are at the designed size: what the strip's top edge needs to turn a drag into a size. */
export function rowsHeightAtSizeOne(content: Pick<StripContent, "layerRows">): number {
  return BASE_ROW_HEIGHT + content.layerRows.length * LAYER_ROW_HEIGHT;
}

export interface Strip {
  show(content: StripContent): void;
  /**
   * Put the cursor at `km`. `spoken` is what a screen reader says: "kilometre 21.1, 11:10, 2:00:00
   * elapsed". `quietly` keeps it from being said now: a Ride that is playing moves the cursor sixty
   * times a second, and that many sentences is noise. It is still what the slider says the moment
   * the keyboard comes to it.
   */
  setKm(km: number, spoken: string, quietly?: boolean): void;
}

/**
 * `onScrub` is called with the km the runner asked for; the caller decides and calls `setKm` back.
 * `onHold` is told when the runner takes hold of the strip with the pointer, and when they let go:
 * a Ride that is playing waits in between, so the cursor doesn't run out from under the pointer.
 */
export function createStrip(container: HTMLElement, onScrub: (km: number) => void, onHold: (held: boolean) => void): Strip {
  let content: StripContent | undefined;
  let km = 0;
  /** What the slider says of where the runner is; written to it by `sayWhere`. */
  let said = "";
  let moveCursor: (() => void) | undefined;

  const rowsBox = html("div", { class: "strip-rows" });
  const heads = html("div", { class: "strip-heads", "aria-hidden": "true" });
  const slider = html("div", { class: "strip", role: "slider", tabindex: 0, "aria-valuemin": 0 }, rowsBox, heads);
  const key = html("p", { class: "strip-key" });
  container.replaceChildren(slider, key);

  const sayWhere = () => {
    if (content) slider.setAttribute("aria-valuenow", distanceNumber(km, content.units));
    slider.setAttribute("aria-valuetext", said);
  };
  // Moved quietly while a Ride plays, the slider may be a whole course behind: it catches up as the keyboard arrives.
  slider.addEventListener("focus", sayWhere);

  /** How far along the strip's km axis the pointer is: the axis starts after the row headers. */
  const scrubToPointer = (event: PointerEvent) => {
    if (!content) return;
    const box = rowsBox.getBoundingClientRect();
    const left = box.left + heads.clientWidth;
    onScrub(kmAtFraction((event.clientX - left) / (box.right - RIGHT_PAD - left), content.lengthKm));
  };
  slider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    slider.setPointerCapture(event.pointerId); // keep following the pointer if it leaves the strip
    slider.focus();
    onHold(true);
    scrubToPointer(event);
  });
  // However the hold ends: the button comes up, the touch is cancelled, the browser takes the pointer away.
  slider.addEventListener("lostpointercapture", () => onHold(false));
  slider.addEventListener("pointermove", (event) => {
    if (slider.hasPointerCapture(event.pointerId)) scrubToPointer(event);
  });
  slider.addEventListener("keydown", (event) => {
    if (!content) return;
    const target = kmAfterKey(event, km, content.lengthKm, unitKm(content.units));
    if (target === null) return;
    event.preventDefault(); // the arrows and Page Up/Down would otherwise scroll the page
    onScrub(target);
  });

  const redraw = drawToFit(rowsBox, (width) => {
    if (!content) return;
    const { drawing, headCells, place } = draw(content, width, heads.clientWidth);
    rowsBox.replaceChildren(drawing);
    heads.replaceChildren(...headCells.map((cell) => cell.node));
    moveCursor = () => {
      if (!content) return;
      place(km, content.units);
      for (const cell of headCells) cell.update(km, content.units);
    };
    moveCursor();
  });
  // The web font arrives after the first drawing, and changes how wide every name is.
  void document.fonts?.ready.then(redraw);

  return {
    show(next) {
      content = next;
      rowsBox.style.height = `${stripHeight(next)}px`;
      slider.setAttribute("aria-label", `Where you are on the course, in ${unitName(next.units, "many")}`);
      slider.setAttribute("aria-valuemax", distanceNumber(next.lengthKm, next.units));
      key.hidden = next.key.length === 0;
      key.replaceChildren(...next.key.map((entry) => html("span", {}, html("b", { text: `${entry.name} ` }), entry.meaning)));
      redraw();
    },
    setKm(value, spoken, quietly = false) {
      km = value;
      said = spoken;
      if (!quietly) sayWhere();
      moveCursor?.();
    },
  };
}

/** The rows are what resizes; the Stops' lane and the blue line keep their height, since they are type, not traces. */
function rowHeight(row: StripRow, content: StripContent): number {
  // A row of marks is as tall as its tallest stack of them, whatever the strip is dragged to:
  // marks are type, not a trace, and scaling them would make them unreadable long before small.
  if (row.marks) return MARK_ROW_PAD * 2 + Math.max(1, ...row.marks().map((mark) => mark.glyphs.length)) * (GLYPH_PX + GLYPH_GAP_PX);
  return Math.round((row === content.baseRow ? BASE_ROW_HEIGHT : LAYER_ROW_HEIGHT) * content.size);
}

/** The Stops' lane, every row, and the blue line. */
function stripHeight(content: StripContent): number {
  return STOPS_HEIGHT + [content.baseRow, ...content.layerRows].reduce((sum, row) => sum + rowHeight(row, content), 0) + LINE_HEIGHT;
}

interface HeadCell {
  node: HTMLElement;
  update(km: number, units: Units): void;
}

interface Drawing {
  drawing: SVGSVGElement;
  headCells: HeadCell[];
  place(km: number, units: Units): void;
}

function draw(content: StripContent, width: number, headWidth: number): Drawing {
  const rows = [content.baseRow, ...content.layerRows];
  const x = linearScale([0, content.lengthKm], [headWidth, width - RIGHT_PAD]);
  const binCount = Math.max(60, Math.round((width - headWidth - RIGHT_PAD) / PIXELS_PER_BIN));
  const height = stripHeight(content);
  const drawing = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" });
  drawing.append(
    svg(
      "defs",
      {},
      svg("pattern", { id: "strip-stripes", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, svg("rect", { width: 3, height: 6, fill: "var(--ink)" })),
      // The poster's halftone: shade that depends on the leaves is the same teal as the shade a
      // wall casts, with the paper showing through it in dots (PLAN.md D28, core/encoding.ts).
      // The dots are knocked out of the colour rather than printed in it, because a pattern's own
      // contents inherit from the pattern, never from the shape that uses it: `currentColor` here
      // would be the strip's ink, not the row's teal. So the colour is the rect underneath.
      svg(
        "pattern",
        { id: "strip-leaf-dots", width: 4, height: 4, patternUnits: "userSpaceOnUse" },
        svg("circle", { cx: 2, cy: 2, r: 1.15, fill: "var(--paper)" }),
      ),
    ),
  );

  const marks = axisMarks(content.lengthKm, content.units);
  const chartBottom = height - LINE_HEIGHT;
  for (const mark of marks) drawing.append(svg("line", { x1: x(mark.km), x2: x(mark.km), y1: STOPS_HEIGHT, y2: chartBottom, class: "strip-grid" }));

  drawing.append(stopLane(content, x));

  const headCells: HeadCell[] = [];
  let top = STOPS_HEIGHT;
  for (const row of rows) {
    const rowH = rowHeight(row, content);
    drawing.append(svg("line", { x1: 0, x2: width, y1: top, y2: top, class: "strip-rule" }), traceGroup(row, binCount, x, top, rowH));
    headCells.push(headCell(row, top, rowH, content.units));
    top += rowH;
  }
  drawing.append(svg("line", { x1: 0, x2: width, y1: top, y2: top, class: "strip-rule" }));

  // The blue line: the course itself, with a notch and a number every five km or miles.
  const lineY = top + 12;
  drawing.append(svg("rect", { x: x(0), y: lineY - 4, width: x(content.lengthKm) - x(0), height: 8, class: "strip-line" }));
  for (const mark of marks) {
    drawing.append(
      svg("rect", { x: x(mark.km) - 1, y: lineY - 4, width: 2, height: 8, class: "strip-notch" }),
      svg("text", { x: x(mark.km), y: lineY + 22, "text-anchor": "middle", class: "strip-mark", text: mark.label }),
    );
  }
  headCells.push(lineHead(top, content.units));

  // Where you are: a blue bar through every row, and a flag on the blue line with the distance.
  const flagText = svg("text", { x: 0, y: lineY + 22, "text-anchor": "middle", class: "strip-cursor-text" });
  const cursor = svg(
    "g",
    {},
    svg("rect", { x: -1.5, y: 0, width: 3, height: lineY + 6, class: "strip-cursor-bar" }),
    svg("rect", { x: -25, y: lineY + 6, width: 50, height: 21, class: "strip-cursor-flag" }),
    flagText,
  );
  drawing.append(cursor);

  return {
    drawing,
    headCells,
    place(km, units) {
      cursor.setAttribute("transform", `translate(${x(km).toFixed(1)} 0)`);
      flagText.textContent = distanceNumber(km, units);
    },
  };
}

/** The Stops' names in stacked lanes over the rows, each tied to its place by a hairline. */
function stopLane(content: StripContent, x: Scale): SVGGElement {
  const group = svg("g", {});
  const laneCount = Math.max(1, Math.floor((STOPS_HEIGHT - 6) / STOP_LANE));
  const names = content.stops.map((stop) => shorten(plainName(stop.name)));
  const widths = names.map((name) => 8 + name.length * STOP_NAME_CHAR);
  // Names near the finish are set to the left of their tick, so they stay on the strip.
  const flipped = content.stops.map((stop, i) => x(stop.km) + widths[i] > x(content.lengthKm) + RIGHT_PAD - 4);
  const spans = content.stops.map((stop, i) => (flipped[i] ? { start: x(stop.km) - widths[i], end: x(stop.km) } : { start: x(stop.km), end: x(stop.km) + widths[i] }));
  // Where names crowd (New York's last 2 km), the last one gets its room first: it is the finish.
  const order = spans.map((_, i) => i);
  order.unshift(...order.splice(-1));
  const inOrder = assignFreeLanes(order.map((i) => spans[i]), laneCount, 6);
  const lanes = new Array<number | null>(spans.length).fill(null);
  order.forEach((i, position) => (lanes[i] = inOrder[position]));
  content.stops.forEach((stop, i) => {
    const at = x(stop.km);
    const lane = lanes[i];
    // No free lane (a narrow screen, a crowded finish): the tick stays, with the name in its tooltip.
    const baseline = lane === null ? STOPS_HEIGHT - 6 : 12 + lane * STOP_LANE;
    group.append(svg("line", { x1: at, x2: at, y1: baseline - 9, y2: STOPS_HEIGHT, class: "strip-stop-tick" }, svg("title", { text: stop.name })));
    if (lane === null) return;
    group.append(svg("text", { x: flipped[i] ? at - 4 : at + 4, y: baseline, "text-anchor": flipped[i] ? "end" : "start", class: "strip-stop", text: names[i] }, svg("title", { text: stop.name })));
  });
  return group;
}

/** One row's trace: solid with a light fill where measured, dashed grey where the value is filled in, a grey block where there is none. */
function traceGroup(row: StripRow, binCount: number, x: Scale, top: number, height: number): SVGGElement {
  if (row.marks) return markGroup(row.marks(), x, top, height);
  const group = svg("g", {});
  const bins = row.bins(binCount);
  const paths = tracePaths(row, bins, { x, top, height }, row.howMuch?.(binCount));
  const solid = ENCODINGS[row.encoding].cssClass;
  const gap = ENCODINGS["not-measured"].cssClass;
  // Only a value the runner can read against is drawn; a two-way row's own middle is not one.
  if (typeof row.baseline === "number") group.append(svg("line", { x1: x(bins[0].startKm), x2: x(bins[bins.length - 1].endKm), y1: paths.baselineY, y2: paths.baselineY, class: "strip-baseline" }));
  for (const block of paths.noValue) group.append(svg("rect", { x: block.x, y: top + 2, width: block.width, height: height - 4, class: `${gap} trace-block` }));
  for (const piece of paths.measured) group.append(svg("path", { d: piece.area, class: `${solid} trace-fill` }));
  // How much, as well as where: filled from the same ramps as the marks on the map, so a hill is the same colour on both.
  for (const block of paths.howMuchBlocks) {
    const shape = { x: block.x, y: block.y, width: block.width + 0.4, height: block.height, class: "trace-how-much" };
    group.append(svg("rect", { ...shape, fill: rampColor(block.howMuch) }));
    // A slice whose claim depends on the leaves is the same colour with the paper dotted through
    // it: shade, and a condition on it. The dots are in the strip's own coordinates, so a run of
    // slices is one field of halftone rather than a row of separately dotted blocks.
    if (block.encoding === "depends-on-leaves") group.append(svg("rect", { ...shape, fill: "url(#strip-leaf-dots)" }));
  }
  for (const piece of paths.measured) group.append(svg("path", { d: piece.line, class: solid }));
  for (const line of paths.notMeasured) group.append(svg("path", { d: line, class: gap }));
  return group;
}

/** How big one glyph is drawn on a row of marks, the gap between stacked ones, and the room above and below a stack. */
const GLYPH_PX = 12;
const GLYPH_GAP_PX = 2;
const MARK_ROW_PAD = 9;

/**
 * A row of things at places: one rule along the bottom, a tick at each thing, and its marks
 * stacked above the tick, in their colours.
 *
 * Not a trace. A chart through fifteen aid stations draws the gaps between them, which is a line
 * about what isn't there; what a runner wants to see is the stations, which are points. The marks
 * stack rather than sit side by side — the owner, 09-22: side by side "makes it really wide, and
 * especially in New York where there's a lot of stations, they just look clumped up" — so every
 * station is one glyph wide however much it hands out, and twenty of them fit on a strip.
 */
function markGroup(marks: RowMark[], x: Scale, top: number, height: number): SVGGElement {
  const group = svg("g", {});
  const rule = top + height - MARK_ROW_PAD;
  if (marks.length === 0) return group;
  group.append(svg("line", { x1: x(marks[0].km), x2: x(marks[marks.length - 1].km), y1: rule, y2: rule, class: `${ENCODINGS.measured.cssClass} strip-mark-rule` }));
  for (const mark of marks) {
    const at = x(mark.km);
    const cell = svg("g", { class: ENCODINGS[mark.encoding].cssClass }, svg("title", { text: mark.label }));
    cell.append(svg("line", { x1: at, x2: at, y1: rule - 3, y2: rule + 3, class: "strip-mark-tick" }));
    // Stacked from the rule up, so the first mark — the drink — is nearest the line the eye follows.
    mark.glyphs.forEach((glyph, g) => {
      const bottom = rule - 5 - g * (GLYPH_PX + GLYPH_GAP_PX);
      cell.append(svg("path", { d: glyph.path, fill: glyph.color, class: "strip-mark-glyph", transform: `translate(${(at - GLYPH_PX / 2).toFixed(1)} ${(bottom - GLYPH_PX).toFixed(1)}) scale(${(GLYPH_PX / 16).toFixed(3)})` }));
    });
    group.append(cell);
  }
  return group;
}

/** A row's header: its name, its labelled scale, and the value under the cursor. */
function headCell(row: StripRow, top: number, height: number, units: Units): HeadCell {
  const value = html("span", { class: "strip-head-value" });
  const node = html("div", { class: "strip-head" }, html("span", { class: "strip-head-name", text: row.name }), value, html("span", { class: "strip-head-scale", text: row.scale(units) }));
  if (row.summary) node.append(html("span", { class: "strip-head-scale", text: row.summary(units) }));
  node.style.top = `${top}px`;
  node.style.height = `${height}px`;
  node.classList.toggle("is-tight", height < TIGHT_ROW_PX);
  return {
    node,
    update(km, shownIn) {
      const { text, notMeasured } = row.valueAt(km, shownIn);
      // Not measured here: grey and struck through, the same as in the sentence, which also prints the reason.
      value.replaceChildren(notMeasured !== null ? html("s", { text }) : text);
      value.title = notMeasured ?? "";
      value.className = `strip-head-value ${ENCODINGS[notMeasured !== null ? "not-measured" : row.encoding].cssClass}${text.length > 9 ? " is-long" : ""}`;
    },
  };
}

function lineHead(top: number, units: Units): HeadCell {
  const node = html("div", { class: "strip-head" }, html("span", { class: "strip-head-name", text: "The blue line" }), html("span", { class: "strip-head-scale", text: `${unitName(units, "many")} along the course line` }));
  node.style.top = `${top}px`;
  node.style.height = `${LINE_HEIGHT}px`;
  return { node, update: () => undefined };
}

/** A name short enough to set along the strip; the full one is in its tooltip. */
function shorten(name: string, maxLength = 26): string {
  if (name.length <= maxLength) return name;
  const cut = name.slice(0, maxLength);
  return `${(/\s/.test(name[maxLength]) ? cut : cut.replace(/\s+\S*$/, "")).trimEnd()}…`;
}

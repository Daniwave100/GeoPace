// The architectural model: a few blocks of street around the runner, as a physical maquette would
// look on a table — matte massing, no textures, and real cast shadows (PLAN.md D15).
//
// The buildings here are invented massing, not the city. What is *not* invented is the light: the
// sun's altitude and azimuth come from the real clock at the real kilometre, and every shadow is
// that sun's geometry, so the answer the model gives to "which side of the street is in the sun"
// is the answer the real course gives. When #7 builds this in Cesium against real building data,
// this is the look it is aiming at.
//
// Drawn in parallel projection — an axonometric, the draughtsman's view — rather than perspective,
// because a model of a city block is a drawing, and a drawing has no vanishing point.
import { localVector } from "../core/bearing";
import { shadowCast } from "../core/shadow";
import type { SunPosition } from "../core/solar";
import { sampleNoise } from "./sample-data";
import { points, svg } from "./svg";

/** Looking down at the model, yawed a little off the street so the facades are not edge-on. */
const YAW_DEG = 16;
const PITCH_DEG = 48;
const STREET_HALF_WIDTH_M = 11;
/** Built frontage, then a cross street, repeating along the course. */
const BLOCK_PITCH_M = 78;
const CROSS_STREET_M = 18;

export interface MaquetteStyle {
  ground: string;
  street: string;
  roof: string;
  /** The facade that catches the light, and the one that doesn't. */
  wallLit: string;
  wallShaded: string;
  outline: string;
  outlineWidth: number;
  /** A colour, or `url(#id)` pointing at a pattern from `defs`. */
  shadow: string;
  shadowOpacity: number;
  courseLine: string;
  runner: string;
  /** Hairline annotations (north arrow, sun ray). Omit for a design that doesn't want them. */
  annotation?: string;
  /** Patterns the style refers to. */
  defs?: () => SVGElement[];
}

export interface MaquetteView {
  /** How far to either side of the course to show, in metres. */
  acrossM: number;
  /** How far ahead of the runner, in metres. */
  aheadM: number;
  /** How far behind, in metres. */
  behindM: number;
  /** Tallest building the massing will generate — sets the frame, so it must not be exceeded. */
  maxHeightM: number;
}

export interface MaquetteInput {
  /** Metres from the start: the model slides along the course as this changes. */
  positionM: number;
  /** The course's compass heading here; the view always faces the way the runner runs. */
  headingDeg: number;
  sun: SunPosition;
  /** Seeds the massing, so a course's blocks are the same on every reload. */
  seed: number;
  view: MaquetteView;
  style: MaquetteStyle;
}

interface Point {
  x: number;
  y: number;
}

interface Block {
  /** Metres right of the course centre line (negative = left). */
  fromRight: number;
  toRight: number;
  /** Metres ahead of the runner. */
  fromAhead: number;
  toAhead: number;
  heightM: number;
}

export function renderMaquette(input: MaquetteInput): SVGSVGElement {
  const { style, view } = input;
  const frame = viewBox(view);
  const node = svg("svg", {
    viewBox: `${frame.x} ${frame.y} ${frame.width} ${frame.height}`,
    preserveAspectRatio: "xMidYMid meet",
    class: "maquette",
    role: "img",
    "aria-label": "Architectural model of the street around the runner, lit by the race-day sun",
  });

  if (style.defs) node.append(svg("defs", {}, ...style.defs()));

  const cast = shadowCast(input.sun);
  const sunDirection = localVector(input.headingDeg, input.sun.azimuthDeg);
  const shadowDirection = localVector(input.headingDeg, cast.bearingDeg);
  const shadowStep = { right: shadowDirection.right * cast.lengthPerMeter, ahead: shadowDirection.ahead * cast.lengthPerMeter };

  node.append(groundPlane(view, style), street(view, style));

  const blocks = massing(input);
  // Farthest first, so nearer blocks paint over them.
  const ordered = [...blocks].sort((a, b) => depth(b) - depth(a));

  if (cast.isLit) {
    const shadows = svg("g", { fill: style.shadow, "fill-opacity": style.shadowOpacity, stroke: "none" });
    for (const block of ordered) shadows.append(shadowOf(block, shadowStep));
    shadows.append(runnerShadow(shadowStep));
    node.append(shadows);
  }

  node.append(courseLine(view, style));

  for (const block of ordered) node.append(boxOf(block, sunDirection, style));

  node.append(runnerMarker(style));
  if (style.annotation) node.append(annotations(input, sunDirection, cast.isLit, style.annotation));
  return node;
}

/** Where a point sits along the line of sight; bigger is farther away. */
function depth(block: Block): number {
  const midRight = (block.fromRight + block.toRight) / 2;
  const midAhead = (block.fromAhead + block.toAhead) / 2;
  return -midRight * sin(YAW_DEG) + midAhead * cos(YAW_DEG);
}

/** Massing generated from absolute position along the course, so blocks slide past as you scrub. */
function massing(input: MaquetteInput): Block[] {
  const { view, positionM, seed } = input;
  const first = Math.floor((positionM - view.behindM) / BLOCK_PITCH_M);
  const last = Math.ceil((positionM + view.aheadM) / BLOCK_PITCH_M);
  const blocks: Block[] = [];

  for (let index = first; index <= last; index += 1) {
    const blockStart = index * BLOCK_PITCH_M - positionM;
    const frontage = BLOCK_PITCH_M - CROSS_STREET_M;
    for (const side of [-1, 1] as const) {
      const key = index * 2 + (side > 0 ? 1 : 0);
      const depthM = 16 + 26 * sampleNoise(seed + 11, key * 0.71);
      // Mostly a consistent street wall, with the occasional tower — the thing that makes a
      // skyline read as one city rather than another.
      const base = sampleNoise(seed + 23, key * 0.37);
      const spike = sampleNoise(seed + 41, key * 1.9);
      const tall = spike > 0.86 ? 1 + (spike - 0.86) * 4.5 : 1;
      const heightM = Math.min(view.maxHeightM, (8 + view.maxHeightM * 0.42 * base) * tall);
      const inset = 2 + 4 * sampleNoise(seed + 59, key * 0.53);

      blocks.push({
        fromRight: side < 0 ? -(STREET_HALF_WIDTH_M + depthM) : STREET_HALF_WIDTH_M,
        toRight: side < 0 ? -STREET_HALF_WIDTH_M : STREET_HALF_WIDTH_M + depthM,
        fromAhead: blockStart + inset,
        toAhead: blockStart + frontage - inset,
        heightM,
      });
    }
  }
  return blocks;
}

function boxOf(block: Block, sunDirection: { right: number; ahead: number }, style: MaquetteStyle): SVGGElement {
  const { fromRight, toRight, fromAhead, toAhead, heightM } = block;
  const corner = (right: number, ahead: number, up: number) => project(right, ahead, up);

  // With this camera the visible faces are the roof, the face towards the runner, and the face on
  // the +right side. Which of the two walls is lit depends on where the sun actually is.
  const roof = [
    corner(fromRight, fromAhead, heightM),
    corner(toRight, fromAhead, heightM),
    corner(toRight, toAhead, heightM),
    corner(fromRight, toAhead, heightM),
  ];
  const nearWall = [
    corner(fromRight, fromAhead, 0),
    corner(toRight, fromAhead, 0),
    corner(toRight, fromAhead, heightM),
    corner(fromRight, fromAhead, heightM),
  ];
  const rightWall = [
    corner(toRight, fromAhead, 0),
    corner(toRight, toAhead, 0),
    corner(toRight, toAhead, heightM),
    corner(toRight, fromAhead, heightM),
  ];

  // A face is lit when the sun is on its outward side.
  const nearLit = sunDirection.ahead < 0;
  const rightLit = sunDirection.right > 0;
  const stroke = { stroke: style.outline, "stroke-width": style.outlineWidth, "stroke-linejoin": "round" };

  return svg(
    "g",
    {},
    svg("polygon", { points: points(nearWall), fill: nearLit ? style.wallLit : style.wallShaded, ...stroke }),
    svg("polygon", { points: points(rightWall), fill: rightLit ? style.wallLit : style.wallShaded, ...stroke }),
    svg("polygon", { points: points(roof), fill: style.roof, ...stroke }),
  );
}

/** The ground shadow of a box: the outline around its footprint and that footprint pushed over. */
function shadowOf(block: Block, step: { right: number; ahead: number }): SVGPolygonElement {
  const footprint = [
    { right: block.fromRight, ahead: block.fromAhead },
    { right: block.toRight, ahead: block.fromAhead },
    { right: block.toRight, ahead: block.toAhead },
    { right: block.fromRight, ahead: block.toAhead },
  ];
  const pushed = footprint.map((corner) => ({
    right: corner.right + step.right * block.heightM,
    ahead: corner.ahead + step.ahead * block.heightM,
  }));
  const outline = convexHull([...footprint, ...pushed]);
  return svg("polygon", { points: points(outline.map((corner) => project(corner.right, corner.ahead, 0))) });
}

function runnerShadow(step: { right: number; ahead: number }): SVGPolygonElement {
  const height = 1.75;
  const head = { right: step.right * height, ahead: step.ahead * height };
  const across = { right: -step.ahead, ahead: step.right };
  const outline = [
    { right: across.right * 0.28, ahead: across.ahead * 0.28 },
    { right: head.right + across.right * 0.16, ahead: head.ahead + across.ahead * 0.16 },
    { right: head.right - across.right * 0.16, ahead: head.ahead - across.ahead * 0.16 },
    { right: -across.right * 0.28, ahead: -across.ahead * 0.28 },
  ];
  return svg("polygon", { points: points(outline.map((corner) => project(corner.right, corner.ahead, 0))) });
}

function groundPlane(view: MaquetteView, style: MaquetteStyle): SVGPolygonElement {
  const corners = [
    project(-view.acrossM, -view.behindM, 0),
    project(view.acrossM, -view.behindM, 0),
    project(view.acrossM, view.aheadM, 0),
    project(-view.acrossM, view.aheadM, 0),
  ];
  return svg("polygon", { points: points(corners), fill: style.ground });
}

function street(view: MaquetteView, style: MaquetteStyle): SVGPolygonElement {
  const corners = [
    project(-STREET_HALF_WIDTH_M, -view.behindM, 0),
    project(STREET_HALF_WIDTH_M, -view.behindM, 0),
    project(STREET_HALF_WIDTH_M, view.aheadM, 0),
    project(-STREET_HALF_WIDTH_M, view.aheadM, 0),
  ];
  return svg("polygon", { points: points(corners), fill: style.street });
}

/** The course itself, running up the middle — the thing every other layer is indexed against. */
function courseLine(view: MaquetteView, style: MaquetteStyle): SVGPolygonElement {
  const half = 0.9;
  const corners = [
    project(-half, -view.behindM, 0.02),
    project(half, -view.behindM, 0.02),
    project(half, view.aheadM, 0.02),
    project(-half, view.aheadM, 0.02),
  ];
  return svg("polygon", { points: points(corners), fill: style.courseLine });
}

function runnerMarker(style: MaquetteStyle): SVGGElement {
  const foot = project(0, 0, 0);
  const head = project(0, 0, 1.75);
  return svg(
    "g",
    {},
    svg("line", { x1: foot.x, y1: foot.y, x2: head.x, y2: head.y, stroke: style.runner, "stroke-width": 1.1, "stroke-linecap": "round" }),
    svg("circle", { cx: head.x, cy: head.y, r: 1.5, fill: style.runner }),
  );
}

/** Hairline callouts: where north is, and which way the light is coming from. */
function annotations(input: MaquetteInput, sunDirection: { right: number; ahead: number }, isLit: boolean, colour: string): SVGGElement {
  const group = svg("g", { stroke: colour, fill: colour, "stroke-width": 0.35, "font-size": 4.2, "font-family": "ui-sans-serif, system-ui, sans-serif" });
  const north = localVector(input.headingDeg, 0);
  const tip = project(north.right * 13, north.ahead * 13, 0);
  const tail = project(0, 0, 0.05);

  group.append(
    svg("line", { x1: tail.x, y1: tail.y, x2: tip.x, y2: tip.y, "stroke-dasharray": "1.5 1.5" }),
    svg("text", { x: tip.x, y: tip.y - 1.5, "text-anchor": "middle", stroke: "none", text: "N" }),
  );

  if (isLit) {
    const from = project(sunDirection.right * 26, sunDirection.ahead * 26, 20);
    const to = project(sunDirection.right * 9, sunDirection.ahead * 9, 6);
    group.append(
      svg("line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y }),
      svg("circle", { cx: from.x, cy: from.y, r: 2.2, fill: "none" }),
      svg("text", {
        x: from.x,
        y: from.y - 3.6,
        "text-anchor": "middle",
        stroke: "none",
        text: `sun ${input.sun.altitudeDeg.toFixed(0)}°`,
      }),
    );
  }
  return group;
}

/** Axonometric: yaw off the street, then tilt down. No perspective — this is a drawing. */
function project(right: number, ahead: number, up: number): Point {
  const acrossView = right * cos(YAW_DEG) + ahead * sin(YAW_DEG);
  const intoView = -right * sin(YAW_DEG) + ahead * cos(YAW_DEG);
  return { x: acrossView, y: -intoView * sin(PITCH_DEG) - up * cos(PITCH_DEG) };
}

function viewBox(view: MaquetteView): { x: number; y: number; width: number; height: number } {
  const corners: Point[] = [];
  for (const right of [-view.acrossM, view.acrossM]) {
    for (const ahead of [-view.behindM, view.aheadM]) {
      for (const up of [0, view.maxHeightM]) corners.push(project(right, ahead, up));
    }
  }
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const pad = 4;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y };
}

/** Andrew's monotone chain: the outline that wraps a footprint and its pushed-over copy. */
function convexHull(input: { right: number; ahead: number }[]): { right: number; ahead: number }[] {
  const sorted = [...input].sort((a, b) => a.right - b.right || a.ahead - b.ahead);
  if (sorted.length < 3) return sorted;
  const half = (list: typeof sorted) => {
    const out: typeof sorted = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) out.pop();
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function cross(o: { right: number; ahead: number }, a: { right: number; ahead: number }, b: { right: number; ahead: number }): number {
  return (a.right - o.right) * (b.ahead - o.ahead) - (a.ahead - o.ahead) * (b.right - o.right);
}

function sin(deg: number): number {
  return Math.sin(deg * (Math.PI / 180));
}

function cos(deg: number): number {
  return Math.cos(deg * (Math.PI / 180));
}

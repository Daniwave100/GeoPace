// A plain elevation profile with a difficulty band underneath. Deliberately unstyled:
// the real look arrives with the chosen design direction (PLAN.md §6).
import type { CourseBundle } from "../bundle/types";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEIGHT = 350;
const MARGIN = { top: 150, right: 90, bottom: 44, left: 48 };
const MIN_WIDTH = 600;
const BAND_HEIGHT = 16;
const BAND_BIN_KM = 0.1;

/** Where the chart's km axis sits across the page, so the km strip above it can line up with it. */
export const KM_AXIS = { insetLeftPx: MARGIN.left, insetRightPx: MARGIN.right, minWidthPx: MIN_WIDTH };

let watchingWidth: ResizeObserver | undefined;

export function renderProfile(container: HTMLElement, bundle: CourseBundle): void {
  const draw = () => {
    container.replaceChildren(summary(bundle), chart(bundle, Math.max(container.clientWidth, MIN_WIDTH)), legend(bundle));
  };
  draw();
  // One observer, redrawing whichever course is on screen now.
  watchingWidth?.disconnect();
  watchingWidth = new ResizeObserver(debounce(draw, 150));
  watchingWidth.observe(container);
}

function chart(bundle: CourseBundle, width: number): SVGSVGElement {
  const line = bundle.measured.course_line;
  const { min_m, max_m } = bundle.measured.elevation_summary;
  const lastKm = line.km[line.km.length - 1];
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom - BAND_HEIGHT - 6;
  const low = Math.floor(min_m / 5) * 5;
  const high = Math.ceil(max_m / 5) * 5;
  const x = (km: number) => MARGIN.left + (km / lastKm) * plotW;
  const y = (m: number) => MARGIN.top + plotH - ((m - low) / (high - low)) * plotH;
  const bandTop = MARGIN.top + plotH + 6;

  const svg = el("svg", { width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, role: "img" });
  svg.append(el("title", {}, `Elevation profile of ${bundle.course.name}`));

  // Elevation
  const points = line.km.map((km, i) => `${x(km).toFixed(1)},${y(line.elevation_m[i]).toFixed(1)}`);
  svg.append(
    el("polygon", { points: `${x(0)},${y(low)} ${points.join(" ")} ${x(lastKm)},${y(low)}`, fill: "#ddd" }),
    el("polyline", { points: points.join(" "), fill: "none", stroke: "#222", "stroke-width": 1.5 }),
  );

  // Axes: elevation every 5 m, distance every 5 km
  for (let m = low; m <= high; m += 5) {
    svg.append(
      el("line", { x1: MARGIN.left, x2: width - MARGIN.right, y1: y(m), y2: y(m), stroke: "#0001" }),
      el("text", { x: MARGIN.left - 6, y: y(m) + 4, "text-anchor": "end", "font-size": 11 }, `${m} m`),
    );
  }
  for (let km = 0; km <= lastKm; km += 5) {
    svg.append(el("text", { x: x(km), y: HEIGHT - 20, "text-anchor": "middle", "font-size": 11 }, `${km} km`));
  }

  // Difficulty band, one cell per 100 m
  for (const { startKm, mean } of difficultyBins(bundle)) {
    const cell = el("rect", {
      x: x(startKm),
      y: bandTop,
      width: Math.max(x(Math.min(startKm + BAND_BIN_KM, lastKm)) - x(startKm), 0.5),
      height: BAND_HEIGHT,
      fill: mean === null ? "url(#outside-model)" : difficultyColor(mean),
    });
    const tip =
      mean === null
        ? `km ${startKm.toFixed(1)}: grade outside the model's valid range (no difficulty shown)`
        : `km ${startKm.toFixed(1)}: ${Math.abs(Math.round((mean - 1) * 100))}% ${mean >= 1 ? "more" : "less"} energy than flat`;
    cell.append(el("title", {}, tip));
    svg.append(cell);
  }
  svg.append(hatchPattern());

  // Landmarks
  for (const landmark of bundle.course.landmarks) {
    if (landmark.km > lastKm + 0.5) continue;
    const lx = x(Math.min(landmark.km, lastKm));
    const label = document.createElementNS(SVG_NS, "a");
    label.setAttribute("href", landmark.source);
    label.setAttribute("target", "_blank");
    label.append(
      el("text", { x: lx, y: MARGIN.top - 8, "font-size": 11, transform: `rotate(-50 ${lx} ${MARGIN.top - 8})` }, landmark.name),
    );
    svg.append(
      el("line", { x1: lx, x2: lx, y1: MARGIN.top - 4, y2: bandTop + BAND_HEIGHT, stroke: "#0004", "stroke-dasharray": "2 3" }),
      label,
    );
  }

  svg.append(hoverReadout(bundle, svg, x, MARGIN.top, bandTop + BAND_HEIGHT, (px) => ((px - MARGIN.left) / plotW) * lastKm));
  return svg;
}

/** Mean difficulty per 100 m of course; null if any sample in the bin is outside the model. */
function difficultyBins(bundle: CourseBundle): { startKm: number; mean: number | null }[] {
  const line = bundle.measured.course_line;
  const bins: { startKm: number; sum: number; count: number; outside: boolean }[] = [];
  line.km.forEach((km, i) => {
    const b = Math.min(Math.floor(km / BAND_BIN_KM), Math.ceil(line.km[line.km.length - 1] / BAND_BIN_KM) - 1);
    bins[b] ??= { startKm: b * BAND_BIN_KM, sum: 0, count: 0, outside: false };
    const d = line.difficulty[i];
    if (d === null) bins[b].outside = true;
    else {
      bins[b].sum += d;
      bins[b].count += 1;
    }
  });
  return bins
    .filter((bin) => bin !== undefined)
    .map((bin) => ({ startKm: bin.startKm, mean: bin.outside || bin.count === 0 ? null : bin.sum / bin.count }));
}

function hoverReadout(
  bundle: CourseBundle,
  svg: SVGSVGElement,
  x: (km: number) => number,
  top: number,
  bottom: number,
  kmAt: (px: number) => number,
): SVGGElement {
  const line = bundle.measured.course_line;
  const group = el("g", { visibility: "hidden", "pointer-events": "none" });
  const cursor = el("line", { y1: top, y2: bottom, stroke: "#000" });
  const label = el("text", { y: bottom + 40, "font-size": 12 });
  group.append(cursor, label);
  svg.addEventListener("mousemove", (event) => {
    const box = svg.getBoundingClientRect();
    const i = nearestIndex(line.km, kmAt(event.clientX - box.left));
    const d = line.difficulty[i];
    const px = x(line.km[i]);
    cursor.setAttribute("x1", String(px));
    cursor.setAttribute("x2", String(px));
    label.setAttribute("x", String(Math.min(px, box.width - 260)));
    label.textContent =
      `km ${line.km[i].toFixed(2)} · ${line.elevation_m[i].toFixed(1)} m · grade ${(line.grade[i] * 100).toFixed(1)}%` +
      ` · difficulty ${d === null ? "n/a" : d.toFixed(2)}`;
    group.setAttribute("visibility", "visible");
  });
  svg.addEventListener("mouseleave", () => group.setAttribute("visibility", "hidden"));
  return group;
}

function summary(bundle: CourseBundle): HTMLElement {
  const { gain_m, loss_m, min_m, max_m } = bundle.measured.elevation_summary;
  const line = bundle.measured.course_line;
  const p = document.createElement("p");
  p.textContent =
    `Measured along the course line: ${(line.length_m / 1000).toFixed(2)} km ` +
    `(certified ${(bundle.course.certified_distance_m / 1000).toFixed(3)} km) · ` +
    `elevation ${min_m.toFixed(0)}–${max_m.toFixed(0)} m · gain ${gain_m.toFixed(0)} m · loss ${loss_m.toFixed(0)} m`;
  return p;
}

function legend(bundle: CourseBundle): HTMLElement {
  const model = bundle.measured.difficulty_model;
  const p = document.createElement("p");
  p.className = "note";
  const link = document.createElement("a");
  link.href = model.source;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = model.name;
  p.append(
    "Band below the profile = difficulty: ",
    model.description,
    " Model: ",
    link,
    ". Elevation is from the official terrain model, smoothed before computing grade. Hatched = outside the model's range.",
  );
  return p;
}

/** Blue for easier than flat, white at flat, red for harder; full color at ±25% energy cost. */
function difficultyColor(factor: number): string {
  const t = Math.max(-1, Math.min(1, (factor - 1) / 0.25));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * Math.abs(t));
  return t >= 0 ? `rgb(255,${mix(255, 40)},${mix(255, 40)})` : `rgb(${mix(255, 40)},${mix(255, 90)},255)`;
}

function hatchPattern(): SVGDefsElement {
  const defs = el("defs", {});
  const pattern = el("pattern", { id: "outside-model", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pattern.append(el("rect", { width: 6, height: 6, fill: "#bbb" }), el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "#777", "stroke-width": 2 }));
  defs.append(pattern);
  return defs;
}

function nearestIndex(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(sorted[lo - 1] - value) < Math.abs(sorted[lo] - value) ? lo - 1 : lo;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

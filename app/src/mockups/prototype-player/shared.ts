// PROTOTYPE — throwaway. Lives on the branch prototype/player-screen, never on main.
//
// Question (PLAN.md D29): the owner picked the Race poster look but found its screen "a lot".
// Does "the app is a video player for the course" feel easy enough for a runner who isn't
// technical, while keeping the ride the owner wants?
//
// Three variants, switchable with ?variant=A|B|C, all built on the pieces in this file: one
// playback state, the chapters, the one-sentence readout, the seek strip and the street model.
// No tests, no polish: the numbers come from the tested core, the rest is here to be looked at.
import * as show from "../format";
import { heightDomain, linearScale, measuredRuns, windArrowOnPage } from "../layout";
import { type MaquetteStyle, renderMaquette } from "../maquette";
import type { CourseStory, Readout } from "../story";
import { drawToFit, html, svg } from "../svg";

export type Layer = "none" | "hills" | "sun" | "wind" | "aid" | "say";

export const LAYERS: { id: Layer; label: string; sample: boolean }[] = [
  { id: "hills", label: "Hills", sample: false },
  { id: "sun", label: "Sun", sample: true },
  { id: "wind", label: "Wind", sample: true },
  { id: "aid", label: "Aid", sample: true },
  { id: "say", label: "Runners say", sample: true },
];

export interface Chapter {
  km: number;
  title: string;
}

export interface Player {
  story: CourseStory;
  chapters: Chapter[];
  km: number;
  playing: boolean;
  layer: Layer;
  seek(km: number): void;
  toggle(): void;
  /** Play until the next chapter, then stop. */
  rideToNext(): void;
  setLayer(layer: Layer): void;
  onChange(listener: () => void): void;
  /** The chapter the runner is at or has most recently passed. */
  chapterIndex(): number;
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function createPlayer(story: CourseStory, startKm: number): Player {
  const listeners: (() => void)[] = [];
  const chapters = findChapters(story);
  let stopAt: number | null = null;
  let last = 0;

  const emit = () => listeners.forEach((listener) => listener());
  const player: Player = {
    story,
    chapters,
    km: startKm,
    playing: false,
    layer: "none",
    seek(km) {
      player.km = Math.min(Math.max(km, 0), story.lengthKm);
      emit();
    },
    toggle() {
      stopAt = null;
      if (!player.playing && player.km >= story.lengthKm - 0.01) player.km = 0;
      player.playing = !player.playing;
      last = performance.now();
      if (player.playing) requestAnimationFrame(tick);
      emit();
    },
    rideToNext() {
      const next = chapters.find((chapter) => chapter.km > player.km + 0.05);
      if (!next) return;
      if (reducedMotion.matches) return player.seek(next.km);
      stopAt = next.km;
      player.playing = true;
      last = performance.now();
      requestAnimationFrame(tick);
      emit();
    },
    setLayer(layer) {
      player.layer = player.layer === layer ? "none" : layer;
      emit();
    },
    onChange: (listener) => listeners.push(listener),
    chapterIndex: () => Math.max(0, chapters.filter((chapter) => chapter.km <= player.km + 0.05).length - 1),
  };

  // Quick between chapters, slow through them: the whole course in a couple of minutes, with time
  // to read at the places that matter.
  function tick(now: number): void {
    if (!player.playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const gap = Math.min(...chapters.map((chapter) => Math.abs(chapter.km - player.km)));
    const cruise = story.lengthKm / 60;
    const speed = stopAt !== null ? cruise * 1.6 : gap < 0.35 ? cruise * 0.18 : cruise;
    let km = player.km + speed * dt;
    const end = stopAt ?? story.lengthKm;
    if (km >= end) {
      km = end;
      player.playing = false;
      stopAt = null;
    }
    player.km = km;
    emit();
    if (player.playing) requestAnimationFrame(tick);
  }
  return player;
}

/** Real landmarks, plus the two steepest stretches that aren't already next to one. */
function findChapters(story: CourseStory): Chapter[] {
  const chapters: Chapter[] = story.landmarks.map((landmark) => ({ km: landmark.km, title: show.shortName(landmark.name, 40) }));
  if (!chapters.some((chapter) => chapter.km < 0.3)) chapters.push({ km: 0, title: "Start" });
  const climbs = story
    .strip(170)
    .filter((bin) => bin.difficulty !== null && bin.elevationMeasured)
    .sort((a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0));
  let added = 0;
  for (const bin of climbs) {
    if (added === 2) break;
    if (chapters.some((chapter) => Math.abs(chapter.km - bin.midKm) < 1.5)) continue;
    chapters.push({ km: bin.midKm, title: "Steep stretch" });
    added += 1;
  }
  return chapters.sort((a, b) => a.km - b.km);
}

/** Where you are, in one sentence a runner would say. Parts flagged `sample` are placeholders. */
export function sentence(story: CourseStory, readout: Readout): { text: string; sample: boolean }[] {
  const parts: { text: string; sample: boolean }[] = [];
  const g = readout.gradePercent;
  const slope = Math.abs(g) < 0.7 ? "Flat" : g > 0 ? `${g >= 2.5 ? "Climbing hard" : "Climbing"}, ${show.grade(g)}` : `Downhill, ${show.grade(g)}`;
  const near = story.landmarks.find((landmark) => Math.abs(landmark.km - readout.km) < 0.4);
  const next = story.landmarks.find((landmark) => landmark.km > readout.km + 0.4 && landmark.km < readout.km + 1.5);
  const place = near ? ` at ${show.shortName(near.name, 40)}` : next ? `, ${show.shortName(next.name, 40)} in ${metres(next.km - readout.km)}` : "";
  parts.push({ text: `${slope}${place}.`, sample: false });

  if (readout.sun.isUp) {
    const sun = { ahead: "Sun in your eyes", behind: "Sun behind you", left: "Sun on your left", right: "Sun on your right" }[readout.sun.side];
    parts.push({ text: `${sun}.`, sample: false });
  }
  const aid = readout.nextAid;
  if (aid && aid.km - readout.km < 1) parts.push({ text: `${aid.offers.includes("gel") ? "Water and gels" : "Water"} in ${metres(Math.max(0, aid.km - readout.km))}.`, sample: true });
  return parts;
}

function metres(km: number): string {
  return km < 1 ? `${Math.round((km * 1000) / 50) * 50} m` : `${km.toFixed(1)} km`;
}

export function sentenceNode(story: CourseStory, readout: Readout): HTMLElement {
  const node = html("p", { class: "pp-sentence" });
  for (const part of sentence(story, readout)) {
    node.append(`${part.text} `);
    if (part.sample) node.append(tape(), " ");
  }
  return node;
}

export function tape(): HTMLElement {
  return html("span", { class: "pp-tape", text: "sample" });
}

// ── Street model ────────────────────────────────────────────────────────────────────────────

const dark = window.matchMedia("(prefers-color-scheme: dark)");

function modelStyle(): MaquetteStyle {
  const blue = dark.matches ? "#5a7dff" : "#1546ff";
  const base = { roof: "#fff", outline: "#000", outlineWidth: 0.5, shadow: "#000", shadowOpacity: 1, courseLine: blue, runner: blue, annotation: "#000" };
  return dark.matches ? { ...base, ground: "#8a8a86", street: "#a3a39f", roof: "#f4f4f0", wallLit: "#d2d2ce", wallShaded: "#777" } : { ...base, ground: "#dededa", street: "#f4f4f0", wallLit: "#fff", wallShaded: "#9a9a96" };
}

export function model(player: Player, view = { acrossM: 110, aheadM: 170, behindM: 60 }): HTMLElement {
  const node = html("div", { class: "pp-model" });
  const draw = () => {
    const readout = player.story.at(player.km);
    node.replaceChildren(
      renderMaquette({
        positionM: readout.km * 1000,
        headingDeg: readout.headingDeg,
        sun: readout.sun,
        seed: player.story.massing.seed,
        view: { ...view, maxHeightM: player.story.massing.maxHeightM },
        style: modelStyle(),
      }),
      html("span", { class: "pp-model__note", text: "White model: stand-in blocks here; the real app uses each city's real building shapes. Sun and shadows are computed." }),
    );
  };
  player.onChange(draw);
  dark.addEventListener("change", draw);
  draw();
  return node;
}

// ── Seek strip ──────────────────────────────────────────────────────────────────────────────

/** The course as a seek bar: elevation, chapter notches, you. One optional layer row under it. */
export function seekStrip(player: Player, options: { numbered?: boolean } = {}): HTMLElement {
  const { story } = player;
  const node = html("div", { class: "pp-strip", tabindex: "0", role: "slider", "aria-label": "Position along the course, in kilometres", "aria-valuemin": "0", "aria-valuemax": story.lengthKm.toFixed(2) });
  const PAD = 18;
  let place: (() => void) | undefined;
  let drawnLayer: Layer | undefined;

  const redraw = drawToFit(node, (width, height) => {
    drawnLayer = player.layer;
    const x = linearScale([0, story.lengthKm], [PAD, width - PAD]);
    const bins = story.strip(Math.round((width - PAD * 2) / 4));
    const lineY = height - 22;
    const layerH = player.layer === "none" ? 0 : 26;
    const top = 16;
    const floor = lineY - 8 - layerH;
    const y = linearScale(heightDomain(story), [floor, top]);
    const g = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}` });
    g.append(svg("defs", {}, svg("pattern", { id: "pp-dots", width: 4, height: 4, patternUnits: "userSpaceOnUse" }, svg("circle", { cx: 1, cy: 1, r: 0.95, class: "pp-ink" }), svg("circle", { cx: 3, cy: 3, r: 0.95, class: "pp-ink" }))));

    for (const run of measuredRuns(bins)) {
      const outline = run.bins.map((bin) => `L${x(bin.startKm).toFixed(1)} ${y(bin.elevationM).toFixed(1)}L${x(bin.endKm).toFixed(1)} ${y(bin.elevationM).toFixed(1)}`).join("");
      g.append(svg("path", { d: `M${x(run.bins[0].startKm).toFixed(1)} ${floor}${outline}L${x(run.bins[run.bins.length - 1].endKm).toFixed(1)} ${floor}Z`, class: run.measured ? "pp-ink" : "pp-grey" }));
    }

    const rowTop = floor + 4;
    const rowMid = rowTop + layerH / 2 - 2;
    if (player.layer === "hills") {
      for (const bin of bins) {
        if (bin.difficulty === null) continue;
        const h = Math.min(11, Math.abs(bin.difficulty - 1) * 60);
        g.append(svg("rect", { x: x(bin.startKm), y: bin.difficulty >= 1 ? rowMid - h : rowMid, width: Math.max(1, x(bin.endKm) - x(bin.startKm) - 1), height: Math.max(0.8, h), class: "pp-ink" }));
      }
    } else if (player.layer === "sun") {
      const sy = linearScale([0, 100], [rowTop + layerH - 4, rowTop]);
      for (const bin of bins) {
        if (!bin.exposure) continue;
        const w = x(bin.endKm) - x(bin.startKm) + 0.4;
        g.append(svg("rect", { x: x(bin.startKm), y: sy(bin.exposure.lowPercent), width: w, height: sy(0) - sy(bin.exposure.lowPercent), class: "pp-ink" }), svg("rect", { x: x(bin.startKm), y: sy(bin.exposure.highPercent), width: w, height: sy(bin.exposure.lowPercent) - sy(bin.exposure.highPercent), fill: "url(#pp-dots)" }));
      }
    } else if (player.layer === "wind") {
      for (let km = 1; km < story.lengthKm; km += 2) {
        const { wind } = story.at(km);
        const { dx, dy } = windArrowOnPage(wind.angleDeg, "right");
        const size = 7 + 4 * Math.max(0, wind.headwindFraction);
        g.append(svg("path", { d: `M${size} 0L${-size * 0.8} ${-size * 0.62}L${-size * 0.8} ${size * 0.62}Z`, transform: `translate(${x(km).toFixed(1)} ${rowMid}) rotate(${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(0)})`, class: "pp-ink" }));
      }
    } else if (player.layer === "aid") {
      for (const station of story.aidStations) station.offers.forEach((_, i) => g.append(svg("rect", { x: x(station.km) - 3, y: rowTop + layerH - 10 - i * 7.5, width: 6, height: 6, class: "pp-ink" })));
    } else if (player.layer === "say") {
      for (const note of story.notes) g.append(svg("path", { d: `M${x(note.km)} ${rowMid - 7}l7 7l-7 7l-7-7Z`, class: "pp-hollow" }, svg("title", { text: note.text })));
    }

    g.append(svg("rect", { x: x(0), y: lineY - 3, width: x(story.lengthKm) - x(0), height: 6, class: "pp-blue" }));
    player.chapters.forEach((chapter, index) => {
      g.append(svg("rect", { x: x(chapter.km) - 1.5, y: lineY - 8, width: 3, height: 16, class: "pp-ink" }, svg("title", { text: chapter.title })));
      if (options.numbered) g.append(svg("text", { x: x(chapter.km), y: lineY + 20, "text-anchor": "middle", class: "pp-strip__num", text: String(index + 1) }));
    });
    if (!options.numbered) for (let km = 0; km <= story.lengthKm; km += 5) g.append(svg("text", { x: x(km), y: lineY + 20, "text-anchor": "middle", class: "pp-strip__num", text: String(km) }));

    const cursor = svg("g", {}, svg("rect", { x: -1.5, y: 0, width: 3, height: lineY + 6, class: "pp-blue" }), svg("circle", { cx: 0, cy: lineY, r: 8, class: "pp-blue" }));
    g.append(cursor);
    place = () => cursor.setAttribute("transform", `translate(${x(player.km).toFixed(1)} 0)`);
    place();
    node.replaceChildren(g);
  });

  player.onChange(() => {
    if (drawnLayer !== player.layer) redraw();
    place?.();
    node.setAttribute("aria-valuenow", player.km.toFixed(2));
    node.setAttribute("aria-valuetext", `${player.km.toFixed(1)} kilometres, ${story.at(player.km).clock}`);
  });

  const kmAt = (event: PointerEvent) => {
    const box = node.getBoundingClientRect();
    return ((event.clientX - box.left - PAD) / (box.width - PAD * 2)) * story.lengthKm;
  };
  node.addEventListener("pointerdown", (event) => {
    node.setPointerCapture(event.pointerId);
    if (player.playing) player.toggle();
    player.seek(kmAt(event));
    event.preventDefault();
    node.focus();
  });
  node.addEventListener("pointermove", (event) => node.hasPointerCapture(event.pointerId) && player.seek(kmAt(event)));
  node.addEventListener("keydown", (event) => {
    const step: Record<string, number> = { ArrowRight: 0.1, ArrowLeft: -0.1, PageUp: 1, PageDown: -1 };
    if (event.key in step) player.seek(player.km + step[event.key]);
    else if (event.key === "Home") player.seek(0);
    else if (event.key === "End") player.seek(story.lengthKm);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  return node;
}

// ── Small controls ──────────────────────────────────────────────────────────────────────────

export function playButton(player: Player): HTMLButtonElement {
  const button = html("button", { class: "pp-play", type: "button" });
  const paint = () => {
    button.textContent = player.playing ? "Pause" : player.km >= player.story.lengthKm - 0.01 ? "Ride again" : "Ride the course";
    button.setAttribute("aria-pressed", String(player.playing));
  };
  button.addEventListener("click", () => player.toggle());
  player.onChange(paint);
  paint();
  return button;
}

/** One layer at a time. Pressing the one that is on turns it off again. */
export function layerChips(player: Player): HTMLElement {
  const group = html("div", { class: "pp-chips", role: "group", "aria-label": "Show on the course" });
  group.append(html("span", { class: "pp-chips__label", text: "Show on the course" }));
  const buttons = LAYERS.map((layer) => {
    const button = html("button", { class: "pp-chip", type: "button", text: layer.label });
    if (layer.sample) button.append(" ", tape());
    button.addEventListener("click", () => player.setLayer(layer.id));
    group.append(button);
    return { layer, button };
  });
  const paint = () => buttons.forEach(({ layer, button }) => button.setAttribute("aria-pressed", String(player.layer === layer.id)));
  player.onChange(paint);
  paint();
  return group;
}

/** What the chosen layer says about this spot, in a line. Empty when no layer is on. */
export function layerLine(player: Player): HTMLElement {
  const node = html("p", { class: "pp-layerline" });
  const paint = () => {
    const readout = player.story.at(player.km);
    const lines: Record<Layer, string> = {
      none: "",
      hills: `${show.grade(readout.gradePercent)} here. ${show.difficultyWords(readout.difficulty)}.`,
      sun: `${show.sunWords(readout)}. In direct sun for ${show.exposure(readout.exposure)} of this stretch: the low end if the trees are in leaf.`,
      wind: `${show.windWords(readout)}. Wedges point the way the wind blows; you run left to right.`,
      aid: readout.nextAid ? `Next table in ${show.km(Math.max(0, readout.nextAid.km - readout.km))} km: ${readout.nextAid.offers.join(", ")}.` : "No more aid stations.",
      say: player.story.notes.filter((note) => Math.abs(note.km - readout.km) < 2.5).map((note) => `Runners say: ${note.text}`).join(" ") || "Nothing reported near here.",
    };
    node.textContent = lines[player.layer];
    node.classList.toggle("pp-layerline--hearsay", player.layer === "say");
  };
  player.onChange(paint);
  paint();
  return node;
}

/** The owner's direction: photoreal is the headline look, the white model is what works with no set-up. */
export function photorealButton(): HTMLElement {
  const wrap = html("div", { class: "pp-photoreal" });
  const button = html("button", { class: "pp-chip", type: "button", text: "Make it photoreal" });
  const panel = html(
    "div",
    { class: "pp-photoreal__panel", hidden: true },
    html("b", { text: "Photoreal needs your own Google key." }),
    html("p", { text: "About five minutes to set up, and free for personal use at this scale. You paste it in once; it stays in your browser and never leaves it. Without a key you get the white model of the real buildings, and every number works the same." }),
    html("p", { class: "pp-photoreal__stub", text: "(Prototype: this button doesn't do anything yet.)" }),
  );
  button.addEventListener("click", () => (panel.hidden = !panel.hidden));
  wrap.append(button, panel);
  return wrap;
}

export function everythingLink(player: Player): HTMLAnchorElement {
  const anchor = html("a", { class: "pp-everything", text: "Show everything" });
  const paint = () => (anchor.href = `/mockups/poster.html?course=${player.story.course.id}&km=${player.km.toFixed(2)}`);
  player.onChange(paint);
  paint();
  return anchor;
}

import "@fontsource-variable/archivo/wdth.css";
import "./style.css";
import { browserStorage } from "./browser-storage";
import { BundleError, loadCourseBundle } from "./bundle/loader";
import type { CourseBundle } from "./bundle/types";
import { type Encoding, ENCODINGS } from "./core/encoding";
import { heightRow, hillsLayer } from "./core/hills-layer";
import { type Layer, type LayerState, type MarkLabel, NO_LAYERS, onScreen, type OnScreen, pressEverything, pressLayer, type StripRow } from "./core/layers";
import { createPlanner, type Planner, plannerCourse, type PlannerCourse, type RacePlan } from "./core/planner";
import { formatElapsed } from "./core/race-clock";
import { positionAtKm } from "./core/scrub";
import { sentenceAt } from "./core/sentence";
import { loadStripSize, saveStripSize } from "./core/strip-size";
import { loadThemeChoice, resolveTheme, saveThemeChoice, type ThemeChoice } from "./core/theme";
import { distanceNumber, type Units, unitName } from "./core/units";
import { COURSES, courseFromUrl, urlForCourse } from "./courses";
import { html, link } from "./dom";
import { createLayerBar } from "./explore/layer-bar";
import { createMapControls, MAP_HELP, type MapControls } from "./explore/map-controls";
import { createPlanSummary } from "./explore/plan-summary";
import { createReadout } from "./explore/readout";
import { createSentence, sentenceInWords } from "./explore/sentence-view";
import { renderSources } from "./explore/sources";
import { createStripEdge } from "./explore/strip-edge";
import { createSwitches } from "./explore/switches";
import { createPhotoreal, type Photoreal } from "./photoreal/photoreal";
import { createPhotorealPanel, type PhotorealPanel } from "./photoreal/photoreal-panel";
import { createPlanPanel } from "./plan/plan-panel";
import { loadPlan, loadUnits, rememberedCourseId, savePlan, saveUnits } from "./plan/plan-store";
import { createSplitsTable } from "./plan/splits-table";
import { showCourseLine } from "./scene/course-line";
import { createGlobe, frameCourse, goTo, isStillFramed, showMapTheme, showRunner, toggleStraightDown, watchCameraHeight } from "./scene/globe";
import { createMapLabels, type MapLabel, type MapLabels } from "./scene/map-labels";
import { loadPhotorealTiles } from "./scene/photoreal-tileset";
import type { Placement } from "./scene/placement";
import { PROVIDER_ATTRIBUTIONS } from "./scene/providers";
import { createStrip, type KeyEntry, rowsHeightAtSizeOne } from "./strip/strip";
import type { Viewer } from "cesium";

/** What is on screen: one course, one runner's plan for it, where on it the runner is, and its layers. */
interface Showing {
  bundle: CourseBundle;
  course: PlannerCourse;
  planner: Planner;
  km: number;
  /** The layers that exist for this course: the one list a later ticket adds its layer to (PLAN.md D35, D47). */
  layers: Layer[];
  /** What those layers put on screen for the switches as they are now. Worked out when a switch is pressed, not on every scrub. */
  screen: OnScreen;
  /** The strip's own row, there whatever the layers are doing. */
  baseRow: StripRow;
}

/** The layers a course has. Each later ticket adds its own here, and gets its switch, its rows, its marks and its clause. */
function layersFor(bundle: CourseBundle): Layer[] {
  return [hillsLayer(bundle)];
}

const storage = browserStorage();
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let units: Units = loadUnits(storage);
let themeChoice: ThemeChoice = loadThemeChoice(storage);
let layerState: LayerState = NO_LAYERS;
let stripSize = loadStripSize(storage);
let fullMap = false;
/** How the course is drawn on the map now: draped on the keyless map's ground, at the road's own height over photoreal imagery (issue #22). */
let placement: Placement = "draped";
let viewer: Viewer | undefined;
let mapControls: MapControls | undefined;
let mapLabels: MapLabels | undefined;
let photoreal: Photoreal | undefined;
let photorealPanel: PhotorealPanel | undefined;
let showing: Showing | undefined;
let loading = "";

const planDialog = byId("plan-dialog") as HTMLDialogElement;
const planSummary = createPlanSummary(byId("plan-summary"), () => planDialog.showModal());
const planPanel = createPlanPanel(byId("plan"), usePlan);
const splitsTable = createSplitsTable(byId("splits"), (km) => {
  planDialog.close(); // the runner picked a split to look at: get the plan out of the way of it
  scrubTo(km);
});
const switches = createSwitches(byId("switches"), useUnits, useTheme);
const layerBar = createLayerBar(byId("layers"), (id) => useLayers(pressLayer(layerState, id)), () => useLayers(pressEverything(layerState)));
const strip = createStrip(byId("strip"), scrubTo);
const stripEdge = createStripEdge(byId("strip-edge"), {
  rowsHeightAtSizeOne: () => rowsHeightAtSizeOne({ layerRows: showing?.screen.rows ?? [] }),
  onSize: (size) => useStripSize(size),
  onDone: (size) => {
    saveStripSize(storage, size);
    reframeIfUntouched(mapWasUntouched);
    mapWasUntouched = false;
  },
});
/** Whether the map was still as the last framing left it when a resize began: read before the map changes shape. */
let mapWasUntouched = false;
const readoutView = createReadout(byId("readout"));
const sentenceView = createSentence(byId("sentence"));

async function start(): Promise<void> {
  showTheme();
  // Esc is the way out of anything that has taken over the screen. (A dialog takes Esc for itself first.)
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && fullMap && !document.querySelector("dialog[open]")) useFullMap(false);
  });
  systemDark.addEventListener("change", showTheme); // "Auto" keeps following the system while the app is open
  switches.show(units, themeChoice);

  const picker = byId("course-picker") as HTMLSelectElement;
  for (const course of COURSES) {
    picker.append(new Option(course.label, course.id));
  }
  picker.addEventListener("change", () => {
    history.replaceState(null, "", urlForCourse(picker.value));
    void show(picker.value);
  });
  window.addEventListener("popstate", () => {
    picker.value = courseFromUrl(window.location.search, rememberedCourseId(storage));
    void show(picker.value);
  });
  picker.value = courseFromUrl(window.location.search, rememberedCourseId(storage));
  await show(picker.value);
}

async function show(courseId: string): Promise<void> {
  loading = courseId;
  let bundle: CourseBundle;
  try {
    bundle = await loadCourseBundle(courseId);
  } catch (err) {
    showError(err instanceof BundleError ? err.message : `Something went wrong loading the course: ${String(err)}`);
    return;
  }
  if (loading !== courseId) return; // the runner picked another course while this one loaded
  hideError();
  document.title = `${bundle.course.name} · GeoPace`;
  renderAttributions(bundle);
  renderSources(byId("sources"), bundle);

  if (!viewer) {
    viewer = createGlobe(byId("globe"));
    mapLabels = createMapLabels(viewer, byId("map-labels"));
    const map = viewer;
    mapControls = createMapControls(byId("map-controls"), byId("globe"), map, {
      wholeCourse: () => frameWholeCourse(flightSeconds()),
      whereIAm: goToRunner,
      straightDown: () => toggleStraightDown(map, flightSeconds()),
      fullMap: () => useFullMap(!fullMap),
    });
    showTheme();
  }
  photoreal ??= startPhotoreal(viewer);

  const course = plannerCourse(bundle);
  const layers = layersFor(bundle);
  showing = { bundle, course, planner: createPlanner(course, loadPlan(storage, course)), km: 0, layers, screen: onScreen(layerState, layers), baseRow: heightRow(bundle) };
  showPlan();
  // Framed last: the strip has just taken its height, and the map is whatever is left.
  frameWholeCourse(0);
}

/** The runner changed their Race Plan: remember it, and re-time everything where they stand. */
function usePlan(plan: RacePlan): void {
  if (!showing) return;
  showing.planner = createPlanner(showing.course, plan);
  savePlan(storage, plan);
  showPlan();
}

/** Kilometres or miles: every distance on screen follows, and the plan itself is untouched (PLAN.md D42). */
function useUnits(next: Units): void {
  units = next;
  saveUnits(storage, next);
  showPlan();
}

function useTheme(next: ThemeChoice): void {
  themeChoice = next;
  saveThemeChoice(storage, next);
  showTheme();
}

function showTheme(): void {
  const theme = resolveTheme(themeChoice, { systemPrefersDark: systemDark.matches });
  document.documentElement.dataset.theme = theme;
  if (viewer) showMapTheme(viewer, theme);
}

function useLayers(next: LayerState): void {
  layerState = next;
  const untouched = viewer !== undefined && isStillFramed(viewer);
  showLayers();
  reframeIfUntouched(untouched);
}

/**
 * The map has just changed shape (the strip opened, was resized, or went away). If the runner
 * hadn't moved the map, fit the whole course into its new shape; if they had, it is theirs and
 * stays where it is. `untouched` has to be read before the change: afterwards it is too late to tell.
 */
function reframeIfUntouched(untouched: boolean): void {
  if (untouched) requestAnimationFrame(() => frameWholeCourse(0));
}

/** The runner dragged the strip's top edge: the rows follow at once; the map settles when the drag ends. */
function useStripSize(size: number): void {
  if (stripSize === size) return;
  mapWasUntouched ||= viewer !== undefined && isStillFramed(viewer);
  stripSize = size;
  showStrip(); // only the strip: the marks and labels on the map don't change with its size
}

/** The map on the full screen: the readout, the strip and all but one line of the credits step aside. */
function useFullMap(on: boolean): void {
  const untouched = viewer !== undefined && isStillFramed(viewer);
  fullMap = on;
  byId("explore").toggleAttribute("data-full-map", on);
  // The credits fold to one word, one press away; the map's own credits stay on the map.
  (byId("credits-more") as HTMLDetailsElement).open = !on;
  mapControls?.showFullMap(on);
  reframeIfUntouched(untouched);
}

function showPlan(): void {
  if (!showing) return;
  switches.show(units, themeChoice);
  photorealPanel?.showUnits(units);
  planSummary.show(showing.planner, units);
  planPanel.show(showing.course, showing.planner, units);
  splitsTable.show(showing.planner, units);
  showLayers();
}

/**
 * The course on the map, and the layer that is on put in all three places at once: its marks on
 * the course line, its rows on the strip, and (through scrubTo) its clause in the sentence. Off,
 * it leaves all three, and the plain blue line is what is left on the map.
 */
function showLayers(): void {
  if (!showing || !viewer || !mapLabels) return;
  const { bundle, layers } = showing;
  const screen = (showing.screen = onScreen(layerState, layers));
  layerBar.show(layerState, layers);
  showStrip();
  showCourseLine(viewer, bundle, screen.lineMarks, placement);
  mapLabels.show([...endLabels(bundle), ...screen.lineLabels.map((label) => markLabel(bundle, label))], placement);
  scrubTo(showing.km);
}

/**
 * The photoreal imagery has taken the plain ground's place, or given it back: everything drawn on
 * the course moves with it. Over the imagery the line, its marks, the runner and the labels are at
 * the road's own height, from the Course Bundle; on the keyless map they are draped on the ground.
 */
function usePlacement(next: Placement): void {
  if (placement === next) return;
  placement = next;
  showLayers(); // the course line with its marks, the labels, and through scrubTo the runner
}

/** The strip as it should be now: its rows, its key, and the size the runner has made it. */
function showStrip(): void {
  if (!showing) return;
  const { bundle, baseRow, screen } = showing;
  strip.show({ lengthKm: showing.planner.lengthKm, landmarks: bundle.course.landmarks, baseRow, layerRows: screen.rows, key: keyFor(bundle, screen), size: stripSize, units });
  stripEdge.show(stripSize);
}

/**
 * What the marks on screen mean, in a line under the strip. Nothing while no layer is on: the
 * first screen needs no key (PLAN.md principle 8). With a layer on, its marks on the course line
 * come first, since an edge that is black here, white there and dashed somewhere else is a riddle
 * without it; then the encodings that are in use.
 */
function keyFor(bundle: CourseBundle, screen: OnScreen): KeyEntry[] {
  if (layerState.active === null && !layerState.everything) return [];
  const used = new Set<Encoding>([...screen.rows.map((row) => row.encoding), ...screen.lineMarks.map((mark) => mark.encoding)]);
  if (bundle.measured.elevation_not_measured.length > 0) used.add("not-measured");
  const active = showing?.layers.find((layer) => layer.id === layerState.active);
  const marks = active?.key ? [{ name: `${active.name}.`, meaning: `${active.key} A thin white edge is just the course.` }] : [];
  return [...marks, ...(Object.keys(ENCODINGS) as Encoding[]).filter((encoding) => used.has(encoding)).map((encoding) => ({ name: `${ENCODINGS[encoding].name}.`, meaning: ENCODINGS[encoding].meaning }))];
}

function endLabels(bundle: CourseBundle): MapLabel[] {
  const line = bundle.measured.course_line;
  const last = line.km.length - 1;
  const place = (text: string, i: number): MapLabel => ({ lat: line.lat[i], lon: line.lon[i], roadHeightM: line.ellipsoid_height_m[i], text, look: "place", priority: Number.POSITIVE_INFINITY, onPick: () => scrubTo(line.km[i]) });
  return [place("Start", 0), place("Finish", last)];
}

function markLabel(bundle: CourseBundle, label: MarkLabel): MapLabel {
  const at = positionAtKm(bundle.measured.course_line, label.atKm);
  return { lat: at.lat, lon: at.lon, roadHeightM: at.roadHeightM, text: label.text(units), look: label.encoding, note: label.note, priority: label.priority, onPick: () => scrubTo(label.startKm) };
}

/** Scrubbing: the strip's cursor, the readout, the sentence, the runner on the map and the sun, moved as one. */
function scrubTo(km: number): void {
  if (!showing || !viewer) return;
  const { planner, bundle } = showing;
  const readout = planner.at(km);
  showing.km = readout.km;
  const place = positionAtKm(bundle.measured.course_line, readout.km);
  const sentence = sentenceAt({ bundle, planner, km: readout.km, units, layerClause: showing.screen.clause });

  // What a screen reader says for the strip. It can't see grey, so a carried-over time says so in words.
  const carriedOver = planner.carriedOver ? `, from the ${planner.carriedOver.fromEdition} start time, carried over` : "";
  strip.setKm(readout.km, `${unitName(units)} ${distanceNumber(readout.km, units, 1)}, ${readout.localClock}${carriedOver}, ${formatElapsed(readout.elapsedSeconds)} elapsed. ${sentenceInWords(sentence)}`);
  readoutView.show(planner, readout, units);
  sentenceView.show(sentence);
  showRunner(viewer, place, readout.instant, placement);
}

/** How long the camera takes to get somewhere. With reduced motion asked for, it doesn't travel: it is there. */
function flightSeconds(): number {
  return reducedMotion.matches ? 0 : 0.8;
}

function goToRunner(): void {
  if (!showing || !viewer) return;
  goTo(viewer, positionAtKm(showing.bundle.measured.course_line, showing.km), flightSeconds());
}

/** The whole course, in the part of the map that the readout block leaves clear. */
function frameWholeCourse(seconds: number): void {
  if (!showing || !viewer) return;
  const block = document.querySelector<HTMLElement>(".where");
  const overTheMap = block && getComputedStyle(block).position === "absolute";
  frameCourse(viewer, showing.bundle.measured.course_line, overTheMap ? block.offsetWidth : 0, seconds);
}

/**
 * Photoreal is an extra on top of the scene, made once. Nothing else in the app waits for it or
 * asks it anything, so whatever happens to the imagery, the course, the strip and the plan carry on.
 */
function startPhotoreal(globe: Viewer): Photoreal {
  const controller = createPhotoreal({ storage, loadTiles: (key) => loadPhotorealTiles(globe, key, (inPlace) => usePlacement(inPlace ? "road-height" : "draped")) });
  const panel = (photorealPanel = createPhotorealPanel(byId("photoreal"), controller));
  panel.showUnits(units);
  // The camera's height is only wanted, and only asked of the terrain service, while photoreal is showing.
  let stopWatchingHeight: (() => void) | undefined;
  controller.onChange((state) => {
    panel.show(state);
    if (state.look === "photoreal") {
      stopWatchingHeight ??= watchCameraHeight(globe, (meters) => panel.showCameraHeight(meters));
    } else {
      stopWatchingHeight?.();
      stopWatchingHeight = undefined;
    }
  });
  void controller.start();
  return controller;
}

function renderAttributions(bundle: CourseBundle): void {
  byId("map-help").textContent = `The map: ${MAP_HELP}`;
  const list = byId("attributions");
  list.replaceChildren();
  for (const { text, url } of [...bundle.attributions, ...PROVIDER_ATTRIBUTIONS]) {
    list.append(html("li", {}, link(url, text)));
  }
}

function showError(message: string): void {
  const box = byId("error");
  box.textContent = message;
  box.hidden = false;
}

function hideError(): void {
  byId("error").hidden = true;
}

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`index.html is missing #${id}`);
  return node;
}

void start();

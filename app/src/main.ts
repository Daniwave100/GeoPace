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
import { createRide, type Ride, type RideCamera } from "./core/ride";
import { rideCourseFor, type RideScene, rideView } from "./core/ride-view";
import { positionAtKm } from "./core/scrub";
import { sentenceAt } from "./core/sentence";
import { type Stop, stopLine, stopsAround, stopsFor } from "./core/stops";
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
import { createRideControls } from "./ride/ride-controls";
import { loadPlan, loadUnits, rememberedCourseId, savePlan, saveUnits } from "./plan/plan-store";
import { createSplitsTable } from "./plan/splits-table";
import { showCourseLine } from "./scene/course-line";
import { createGlobe, frameCourse, goTo, isStillFramed, showMapTheme, showMoment, toggleStraightDown, watchCameraHeight } from "./scene/globe";
import { createMapDots, type MapDot, type MapDots } from "./scene/map-dots";
import { createMapLabels, type MapLabel, type MapLabels } from "./scene/map-labels";
import { loadPhotorealTiles } from "./scene/photoreal-tileset";
import type { Placement } from "./scene/placement";
import { PROVIDER_ATTRIBUTIONS } from "./scene/providers";
import { createRideCamera, type RideCamera as CameraInTheScene, roadHeightOnTheMap } from "./scene/ride-camera";
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
  /** The places the Ride slows down for, which the strip names along its top (core/stops.ts). */
  stops: Stop[];
  /** What the Ride's camera needs of the course: the course line and the Stops. */
  rideScene: RideScene;
  /** The Ride through this course: off until the runner rides, and then a mode of this same screen (PLAN.md D34). */
  ride: Ride;
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
/** How the course is drawn on the map now: draped over the keyless map, at road height over photoreal imagery (issue #22). */
let placement: Placement = "draped";
/** The camera the runner last chose for the Ride: kept from one course to the next. */
let rideCameraChoice: RideCamera = "from-above";
/** Whether the screen was in the Ride when its controls were last shown: leaving it gives the whole course back. */
let wasRiding = false;
let rideCamera: CameraInTheScene | undefined;
let viewer: Viewer | undefined;
let mapControls: MapControls | undefined;
let mapLabels: MapLabels | undefined;
let mapDots: MapDots | undefined;
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
const strip = createStrip(byId("strip"), scrubTo, (held) => showing?.ride.hold(held));
const rideControls = createRideControls(byId("ride"), {
  playPause: () => showing?.ride.playPause(),
  back: () => showing?.ride.back(),
  rideToNextStop: () => showing?.ride.rideToNextStop(),
  useCamera: (camera) => {
    rideCameraChoice = camera;
    showing?.ride.useCamera(camera);
  },
  leave: () => showing?.ride.leave(),
});
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
    if (isSpaceForTheRide(event)) {
      event.preventDefault(); // the space bar would otherwise scroll the page
      showing?.ride.playPause();
    }
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
    mapDots = createMapDots(viewer, byId("map-dots"));
    const map = viewer;
    mapControls = createMapControls(byId("map-controls"), byId("globe"), map, {
      wholeCourse: () => frameWholeCourse(flightSeconds()),
      whereIAm: goToRunner,
      straightDown: () => toggleStraightDown(map, flightSeconds()),
      fullMap: () => useFullMap(!fullMap),
    });
    rideCamera = createRideCamera(map, { reducedMotion: () => reducedMotion.matches, now: () => performance.now() });
    pauseTheRideWhenTheMapIsMoved();
    showTheme();
  }
  photoreal ??= startPhotoreal(viewer);

  showing?.ride.leave(); // a Ride through the course that is going away stops asking for frames
  const course = plannerCourse(bundle);
  const layers = layersFor(bundle);
  const stops = stopsFor(bundle);
  const rideScene = { line: bundle.measured.course_line, stops };
  showing = { bundle, course, planner: createPlanner(course, loadPlan(storage, course)), km: 0, layers, screen: onScreen(layerState, layers), baseRow: heightRow(bundle), stops, rideScene, ride: startRide(rideScene) };
  wasRiding = false;
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
  showWhere(showing.km);
}

/**
 * The photoreal imagery has taken the plain ground's place, or given it back: everything drawn on
 * the course moves with it. Over the imagery the line, its marks, the runner and the labels are at
 * the road's own height, from the Course Bundle; on the keyless map they are draped on the ground.
 */
function usePlacement(next: Placement): void {
  if (placement === next) return;
  placement = next;
  showLayers(); // the course line with its marks, the labels, and through showWhere the runner and the end dots
  if (showing?.ride.on) followTheRide(); // the road the camera rides over has changed height with the course
}

/** The strip as it should be now: its rows, its key, and the size the runner has made it. */
function showStrip(): void {
  if (!showing) return;
  const { bundle, baseRow, screen, stops } = showing;
  strip.show({ lengthKm: showing.planner.lengthKm, stops: stops.map((stop) => ({ name: stop.name(units), km: stop.km })), baseRow, layerRows: screen.rows, key: keyFor(bundle, screen), size: stripSize, units });
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
  const place = (text: string, i: number): MapLabel => ({ ...positionAtKm(line, line.km[i]), text, look: "place", priority: Number.POSITIVE_INFINITY, onPick: () => scrubTo(line.km[i]) });
  return [place("Start", 0), place("Finish", last)];
}

function markLabel(bundle: CourseBundle, label: MarkLabel): MapLabel {
  const at = positionAtKm(bundle.measured.course_line, label.atKm);
  return { ...at, text: label.text(units), look: label.encoding, note: label.note, priority: label.priority, onPick: () => scrubTo(label.startKm) };
}

/**
 * Scrubbing: the runner asked to be somewhere, from the strip, a split, or a label on the map.
 * In the Ride it moves the Ride, which carries on from there, and the camera comes along.
 */
function scrubTo(km: number): void {
  if (!showing) return;
  showing.ride.seek(km);
  showWhere(km);
  if (showing.ride.on) followTheRide();
}

/** Where the runner is: the strip's cursor, the readout, the sentence, the runner on the map and the sun, moved as one. */
function showWhere(km: number): void {
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
  mapDots?.show([...endDots(bundle), { id: "runner", look: "runner", place }], placement);
  showMoment(viewer, readout.instant);
  showRideControls();
}

/**
 * The Ride through a course (core/ride.ts). It moves the runner through `showWhere`, exactly as
 * scrubbing does, so the strip, the readout, the sentence, the layer and the sun keep up with it;
 * and it needs nothing from the map, so it carries on whatever happens to the map's tiles.
 */
function startRide(scene: RideScene): Ride {
  const ride = createRide({
    course: rideCourseFor(scene),
    frames: { request: (callback) => requestAnimationFrame(callback), cancel: (handle) => cancelAnimationFrame(handle) },
    reducedMotion: () => reducedMotion.matches,
    onMove: (km) => {
      showWhere(km);
      followTheRide();
    },
    onChange: showRide,
  });
  ride.useCamera(rideCameraChoice);
  return ride;
}

/** The Ride was started, paused, left, or given the other camera. */
function showRide(): void {
  if (!showing) return;
  showRideControls();
  if (showing.ride.on) followTheRide();
  // Left: Explore gets the whole course back, as it opens.
  else if (wasRiding) frameWholeCourse(flightSeconds());
  wasRiding = showing.ride.on;
}

function showRideControls(): void {
  if (!showing) return;
  const { ride, stops } = showing;
  const around = stopsAround(stops, ride.km);
  rideControls.show({ on: ride.on, playing: ride.playing, camera: ride.camera, stopLine: stopLine(stops, ride.km, units), canGoBack: around.back !== null, canRideOn: around.next !== null });
}

/**
 * Take the camera to where the Ride is. The road's height under it is the Course Bundle's own
 * where the course is drawn at road height, and our open terrain's where it is draped on the
 * keyless map; never anything read from photoreal imagery (PLAN.md D5).
 */
function followTheRide(): void {
  if (!showing || !viewer || !rideCamera) return;
  const heightAt = placement === "draped" ? roadHeightOnTheMap(viewer.scene.globe) : undefined;
  rideCamera.show(rideView(showing.rideScene, showing.km, showing.ride.camera, heightAt));
}

/**
 * A hand on the map outranks the Ride: dragging it, scrolling it, its keys and its buttons pause
 * a Ride that is playing, and the map is then the runner's to orbit, pan and zoom until they ride on.
 */
function pauseTheRideWhenTheMapIsMoved(): void {
  const pause = () => showing?.ride.pause();
  const map = byId("globe");
  map.addEventListener("pointerdown", pause, { capture: true });
  map.addEventListener("wheel", pause, { capture: true, passive: true });
  // Every key but the space bar, which is the Ride's own, and Tab, which only passes through.
  map.addEventListener("keydown", (event) => event.key !== " " && event.key !== "Tab" && pause(), { capture: true });
  byId("map-controls").addEventListener("click", pause, { capture: true });
}

/** The space bar plays and pauses the Ride, except where it already means something: in a button, a box, a dialog. */
function isSpaceForTheRide(event: KeyboardEvent): boolean {
  if (event.key !== " " || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (document.querySelector("dialog[open]")) return false;
  return !(event.target instanceof Element && event.target.closest("button, input, select, textarea, summary, a[href]"));
}

/** The small dots at the start and at the finish of the course. */
function endDots(bundle: CourseBundle): MapDot[] {
  const line = bundle.measured.course_line;
  return [
    { id: "start", look: "end", place: positionAtKm(line, line.km[0]) },
    { id: "finish", look: "end", place: positionAtKm(line, line.km[line.km.length - 1]) },
  ];
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

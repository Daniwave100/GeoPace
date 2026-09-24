import "@fontsource-variable/archivo/wdth.css";
import "./style.css";
import { browserStorage } from "./browser-storage";
import { BundleError, loadCourseBundle } from "./bundle/loader";
import type { CourseBundle } from "./bundle/types";
import { loadWhiteModel, type WhiteModel, WhiteModelError } from "./bundle/white-model";
import { aidLayer } from "./core/aid-layer";
import { heightRow, hillsLayer } from "./core/hills-layer";
import { type Layer, type LayerState, type MarkLabel, NO_LAYERS, onScreen, type OnScreen, pressEverything, pressLayer, type StripRow } from "./core/layers";
import { type Vicinity, vicinityOf } from "./core/map-bounds";
import { createPlanner, type Planner, plannerCourse, type PlannerCourse, type RacePlan } from "./core/planner";
import { formatElapsed } from "./core/race-clock";
import { createRide, type HowItMoved, type Ride, RIDE_CAMERAS, type RideCamera } from "./core/ride";
import { spaceBarForTheRide, type WhereThePressLands } from "./core/ride-keys";
import { rideCourseFor, type RideScene, rideView, runnerInTheScene, straightDownView } from "./core/ride-view";
import { positionAtKm } from "./core/scrub";
import { sentenceAt } from "./core/sentence";
import { type Stop, stopLine, stopsAround, stopsFor } from "./core/stops";
import { loadStripSize, saveStripSize } from "./core/strip-size";
import { shadeLayer } from "./core/shade-layer";
import { loadThemeChoice, resolveTheme, saveThemeChoice, type ThemeChoice } from "./core/theme";
import { distanceNumber, type Units, unitName } from "./core/units";
import { loadWhiteModelChoice, saveWhiteModelChoice, type WhiteModelChoice } from "./core/white-model";
import { COURSES, courseFromUrl, urlForCourse } from "./courses";
import { html, link } from "./dom";
import { createKeySheet } from "./explore/key-sheet";
import { createLayerBar } from "./explore/layer-bar";
import { createMapControls, type MapControls } from "./explore/map-controls";
import { createPlanSummary } from "./explore/plan-summary";
import { createReadout } from "./explore/readout";
import { createSentence, sentenceInWords } from "./explore/sentence-view";
import { renderSources } from "./explore/sources";
import { createStripEdge } from "./explore/strip-edge";
import { createSwitches } from "./explore/switches";
import { createWhiteModelSwitches, type WhiteModelSwitches } from "./explore/white-model-switches";
import { createPhotoreal, type Photoreal } from "./photoreal/photoreal";
import { createPhotorealPanel, type PhotorealPanel } from "./photoreal/photoreal-panel";
import { createPlanPanel } from "./plan/plan-panel";
import { createRideControls } from "./ride/ride-controls";
import { loadPlan, loadUnits, rememberedCourseId, savePlan, saveUnits } from "./plan/plan-store";
import { createSplitsTable } from "./plan/splits-table";
import { showCourseLine } from "./scene/course-line";
import { createGlobe, frameCourse, goTo, isFlying, isStillFramed, leftOfMiddle, mapView, showMapTheme, showMoment, toggleStraightDown, useRoadAsGroundWhenHidden, watchCameraHeight } from "./scene/globe";
import { keepTheMapInTheVicinity } from "./scene/map-bounds";
import { createMapDots, type MapDot, type MapDots } from "./scene/map-dots";
import { createMapLabels, type MapLabel, type MapLabels } from "./scene/map-labels";
import { loadPhotorealTiles } from "./scene/photoreal-tileset";
import type { Placement } from "./scene/placement";
import { PROVIDER_ATTRIBUTIONS } from "./scene/providers";
import { createWhiteModel, type WhiteModelInScene } from "./scene/white-model";
import { type CameraInTheScene, createRideCamera, roadHeightOnTheMap } from "./scene/ride-camera";
import { createStrip, rowsHeightAtSizeOne } from "./strip/strip";
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
  /** How far from this course the map may be taken (core/map-bounds.ts, issue #25). */
  vicinity: Vicinity;
  /** The Ride through this course: off until the runner rides, and then a mode of this same screen (PLAN.md D34). */
  ride: Ride;
  /** The city's buildings along this course, as they are getting on: they arrive after everything else (#7). */
  city: City;
}

/** How the city's own buildings are getting on for the course that is showing (app/src/bundle/white-model.ts). */
type City = { state: "none" } | { state: "loading" } | { state: "drawn"; model: WhiteModel } | { state: "failed"; why: string };

/**
 * The layers a course has. Each later ticket adds its own here, and gets its switch, its rows,
 * its marks and its clause. A layer that has nothing to say for this course — Shade, where nobody
 * has the city's buildings — leaves itself out, and gets no switch (PLAN.md D47).
 *
 * Shade is built from the plan as well as the course, because what it says is where the sun is at
 * the moment this runner reaches each 10 m of road: a new wave or a new goal is a new layer.
 */
function layersFor(bundle: CourseBundle, planner: Planner): Layer[] {
  return [hillsLayer(bundle), shadeLayer(bundle, planner), aidLayer(bundle, planner)].filter((layer) => layer !== null);
}

const storage = browserStorage();
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let units: Units = loadUnits(storage);
let themeChoice: ThemeChoice = loadThemeChoice(storage);
let layerState: LayerState = NO_LAYERS;
let stripSize = loadStripSize(storage);
let whiteModelChoice: WhiteModelChoice = loadWhiteModelChoice(storage);
let fullMap = false;
/** How the course is drawn on the map now: draped over the keyless map, at road height over photoreal imagery (issue #22). */
let placement: Placement = "draped";
/** The camera the runner last chose for the Ride: kept from one course to the next. */
let rideCameraChoice: RideCamera = "from-above";
/** How fast the runner last chose to have the Ride play: kept from one course to the next, like the camera. */
let rideSpeedChoice = 1;
/** Whether the screen was in the Ride when its controls were last shown: leaving it gives the whole course back. */
let wasRiding = false;
/** Whether the Ride was playing then: a pause is not a jump, and the camera must not be told it is one. */
let wasPlaying = false;
/** How much of the map's left side the readout block covers; null until it is next measured (`coveredLeftPx`). */
let coveredLeft: number | null = null;
let rideCamera: CameraInTheScene | undefined;
let viewer: Viewer | undefined;
let mapControls: MapControls | undefined;
let mapLabels: MapLabels | undefined;
let mapDots: MapDots | undefined;
let photoreal: Photoreal | undefined;
let photorealPanel: PhotorealPanel | undefined;
let whiteModel: WhiteModelInScene | undefined;
let showing: Showing | undefined;
let loading = "";

const planDialog = byId("plan-dialog") as HTMLDialogElement;
const planSummary = createPlanSummary(byId("plan-summary"), () => {
  showing?.ride.pause(); // a Ride doesn't play on behind the plan
  planDialog.showModal();
});
const planPanel = createPlanPanel(byId("plan"), usePlan);
const splitsTable = createSplitsTable(byId("splits"), (km) => {
  planDialog.close(); // the runner picked a split to look at: get the plan out of the way of it
  scrubTo(km);
});
const switches = createSwitches(byId("switches"), useUnits, useTheme);
const whiteModelSwitches: WhiteModelSwitches = createWhiteModelSwitches(byId("white-model"), useWhiteModel);
// The two sheets behind the first screen: what the marks mean, and where everything comes from
// (PLAN.md D63). Like the plan, a Ride doesn't play on behind either.
const keyDialog = byId("key-dialog") as HTMLDialogElement;
const keySheet = createKeySheet(byId("key"));
const sourcesDialog = byId("sources-dialog") as HTMLDialogElement;
byId("sources-open").addEventListener("click", () => openSheet(sourcesDialog));
const layerBar = createLayerBar(
  byId("layers"),
  (id) => useLayers(pressLayer(layerState, id)),
  () => useLayers(pressEverything(layerState, showing?.layers ?? [])),
  () => openSheet(keyDialog),
);
const strip = createStrip(byId("strip"), scrubTo, (held) => showing?.ride.hold(held));
const rideControls = createRideControls(byId("ride"), {
  playPause: () => showing?.ride.playPause(),
  back: () => showing?.ride.back(),
  useCamera: (camera) => {
    rideCameraChoice = camera;
    showing?.ride.useCamera(camera); // and out of free look: the camera is the Ride's again
  },
  handTheCameraBack: () => showing?.ride.handTheCameraBack(),
  useSpeed: (times) => {
    rideSpeedChoice = times;
    showing?.ride.useSpeed(times);
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

/** A sheet over the page: whatever is playing under it waits. */
function openSheet(dialog: HTMLDialogElement): void {
  showing?.ride.pause();
  dialog.showModal();
}

async function start(): Promise<void> {
  showTheme();
  // Esc is the way out of anything that has taken over the screen. (A dialog takes Esc for itself first.)
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && fullMap && !document.querySelector("dialog[open]")) useFullMap(false);
    const forTheRide = spaceBarForTheRide(event, { rideOn: showing?.ride.on ?? false, dialogOpen: document.querySelector("dialog[open]") !== null, focus: focusIsOn(event.target) });
    if (forTheRide === null) return;
    event.preventDefault(); // or the space bar scrolls the page, or presses the play button a second time
    if (forTheRide === "play-pause") showing?.ride.playPause();
  });
  // A button is pressed when the space bar comes up, not when it goes down: on the play button that press is already made.
  document.addEventListener("keyup", (event) => {
    if (event.key === " " && focusIsOn(event.target) === "play" && !document.querySelector("dialog[open]")) event.preventDefault();
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

  if (!viewer) {
    viewer = createGlobe(byId("globe"));
    mapLabels = createMapLabels(viewer, byId("map-labels"));
    mapDots = createMapDots(viewer, byId("map-dots"));
    const map = viewer;
    mapControls = createMapControls(byId("map-controls"), byId("globe"), map, {
      takesTheMap: takeTheMap,
      wholeCourse: () => frameWholeCourse(flightSeconds()),
      whereIAm: goToRunner,
      straightDown: () => lookStraightDown(map),
      fullMap: () => useFullMap(!fullMap),
    });
    whiteModel = createWhiteModel(map);
    // While photoreal hides the plain ground, the map's own moves count heights from the road where the runner is.
    useRoadAsGroundWhenHidden(map, () => (showing ? positionAtKm(showing.bundle.measured.course_line, showing.km).ellipsoidHeightM : undefined));
    rideCamera = createRideCamera(map, { reducedMotion: () => reducedMotion.matches, now: () => performance.now() });
    // The map stays in the city (issue #25): the camera is kept in the vicinity of the course that
    // is showing, and can't be taken further out than the whole course needs — except while it is
    // the Ride's or the runner's in free look, both tied to the runner on the course, or in the
    // middle of one of the map's own flights, which is left to land.
    keepTheMapInTheVicinity(map, {
      vicinity: () => showing?.vicinity,
      theMapsOwn: () => !(rideCamera?.holdsTheCamera() ?? false) && !isFlying(map),
      mapView: () => mapView(map, coveredLeftPx()),
    });
    watchForAHandOnTheMap();
    showTheme();
  }
  photoreal ??= startPhotoreal(viewer);

  showing?.ride.leave(); // a Ride through the course that is going away stops asking for frames
  const course = plannerCourse(bundle);
  const planner = createPlanner(course, loadPlan(storage, course));
  const layers = layersFor(bundle, planner);
  const stops = stopsFor(bundle);
  const rideScene: RideScene = { line: bundle.measured.course_line, stops, notMeasured: bundle.measured.elevation_not_measured };
  showing = { bundle, course, planner, km: 0, layers, screen: onScreen(layerState, layers), baseRow: heightRow(bundle), stops, rideScene, vicinity: vicinityOf(bundle.measured.course_line), ride: startRide(rideScene), city: { state: bundle.measured.white_model ? "loading" : "none" } };
  wasRiding = false;
  wasPlaying = false;
  whiteModel?.show(null); // the last course's buildings go with it
  void loadTheCity(bundle);
  showPlan();
  // Framed last: the strip has just taken its height, and the map is whatever is left.
  frameWholeCourse(0);
}

/** The runner changed their Race Plan: remember it, and re-time everything where they stand. */
function usePlan(plan: RacePlan): void {
  if (!showing) return;
  showing.planner = createPlanner(showing.course, plan);
  // A layer can rest on the plan as well as on the course: Sun answers "when you get there".
  showing.layers = layersFor(showing.bundle, showing.planner);
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
  whiteModel?.look(whiteModelChoice, theme);
}

/**
 * The city's real buildings for this course: fetched after everything else and never waited for
 * (#7). The course, the strip, the plan and the Ride are already on screen, and if the buildings
 * never arrive the map is what is left, with the block on the map saying so.
 */
async function loadTheCity(bundle: CourseBundle): Promise<void> {
  const white = bundle.measured.white_model;
  if (!white) return showCity({ state: "none" }, bundle);
  try {
    const model = await loadWhiteModel(bundle.course_id, white.file);
    showCity({ state: "drawn", model }, bundle);
  } catch (err) {
    showCity({ state: "failed", why: err instanceof WhiteModelError ? err.message : String(err) }, bundle);
  }
}

/** The buildings have arrived, or haven't. Ignored if the runner has moved on to another course. */
function showCity(city: City, bundle: CourseBundle): void {
  if (!showing || showing.bundle !== bundle) return;
  showing.city = city;
  whiteModel?.show(city.state === "drawn" ? city.model : null);
  showWhiteModel();
}

/** The runner asked for more or fewer buildings, or for the shadows to stop. */
function useWhiteModel(next: WhiteModelChoice): void {
  whiteModelChoice = next;
  saveWhiteModelChoice(storage, next);
  showWhiteModel();
}

/**
 * The White model as it should be now: what the scene draws, and what its switches say. The block
 * steps aside while photoreal has the ground's place, because the city standing there is Google's.
 */
function showWhiteModel(): void {
  whiteModel?.look(whiteModelChoice, resolveTheme(themeChoice, { systemPrefersDark: systemDark.matches }));
  whiteModelSwitches.show(whiteModelChoice, cityInWords(), placement === "road-height" || showing === undefined);
}

/**
 * What the block says under its switches: how the buildings are getting on, while they aren't on
 * screen. Once they are drawn it says nothing: what the corridor is and that the shadows are race
 * day's, not a photograph's, are in Sources & credits, and a note on the map for as long as the
 * buildings showed was one box too many (owner, 09-22).
 */
function cityInWords(): string {
  const city = showing?.city;
  if (!city) return "";
  switch (city.state) {
    case "loading":
      return "Getting the city's buildings…";
    case "none":
      return "No buildings for this course yet: the pipeline hasn't built any.";
    case "failed":
      return "The city's buildings couldn't be loaded, so this is the plain map. Everything else is untouched.";
    case "drawn":
      return "";
  }
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

/** The map on the full screen: the readout and the strip step aside; the one-line footer and the map's own credits stay. */
function useFullMap(on: boolean): void {
  const untouched = viewer !== undefined && isStillFramed(viewer);
  fullMap = on;
  coveredLeft = null; // the readout block has stepped aside, or come back
  byId("explore").toggleAttribute("data-full-map", on);
  mapControls?.showFullMap(on);
  reframeIfUntouched(untouched);
}

function showPlan(): void {
  if (!showing) return;
  switches.show(units, themeChoice);
  photorealPanel?.showUnits(units);
  renderSources(byId("sources"), showing.bundle, units); // one line of it states a distance, in the runner's units
  planSummary.show(showing.planner, units);
  planPanel.show(showing.course, showing.planner, units);
  splitsTable.show(showing.planner, units);
  showWhiteModel();
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
  keySheet.show({ bundle, layers, units }); // every layer the course has, on or off, in the runner's units
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
  // Google's photographed city stands where ours would: ours steps aside, switches and all (#7).
  whiteModel?.standAside(next === "road-height");
  showWhiteModel();
  showLayers(); // the course line with its marks, the labels, and through showWhere the runner and the end dots
  // A camera the Ride is holding needs no telling: it asks where it should be before every frame,
  // and the road it rides over has just changed height with the course.
}

/** The strip as it should be now: its rows, and the size the runner has made it. */
function showStrip(): void {
  if (!showing) return;
  const { baseRow, screen, stops } = showing;
  strip.show({ lengthKm: showing.planner.lengthKm, stops: stops.map((stop) => ({ name: stop.name(units), km: stop.km })), baseRow, layerRows: screen.rows, size: stripSize, units });
  stripEdge.show(stripSize);
}

function endLabels(bundle: CourseBundle): MapLabel[] {
  const line = bundle.measured.course_line;
  const last = line.km.length - 1;
  const place = (text: string, i: number): MapLabel => ({ ...positionAtKm(line, line.km[i]), text, look: "place", priority: Number.POSITIVE_INFINITY, onPick: () => scrubTo(line.km[i]) });
  return [place("Start", 0), place("Finish", last)];
}

function markLabel(bundle: CourseBundle, label: MarkLabel): MapLabel {
  const at = positionAtKm(bundle.measured.course_line, label.atKm);
  return { ...at, text: label.text(units), glyphs: label.glyphs, look: label.chip ? "chip" : label.encoding, note: label.note, priority: label.priority, onPick: () => scrubTo(label.startKm) };
}

/**
 * Scrubbing: the runner asked to be somewhere, from the strip, a split, or a label on the map.
 * In the Ride it moves the Ride, which carries on from there, and the camera comes along.
 */
function scrubTo(km: number): void {
  if (!showing) return;
  showing.ride.scrubbedTo(km);
  showWhere(km, true);
  if (showing.ride.on) followTheRide("jump");
}

/**
 * Where the runner is: the strip's cursor, the readout, the sentence, the runner on the map and the
 * sun, moved as one. `byHand` when the runner put themselves there, which is always worth saying.
 */
function showWhere(km: number, byHand = false): void {
  if (!showing || !viewer) return;
  const { planner, bundle } = showing;
  const readout = planner.at(km);
  showing.km = readout.km;
  const place = positionAtKm(bundle.measured.course_line, readout.km);
  const sentence = sentenceAt({ bundle, planner, km: readout.km, units, layerClauses: showing.screen.clauses });

  // What a screen reader says for the strip. It can't see grey, so a carried-over time says so in words.
  // A Ride that is playing moves the strip quietly: sixty new sentences a second is noise, and the
  // Ride says each Stop as it arrives (ride-controls.ts). A scrub by hand during it is said.
  const carriedOver = planner.carriedOver ? `, from the ${planner.carriedOver.fromEdition} start time, carried over` : "";
  const spoken = `${unitName(units)} ${distanceNumber(readout.km, units, 1)}, ${readout.localClock}${carriedOver}, ${formatElapsed(readout.elapsedSeconds)} elapsed. ${sentenceInWords(sentence)}`;
  strip.setKm(readout.km, spoken, showing.ride.playing && !byHand);
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
  const course = rideCourseFor(scene);
  // Which way each camera faces at every metre is worked out the first time it is asked, about
  // 30 ms each: done now, while nothing is moving, rather than in the frame that follows the first Play.
  setTimeout(() => RIDE_CAMERAS.forEach((camera) => rideView(scene, 0, camera)), 0);
  const ride = createRide({
    course,
    frames: { request: (callback) => requestAnimationFrame(callback), cancel: (handle) => cancelAnimationFrame(handle) },
    reducedMotion: () => reducedMotion.matches,
    onMove: (km, how) => {
      showWhere(km);
      followTheRide(how);
    },
    onChange: showRide,
  });
  ride.useCamera(rideCameraChoice);
  ride.useSpeed(rideSpeedChoice);
  return ride;
}

/** The Ride was started, paused, left, or given the other camera. */
function showRide(): void {
  if (!showing) return;
  showWhere(showing.km); // paused, the strip says where that is; and the controls follow
  // Started, resumed after the runner looked around, or given the other camera: the camera glides
  // to where the Ride is. A pause is none of those. The camera is a frame behind the Ride when it
  // comes (CesiumJS draws before the Ride's own frame runs), and told "jump" it would glide those
  // last two metres with a rise in the middle: On the road, a nod of the whole view at every pause.
  const paused = wasPlaying && !showing.ride.playing;
  if (showing.ride.on) followTheRide(paused ? "riding" : "jump");
  else if (wasRiding) {
    // Left: the camera is the runner's again, and Explore gets the whole course back, as it opens.
    rideCamera?.letGo();
    frameWholeCourse(flightSeconds());
  }
  wasRiding = showing.ride.on;
  wasPlaying = showing.ride.playing;
}

function showRideControls(): void {
  if (!showing) return;
  const { ride, stops } = showing;
  const around = stopsAround(stops, ride.km);
  rideControls.show({
    on: ride.on,
    playing: ride.playing,
    camera: ride.camera,
    freeLook: ride.freeLook,
    speed: ride.speed,
    stopLine: stopLine(stops, ride.km, units),
    arrivedAt: around.on === null ? null : stopLine(stops, stops[around.on].km, units),
    canGoBack: around.back !== null,
    canRideOn: around.next !== null,
  });
  // In the Ride the map's Straight down button says what the Ride's camera does; outside it, what the map's does (map-controls.ts).
  if (ride.on) mapControls?.showStraightDown(ride.straightDown);
}

/**
 * Keep the camera on the runner (scene/ride-camera.ts), either as the Ride's own camera or, in
 * free look, as the runner's to turn round them. Both are asked afresh before every frame, so they
 * follow the runner, the camera the runner picked, and the road's height: the Course Bundle's own
 * where the course is drawn at road height, our open terrain's where it is draped on the keyless
 * map; never anything read from photoreal imagery (PLAN.md D5).
 */
function followTheRide(how: HowItMoved): void {
  if (!showing || !viewer || !rideCamera) return;
  const riding = showing; // this course's Ride: where its runner is, is read again each frame
  const map = viewer;
  const roadHeight = () => (placement === "draped" ? roadHeightOnTheMap(map.scene.globe) : undefined);
  if (riding.ride.freeLook) {
    rideCamera.lookAround(() => runnerInTheScene(riding.rideScene, riding.km, { heightAt: roadHeight() }));
    return;
  }
  rideCamera.follow(() => {
    const options = { heightAt: roadHeight(), leftOfRunner: leftOfMiddle(map, coveredLeftPx()) };
    return riding.ride.straightDown ? straightDownView(riding.rideScene, riding.km, options) : rideView(riding.rideScene, riding.km, riding.ride.camera, options);
  }, how);
}

/**
 * The map's Straight down and Tilted. In the Ride they are a way of following the runner: the
 * Ride's own camera looks straight down on them, north up, or tilted again, and the Ride plays on
 * (PLAN.md D67; the owner, 09-24: "When I click straight down, it doesnt follow the person/dot").
 * In Explore the map is the map: it tips over where it is, and a glide under way gives way first.
 */
function lookStraightDown(map: Viewer): void {
  const ride = showing?.ride;
  if (ride?.on) {
    ride.lookStraightDown(!ride.straightDown);
    return;
  }
  takeTheMap();
  toggleStraightDown(map, flightSeconds());
}

/**
 * A hand on the map: in the Ride the camera becomes the runner's to turn round themselves, and the
 * Ride plays on (PLAN.md D54, issue #28). In Explore nothing of ours happens: the map is the map,
 * and dragging, scrolling and Ctrl + drag are CesiumJS's own.
 */
function handOnTheMap(): void {
  showing?.ride.lookAround();
}

/**
 * The map's own buttons and keys still outrank the Ride: zoom, Whole course, Where I am, Straight
 * down and the arrow keys pause a Ride that is playing, end free look, and stop a glide where it
 * is. The map is then the runner's to orbit, pan and zoom until they ride on. (Whole course can
 * only mean leaving the runner; whether zoom should move the camera in free look in and out
 * instead is the owner's to judge on the built thing, issue #28.)
 */
function takeTheMap(): void {
  if (!showing) return;
  const { ride } = showing;
  ride.pause();
  ride.handTheCameraBack(); // out of free look: what the map flies to is the map's own, not the runner's
  rideCamera?.letGo(); // after both, each of which asks for one last view of its own
}

function watchForAHandOnTheMap(): void {
  const map = byId("globe");
  map.addEventListener("pointerdown", handOnTheMap, { capture: true });
  map.addEventListener("wheel", handOnTheMap, { capture: true, passive: true });
}

/** What has the keyboard's focus, as far as the space bar cares (core/ride-keys.ts). */
function focusIsOn(target: EventTarget | null): WhereThePressLands["focus"] {
  if (!(target instanceof Element)) return "page";
  if (target.closest(".ride-play, .ride-start, .ride-cameras, .ride-speed")) return "play";
  if (target.closest("button, input, select, textarea, summary, a[href]")) return "control";
  if (target.closest("#globe")) return "map";
  if (target.closest("#strip")) return "strip";
  return "page";
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
  frameCourse(viewer, showing.bundle.measured.course_line, coveredLeftPx(), seconds);
}

/**
 * How much of the map's left side is under the readout block: none where the blocks stack under
 * the map, or with the map on the full screen. Measured once per layout, not on every frame of
 * the Ride: asking the page for a size in the middle of a frame makes it lay itself out again.
 */
function coveredLeftPx(): number {
  if (coveredLeft === null) {
    const block = document.querySelector<HTMLElement>(".where");
    coveredLeft = block && getComputedStyle(block).position === "absolute" ? block.offsetWidth : 0;
  }
  return coveredLeft;
}
window.addEventListener("resize", () => (coveredLeft = null));

// The readout block lies over the map and has to fit it. Its giant numeral is sized by the window,
// and with every layer on the strip takes so much of the window that the block overran the map by
// a line and scrolled (owner, 09-22: it "shouldn't be a scrollable field"). The map's own height
// is handed to the stylesheet, which shrinks the numeral only when the map is short (.readout-km).
new ResizeObserver((entries) => byId("explore").style.setProperty("--map-h", `${Math.round(entries[0].contentRect.height)}px`)).observe(byId("globe"));

/**
 * Photoreal is an extra on top of the scene, made once. Nothing else in the app waits for it or
 * asks it anything, so whatever happens to the imagery, the course, the strip and the plan carry on.
 */
function startPhotoreal(globe: Viewer): Photoreal {
  const controller = createPhotoreal({ storage, loadTiles: (key) => loadPhotorealTiles(globe, key, (inPlace) => usePlacement(inPlace ? "road-height" : "draped")) });
  // A Ride doesn't play on behind the key panel, any more than behind the plan.
  const panel = (photorealPanel = createPhotorealPanel(byId("photoreal"), controller, () => showing?.ride.pause()));
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

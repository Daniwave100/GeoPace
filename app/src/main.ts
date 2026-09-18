import "./style.css";
import { BundleError, loadCourseBundle } from "./bundle/loader";
import type { CourseBundle } from "./bundle/types";
import { createPlanner, type Planner, plannerCourse, type PlannerCourse, type RacePlan } from "./core/planner";
import { formatElapsed } from "./core/race-clock";
import { positionAtKm } from "./core/scrub";
import { sunPosition } from "./core/solar";
import { COURSES, courseFromUrl, urlForCourse } from "./courses";
import { createPlanPanel } from "./plan/plan-panel";
import { loadPlan, type PlanStorage, rememberedCourseId, savePlan } from "./plan/plan-store";
import { createReadout } from "./plan/readout";
import { createSentence } from "./plan/sentence";
import { createSplitsTable } from "./plan/splits-table";
import { KM_AXIS, renderProfile } from "./profile/profile";
import { createGlobe, showCourse, showRunner } from "./scene/globe";
import { html, link } from "./dom";
import { PROVIDER_ATTRIBUTIONS } from "./scene/providers";
import { createStrip } from "./strip/strip";
import type { Viewer } from "cesium";

/** What is on screen: one course, one runner's plan for it, and where on it the runner is. */
interface Showing {
  bundle: CourseBundle;
  course: PlannerCourse;
  planner: Planner;
  km: number;
}

const storage = browserStorage();
const planPanel = createPlanPanel(byId("plan"), usePlan);
const strip = createStrip(insetToChart(byId("strip")), scrubTo);
const readoutView = createReadout(byId("readout"));
const sentence = createSentence(byId("sentence"));
const splitsTable = createSplitsTable(byId("splits"), scrubTo);
let viewer: Viewer | undefined;
let showing: Showing | undefined;
let loading = "";

async function start(): Promise<void> {
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
  byId("course-name").textContent = `${bundle.course.name} · ${bundle.course.city}`;
  renderAttributions(bundle);
  renderProfile(byId("profile"), bundle);
  viewer ??= createGlobe(byId("globe"));
  showCourse(viewer, bundle);

  const course = plannerCourse(bundle);
  const planner = createPlanner(course, loadPlan(storage, course));
  showing = { bundle, course, planner, km: 0 };
  strip.showCourse(planner.lengthKm);
  showPlan();
}

/** The runner changed their Race Plan: remember it, and re-time everything where they stand. */
function usePlan(plan: RacePlan): void {
  if (!showing) return;
  showing.planner = createPlanner(showing.course, plan);
  savePlan(storage, plan);
  showPlan();
}

function showPlan(): void {
  if (!showing || !viewer) return;
  planPanel.show(showing.course, showing.planner);
  splitsTable.show(showing.planner);
  scrubTo(showing.km);
}

/** Scrubbing: the strip's marker, the readout, the sentence, the runner on the map and the sun, moved as one. */
function scrubTo(km: number): void {
  if (!showing || !viewer) return;
  const { planner } = showing;
  const readout = planner.at(km);
  showing.km = readout.km;
  const place = positionAtKm(showing.bundle.measured.course_line, readout.km);

  // What a screen reader says for the strip. It can't see grey, so a carried-over time says so in words.
  const carriedOver = planner.carriedOver ? `, from the ${planner.carriedOver.fromEdition} start time, carried over` : "";
  strip.setKm(readout.km, `kilometre ${readout.km.toFixed(1)}, ${readout.localClock}${carriedOver}, ${formatElapsed(readout.elapsedSeconds)} elapsed`);
  readoutView.show(planner, readout);
  sentence.show(sunPosition(readout.instant, place.lat, place.lon), place.bearingDeg, planner.carriedOver);
  showRunner(viewer, place, readout.instant);
}

/** Line the strip up with the elevation chart's km axis, so a km on one sits above the same km on the other. */
function insetToChart(stripBox: HTMLElement): HTMLElement {
  stripBox.style.padding = `0 ${KM_AXIS.insetRightPx}px 0 ${KM_AXIS.insetLeftPx}px`;
  stripBox.style.minWidth = `${KM_AXIS.minWidthPx}px`;
  return stripBox;
}

function renderAttributions(bundle: CourseBundle): void {
  const list = byId("attributions");
  list.replaceChildren();
  for (const { text, url } of [...bundle.attributions, ...PROVIDER_ATTRIBUTIONS]) {
    list.append(html("li", {}, link(url, text)));
  }
}

/** The browser's own storage, or a stand-in that remembers nothing where the browser forbids it. */
function browserStorage(): PlanStorage {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined };
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

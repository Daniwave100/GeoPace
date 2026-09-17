import "./style.css";
import { BundleError, loadCourseBundle } from "./bundle/loader";
import type { CourseBundle } from "./bundle/types";
import { COURSES, courseFromUrl, urlForCourse } from "./courses";
import { renderProfile } from "./profile/profile";
import { createGlobe, showCourse } from "./scene/globe";
import { PROVIDER_ATTRIBUTIONS } from "./scene/providers";
import type { Viewer } from "cesium";

let viewer: Viewer | undefined;
let showing = "";

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
    picker.value = courseFromUrl(window.location.search);
    void show(picker.value);
  });
  picker.value = courseFromUrl(window.location.search);
  await show(picker.value);
}

async function show(courseId: string): Promise<void> {
  showing = courseId;
  let bundle: CourseBundle;
  try {
    bundle = await loadCourseBundle(courseId);
  } catch (err) {
    showError(err instanceof BundleError ? err.message : `Something went wrong loading the course: ${String(err)}`);
    return;
  }
  if (showing !== courseId) return; // the runner picked another course while this one loaded
  hideError();
  document.title = `${bundle.course.name} · GeoPace`;
  byId("course-name").textContent = `${bundle.course.name} · ${bundle.course.city}`;
  renderAttributions(bundle);
  renderProfile(byId("profile"), bundle);
  viewer ??= createGlobe(byId("globe"));
  showCourse(viewer, bundle);
}

function renderAttributions(bundle: CourseBundle): void {
  const list = byId("attributions");
  list.replaceChildren();
  for (const { text, url } of [...bundle.attributions, ...PROVIDER_ATTRIBUTIONS]) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = text;
    item.append(link);
    list.append(item);
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

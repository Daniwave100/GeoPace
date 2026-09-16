import "./style.css";
import { BundleError, loadCourseBundle } from "./bundle/loader";
import type { CourseBundle } from "./bundle/types";
import { renderProfile } from "./profile/profile";
import { createGlobe } from "./scene/globe";
import { PROVIDER_ATTRIBUTIONS } from "./scene/providers";

const COURSE_ID = "berlin";

async function start(): Promise<void> {
  let bundle: CourseBundle;
  try {
    bundle = await loadCourseBundle(COURSE_ID);
  } catch (err) {
    showError(err instanceof BundleError ? err.message : `Something went wrong loading the course: ${String(err)}`);
    return;
  }
  document.title = `${bundle.course.name} · GeoPace`;
  byId("course-name").textContent = `${bundle.course.name} · ${bundle.course.city}`;
  renderAttributions(bundle);
  renderProfile(byId("profile"), bundle);
  createGlobe(byId("globe"), bundle);
}

function renderAttributions(bundle: CourseBundle): void {
  const list = byId("attributions");
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

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`index.html is missing #${id}`);
  return node;
}

void start();

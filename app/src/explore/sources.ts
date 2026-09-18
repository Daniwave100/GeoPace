// Where everything comes from, one step away (PLAN.md principle 4): the datasets the Course
// Bundle was built from, with their licences and the day each was fetched, the model behind the
// effort numbers, and the source that locates each landmark. The credits themselves are always on
// screen; this is the detail behind them, closed until asked for.
import type { CourseBundle } from "../bundle/types";
import { html, link } from "../dom";

export function renderSources(container: HTMLElement, bundle: CourseBundle): void {
  const model = bundle.measured.difficulty_model;
  const items = [
    ...bundle.sources.map((source) => html("li", {}, link(source.url, source.title), " ", html("small", { text: `${source.licence}. Fetched ${source.accessed}.${source.note ? ` ${source.note}` : ""}` }))),
    html("li", {}, "Effort vs flat: ", link(model.source, model.name), " ", html("small", { text: model.description })),
    ...bundle.course.landmarks.map((landmark) => html("li", {}, "Landmark: ", link(landmark.source, landmark.name))),
  ];
  container.replaceChildren(html("details", {}, html("summary", { text: "Sources" }), html("ul", { class: "sources" }, ...items)));
}

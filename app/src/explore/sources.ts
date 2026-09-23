// Where everything comes from, one step away (PLAN.md principle 4): the datasets the Course
// Bundle was built from, with their licences and the day each was fetched, the model behind the
// effort numbers, and the source that locates each landmark. The credits are in the same sheet
// (index.html, "Sources & credits"); this is the detail behind them.
import type { CourseBundle } from "../bundle/types";
import { html, link } from "../dom";

export function renderSources(container: HTMLElement, bundle: CourseBundle): void {
  const model = bundle.measured.difficulty_model;
  const items = [
    ...bundle.sources.map((source) => html("li", {}, link(source.url, source.title), " ", html("small", { text: `${source.licence}. Fetched ${source.accessed}.${source.note ? ` ${source.note}` : ""}` }))),
    html("li", {}, "Effort vs flat: ", link(model.source, model.name), " ", html("small", { text: model.description })),
    // What the trees are wearing on race day: a fact about the date, sourced like any other, and
    // the thing the Shade layer's halftone rests on (PLAN.md D60).
    ...(bundle.course.leaves ? [html("li", {}, "Trees on race day: ", link(bundle.course.leaves.source, bundle.course.leaves.state), " ", html("small", { text: bundle.course.leaves.note }))] : []),
    // The city's buildings, as the White model draws them and the shade is worked out from them (D56, D59).
    ...(bundle.measured.white_model
      ? [
          html(
            "li",
            {},
            `The city on the map: ${bundle.measured.white_model.buildings.toLocaleString("en")} real buildings${bundle.measured.white_model.trees ? ` and ${bundle.measured.white_model.trees.toLocaleString("en")} trees` : ""} within ${bundle.measured.white_model.corridor_m} m of the course, drawn as plain blocks. `,
            html("small", { text: "Their shadows are worked out for race day from where the sun stands, never photographed." }),
          ),
        ]
      : []),
    ...bundle.course.landmarks.map((landmark) => html("li", {}, "Landmark: ", link(landmark.source, landmark.name))),
    // The organizer's refreshment points: one line per edition, because every station on a list
    // comes from the same page and fifteen identical links would say less than one (#12).
    ...bundle.editions.flatMap((edition) =>
      edition.aid_stations && edition.aid_stations.length > 0
        ? [
            html(
              "li",
              {},
              `Aid stations, ${edition.edition}: `,
              link(edition.aid_stations[0].source, `${edition.aid_stations.length} refreshment points, the organizer's own list`),
              " ",
              html("small", { text: `Checked ${edition.aid_stations[0].accessed}.${edition.aid_stations.some((station) => station.carried_over) && edition.carried_over ? ` ${edition.carried_over.reason}` : ""}` }),
            ),
          ]
        : [],
    ),
  ];
  container.replaceChildren(html("ul", { class: "sources" }, ...items));
}

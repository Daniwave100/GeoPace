// The two switches for the White model, under "Make it photoreal" on the map: whether the city's
// buildings are drawn, and what their shadows cost to draw.
//
// They live here rather than in the banner because this is where the runner chooses what the city
// looks like, and because they step aside the moment photoreal takes the ground's place: the city
// standing there is then Google's, and a switch that does nothing is worse than no switch.
import { html } from "../dom";
import { segmented } from "../segmented";
import { BUILDINGS_CHOICES, type Buildings, DEFAULT_WHITE_MODEL, SHADOWS_CHOICES, type Shadows, type WhiteModelChoice } from "../core/white-model";

export interface WhiteModelSwitches {
  /**
   * `note` is what the block says under the switches: nothing when the buildings are on screen,
   * and in plain words what is happening when they aren't. `hidden` puts the whole block away.
   */
  show(choice: WhiteModelChoice, note: string, hidden: boolean): void;
}

export function createWhiteModelSwitches(container: HTMLElement, onChoice: (choice: WhiteModelChoice) => void): WhiteModelSwitches {
  let choice: WhiteModelChoice = DEFAULT_WHITE_MODEL;

  const buildings = segmented(
    "Buildings",
    "white-model-buildings",
    BUILDINGS_CHOICES.map(({ choice: value, label, explained }) => ({ value, label, explained })),
    (value) => onChoice({ ...choice, buildings: value as Buildings }),
    "white-model-switch",
  );
  const shadows = segmented(
    "Shadows",
    "white-model-shadows",
    SHADOWS_CHOICES.map(({ choice: value, label, explained }) => ({ value, label, explained })),
    (value) => onChoice({ ...choice, shadows: value as Shadows }),
    "white-model-switch",
  );
  const note = html("p", { class: "white-model-note" });
  const row = (label: string, control: HTMLElement) => html("div", { class: "white-model-row" }, html("span", { "aria-hidden": "true", text: label }), control);
  const block = html("div", { class: "white-model-block" }, row("Buildings", buildings.box), row("Shadows", shadows.box), note);
  container.replaceChildren(block);

  return {
    show(next, nextNote, hidden) {
      choice = next;
      buildings.check(next.buildings);
      shadows.check(next.shadows);
      // With no buildings drawn there are no shadows to set: the switch says so rather than lying.
      shadows.box.toggleAttribute("disabled", next.buildings === "off");
      note.textContent = nextNote;
      container.hidden = hidden;
    },
  };
}

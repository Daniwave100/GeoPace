// The two switches in the banner: kilometres or miles, and the theme. Each is a row of real radio
// buttons drawn as blocks, so the arrow keys move between the choices with no code of ours.
import { THEME_CHOICES, type ThemeChoice } from "../core/theme";
import { UNITS, type Units } from "../core/units";
import { html } from "../dom";

export interface Switches {
  show(units: Units, theme: ThemeChoice): void;
}

export function createSwitches(container: HTMLElement, onUnits: (units: Units) => void, onTheme: (choice: ThemeChoice) => void): Switches {
  const units = segmented(
    "Distances in",
    "units",
    UNITS.map((unit) => ({ value: unit, label: unit, spoken: unit === "mi" ? "miles" : "kilometres" })),
    (value) => onUnits(value as Units),
  );
  const theme = segmented(
    "Theme",
    "theme",
    THEME_CHOICES.map(({ choice, label }) => ({ value: choice, label, spoken: choice === "system" ? "Follow the system's light or dark" : label })),
    (value) => onTheme(value as ThemeChoice),
  );
  container.replaceChildren(units.box, theme.box);
  return {
    show(nextUnits, nextTheme) {
      units.check(nextUnits);
      theme.check(nextTheme);
    },
  };
}

interface Choice {
  value: string;
  label: string;
  /** What a screen reader says, when the label on screen is an abbreviation. */
  spoken: string;
}

function segmented(legend: string, name: string, choices: Choice[], onPick: (value: string) => void): { box: HTMLElement; check(value: string): void } {
  const inputs = choices.map((choice) => html("input", { type: "radio", name, value: choice.value, "aria-label": choice.spoken }));
  const box = html(
    "fieldset",
    { class: "segmented" },
    html("legend", { class: "visually-hidden", text: legend }),
    ...choices.map((choice, index) => html("label", {}, inputs[index], choice.label)),
  );
  for (const input of inputs) input.addEventListener("change", () => input.checked && onPick(input.value));
  return { box, check: (value) => inputs.forEach((input) => (input.checked = input.value === value)) };
}

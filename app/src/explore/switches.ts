// The two switches in the banner: kilometres or miles, and the theme. Each is a row of real radio
// buttons drawn as blocks, so the arrow keys move between the choices with no code of ours.
import { THEME_CHOICES, type ThemeChoice } from "../core/theme";
import { unitName, UNITS, type Units } from "../core/units";
import { segmented } from "../segmented";

export interface Switches {
  show(units: Units, theme: ThemeChoice): void;
}

export function createSwitches(container: HTMLElement, onUnits: (units: Units) => void, onTheme: (choice: ThemeChoice) => void): Switches {
  const units = segmented(
    "Distances in",
    "units",
    UNITS.map((unit) => ({ value: unit, label: unit, explained: unitName(unit, "many") })),
    (value) => onUnits(value as Units),
  );
  const theme = segmented(
    "Theme",
    "theme",
    THEME_CHOICES.map(({ choice, label }) => ({ value: choice, label, explained: choice === "system" ? "follow the system's light or dark" : "" })),
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

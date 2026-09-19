// Light and dark (PLAN.md D31): both are first-class, the app follows the system until the runner
// chooses, and the choice is remembered. The poster is flat ink either way up, so a theme is only
// a swap of the palette's tokens (style.css); this module decides which set is on.
import { type BrowserStorage, readStored, writeStored } from "../browser-storage";

/** What the runner picked. "system" means: whatever the computer is set to, and follow it if it changes. */
export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_CHOICES: { choice: ThemeChoice; label: string }[] = [
  { choice: "system", label: "Auto" },
  { choice: "light", label: "Light" },
  { choice: "dark", label: "Dark" },
];

export type ThemeStorage = Pick<BrowserStorage, "getItem" | "setItem">;

/** Also read by the few lines in index.html that set the theme before the first paint. */
export const THEME_KEY = "geopace.theme";

export function resolveTheme(choice: ThemeChoice, system: { systemPrefersDark: boolean }): Theme {
  if (choice === "system") return system.systemPrefersDark ? "dark" : "light";
  return choice;
}

export function loadThemeChoice(storage: ThemeStorage): ThemeChoice {
  const stored = readStored(storage, THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function saveThemeChoice(storage: ThemeStorage, choice: ThemeChoice): void {
  writeStored(storage, THEME_KEY, choice); // if the browser won't keep it, it lasts for this visit
}

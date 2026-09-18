// Seam: the runner's theme choice + what the system asks for -> the theme on screen, remembered.
import { describe, expect, it } from "vitest";
import { loadThemeChoice, resolveTheme, saveThemeChoice, type ThemeStorage } from "../src/core/theme";

function fakeStorage(initial: Record<string, string> = {}): ThemeStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return { items, getItem: (key) => items[key] ?? null, setItem: (key, value) => void (items[key] = value) };
}

describe("the theme", () => {
  it("follows the system until the runner chooses", () => {
    expect(loadThemeChoice(fakeStorage())).toBe("system");
    expect(resolveTheme("system", { systemPrefersDark: true })).toBe("dark");
    expect(resolveTheme("system", { systemPrefersDark: false })).toBe("light");
  });

  it("stays what the runner chose, whatever the system asks for", () => {
    expect(resolveTheme("light", { systemPrefersDark: true })).toBe("light");
    expect(resolveTheme("dark", { systemPrefersDark: false })).toBe("dark");
  });

  it("remembers the choice across a reload, including the choice to follow the system again", () => {
    const storage = fakeStorage();
    saveThemeChoice(storage, "dark");
    expect(loadThemeChoice(storage)).toBe("dark");
    saveThemeChoice(storage, "system");
    expect(loadThemeChoice(storage)).toBe("system");
  });

  it("reads anything else in storage as following the system, and survives blocked storage", () => {
    expect(loadThemeChoice(fakeStorage({ "geopace.theme": '"sepia"' }))).toBe("system");
    expect(loadThemeChoice(fakeStorage({ "geopace.theme": "not json" }))).toBe("system");
    const blocked: ThemeStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadThemeChoice(blocked)).toBe("system");
    expect(() => saveThemeChoice(blocked, "dark")).not.toThrow();
  });
});

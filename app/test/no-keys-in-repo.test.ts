// Guard: no key in the repo, ever (CLAUDE.md), and so none in the built app, which is made
// from the repo. It reads every file git tracks and looks for the two shapes a runner's own key
// can have. It also closes the side door: Vite copies any `VITE_…` environment variable the source
// mentions straight into the built app, so the source may not read a key that way.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "../..");
const KEY_SHAPES = [
  /AIza[0-9A-Za-z_-]{35}/, // a Google Maps key
  /eyJ[0-9A-Za-z_-]{10,}\.eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/, // a JSON Web Token, which is what a Cesium ion token is
];
// Lock files are long lists of random-looking checksums, written by tools and never by hand.
const NOT_READ = /(^|\/)(package-lock\.json|uv\.lock)$/;

/** Every file git tracks, or null in a copy of the repo that has no git (a zip download): nothing to guard there. */
function trackedFiles(): string[] | null {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter((file) => file && !NOT_READ.test(file));
  } catch {
    return null;
  }
}

const tracked = trackedFiles() ?? [];
const holdsAKey = (text: string): boolean => KEY_SHAPES.some((shape) => shape.test(text));

describe("no keys in the repo", () => {
  it("would notice a key of either kind", () => {
    expect(holdsAKey(`const key = "${"AIza" + "x".repeat(35)}";`)).toBe(true);
    expect(holdsAKey(["token: eyJ" + "a".repeat(20), "eyJ" + "b".repeat(20), "c".repeat(20)].join("."))).toBe(true);
    expect(holdsAKey("nothing to see")).toBe(false);
  });

  it.skipIf(tracked.length === 0)("finds none in any tracked file", () => {
    expect(tracked.length).toBeGreaterThan(50);
    expect(tracked.filter((file) => holdsAKey(readFileSync(resolve(REPO, file), "utf8")))).toEqual([]);
  });

  it.skipIf(tracked.length === 0)("tracks no .env file, and the app's source reads no key from the build's environment", () => {
    expect(tracked.filter((file) => /(^|\/)\.env(\.|$)/.test(file))).toEqual([]);
    const source = tracked.filter((file) => file.startsWith("app/src/") || file === "app/vite.config.ts");
    expect(source.filter((file) => /import\.meta\.env\.VITE_|process\.env/.test(readFileSync(resolve(REPO, file), "utf8")))).toEqual([]);
  });
});

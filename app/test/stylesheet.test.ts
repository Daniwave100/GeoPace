// Seam: the classes the app puts on its elements <-> the rules in the stylesheet. The app has no
// component framework tying the two together, so a class can lose its rule without anything
// failing: the layer switches once spent a commit as plain grey browser buttons because a block
// of rules was cut along with a neighbour. This reads both sides and checks they still meet.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const css = readFileSync(join(SRC, "style.css"), "utf8");
const page = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

/** Every .ts file of the app itself. The mockups are pages of their own, with their own stylesheets. */
function appFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return name === "mockups" ? [] : appFiles(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

/** Class names written out in the code: `class: "a b"`, `class="a b"`, and the fixed parts of `class: \`a ${…}\``. */
function classesIn(text: string): string[] {
  const written = [...text.matchAll(/class(?:Name)?\s*[:=]\s*(["'`])([^"'`]*)\1/g)].map((match) => match[2].replace(/\$\{[^}]*\}?/g, " "));
  return written.flatMap((names) => names.split(/\s+/)).filter((name) => /^[a-z][a-z0-9-]*$/.test(name));
}

/** Classes that need no rule of their own: the whole-number part of the numeral takes its parent's look, and the camera's height is a plain status line. */
const NO_RULE_NEEDED = new Set(["readout-km-whole", "photoreal-camera"]);

/**
 * Classes handed to a helper as an argument, where `classesIn` can't see them: the segmented
 * control's own and the look passed to it (segmented.ts, ride-controls.ts), the player's way back
 * to the map, and its way out of free look. Without these, the banner's switches could lose their
 * rules and nothing would fail.
 */
const PASSED_AS_ARGUMENTS = ["segmented", "ride-cameras", "ride-leave", "ride-back-to-cinematic"];

describe("the stylesheet", () => {
  const used = new Set([...appFiles(SRC).flatMap((file) => classesIn(readFileSync(file, "utf8"))), ...classesIn(page), ...PASSED_AS_ARGUMENTS]);

  it("has a rule for every class the app puts on an element", () => {
    const missing = [...used].filter((name) => !NO_RULE_NEEDED.has(name) && !new RegExp(`\\.${name}(?![a-z0-9-])`).test(css));
    expect(missing).toEqual([]);
  });

  it("still draws the controls a runner presses: a switch that is off, and one that is on", () => {
    expect(css).toMatch(/^\.switch \{/m);
    expect(css).toMatch(/^\.switch\[aria-pressed="true"\] \{/m);
    expect(css).toMatch(/^\.button \{/m);
    expect(css).toMatch(/^\.strip-edge \{/m);
  });
});

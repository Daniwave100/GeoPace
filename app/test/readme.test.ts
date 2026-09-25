// Seam: the repo's front page, README.md, and the media it shows (issue #50). GitHub draws
// whatever the file says: a GIF renamed or a heading reworded leaves a broken image or a link that
// goes nowhere, with no error anywhere. So the page is checked the way GitHub reads it: every file
// it points at exists, every link within the page lands on a heading, and every GIF it plays is
// small enough to load on a phone.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "../..");
const MEDIA = resolve(REPO, "docs/media");
const PAGES = ["README.md", "docs/media/README.md"];

/** The page with its code blocks taken out: a `#` or a bracket inside one is code, not Markdown. */
function prose(path: string): string {
  return readFileSync(resolve(REPO, path), "utf8").replace(/^```[\s\S]*?^```/gm, "");
}

/** Every link and image a page points at: `[…](target)`, `![…](target)` and `<img src="target">`. */
function targets(path: string): string[] {
  const text = prose(path);
  const markdown = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
  const html = [...text.matchAll(/<(?:img|a)\s[^>]*(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  return [...markdown, ...html];
}

/** The anchor GitHub gives a heading: lower case, punctuation and emoji dropped, each space a hyphen. */
function anchorOf(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
}

function anchors(path: string): string[] {
  return [...prose(path).matchAll(/^#{1,6} +(.+)$/gm)].map((match) => anchorOf(match[1]));
}

/** Everything in docs/media but its own note. */
function mediaFiles(): string[] {
  return readdirSync(MEDIA).filter((name) => name !== "README.md" && !name.startsWith("."));
}

/** A GIF plays by itself on GitHub, and every one of them loads on a phone: 5 MB each, the hero a little more. */
const MOST_BYTES = { hero: 8 * 1024 * 1024, gif: 5 * 1024 * 1024 };

describe("GitHub's anchors", () => {
  it("are a heading in lower case, punctuation dropped, spaces as hyphens", () => {
    expect(anchorOf("How it's built")).toBe("how-its-built");
    expect(anchorOf("Status, licence and what's next")).toBe("status-licence-and-whats-next");
    expect(anchorOf("⚡ Quick Start")).toBe("-quick-start");
  });
});

describe.each(PAGES)("%s", (page) => {
  it("points only at files that are in the repo", () => {
    const local = targets(page).filter((target) => !/^(https?:|mailto:|#)/.test(target));
    const base = resolve(REPO, page, "..");
    expect(local.filter((target) => !existsSync(resolve(base, decodeURI(target.split("#")[0]))))).toEqual([]);
  });

  it("links within itself only to its own headings", () => {
    const within = targets(page).filter((target) => target.startsWith("#")).map((target) => target.slice(1));
    expect(within.filter((anchor) => !anchors(page).includes(anchor))).toEqual([]);
  });
});

describe("the media", () => {
  it("open the README with a hero GIF", () => {
    const firstImage = /!\[[^\]]*\]\(([^)\s]+)\)/.exec(prose("README.md"))?.[1];
    expect(firstImage).toMatch(/^docs\/media\/hero-[\w-]+\.gif$/);
  });

  it("are GIFs small enough to load on a phone", () => {
    const tooBig = mediaFiles()
      .filter((name) => name.endsWith(".gif"))
      .filter((name) => statSync(resolve(MEDIA, name)).size > (name.startsWith("hero") ? MOST_BYTES.hero : MOST_BYTES.gif));
    expect(tooBig).toEqual([]);
  });

  it("are each named in the media note, which says what they show", () => {
    const note = readFileSync(resolve(MEDIA, "README.md"), "utf8");
    expect(mediaFiles().filter((name) => !note.includes(name))).toEqual([]);
  });
});

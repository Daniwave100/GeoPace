// Seam: the Pinokio launcher at the repo root (PLAN.md D66). Pinokio redraws its menu from
// `pinokio.js` whenever a step of a script finishes, asking only what exists and what is running,
// so the menu is checked as exactly that: a function of those answers. Start is checked by running
// its own command and reading the output the way Pinokio reads it, because a pattern that never
// matches leaves Start saying "Starting" forever, with no error anywhere.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "../..");
const load = createRequire(import.meta.url);

interface MenuItem {
  text: string;
  href: string;
  default?: boolean;
}
interface Info {
  exists(path: string): boolean;
  running(path: string): boolean;
  local(path: string): Record<string, unknown> | undefined;
}
const launcher = load(resolve(REPO, "pinokio.js")) as { menu(kernel: unknown, info: Info): Promise<MenuItem[]> };

/** The menu Pinokio would draw, as what a runner sees: each item's words, where it goes, and whether it is the one selected. */
async function menu(state: { installed?: boolean; running?: string[]; url?: string }) {
  const info: Info = {
    exists: (path) => path === "app/node_modules" && state.installed === true,
    running: (path) => (state.running ?? []).includes(path),
    local: (path) => (path === "start.js" && state.url ? { url: state.url } : undefined),
  };
  const items = await launcher.menu({}, info);
  return items.map((item) => ({ text: item.text, href: item.href, selected: item.default === true }));
}

describe("the Pinokio menu", () => {
  it("offers a fresh copy only Install, already selected", async () => {
    expect(await menu({})).toEqual([{ text: "Install", href: "install.js", selected: true }]);
  });

  it("shows only the install's terminal while it runs, even once the first packages have landed", async () => {
    const installing = [{ text: "Installing", href: "install.js", selected: true }];
    expect(await menu({ running: ["install.js"] })).toEqual(installing);
    expect(await menu({ installed: true, running: ["install.js"] })).toEqual(installing);
  });

  it("offers an installed copy Start, already selected, then Update, Install again and Reset", async () => {
    expect(await menu({ installed: true })).toEqual([
      { text: "Start", href: "start.js", selected: true },
      { text: "Update", href: "update.js", selected: false },
      { text: "Install", href: "install.js", selected: false },
      { text: "Reset", href: "reset.js", selected: false },
    ]);
  });

  it("shows only Start's terminal until the app says where it is", async () => {
    expect(await menu({ installed: true, running: ["start.js"] })).toEqual([{ text: "Starting", href: "start.js", selected: true }]);
  });

  it("puts Open GeoPace first and selects it once Start knows the address, with the terminal after it", async () => {
    expect(await menu({ installed: true, running: ["start.js"], url: "http://127.0.0.1:5173" })).toEqual([
      { text: "Open GeoPace", href: "http://127.0.0.1:5173", selected: true },
      { text: "Terminal", href: "start.js", selected: false },
    ]);
  });

  // Update reinstalls with `npm ci`, which first deletes the packages. A menu that saw them gone would
  // select Install, and Pinokio starts a selected script by itself: two installs in one folder at once.
  it("shows only Update's terminal while it runs, even while its reinstall has cleared the packages", async () => {
    const updating = [{ text: "Updating", href: "update.js", selected: true }];
    expect(await menu({ installed: true, running: ["update.js"] })).toEqual(updating);
    expect(await menu({ installed: false, running: ["update.js"] })).toEqual(updating);
  });

  it("shows only Reset's terminal while it runs, including once it has removed the packages", async () => {
    const resetting = [{ text: "Resetting", href: "reset.js", selected: true }];
    expect(await menu({ installed: true, running: ["reset.js"] })).toEqual(resetting);
    expect(await menu({ installed: false, running: ["reset.js"] })).toEqual(resetting);
  });
});

interface Step {
  method: string;
  params: { path?: string; message?: string | string[]; on?: { event: string; done?: boolean }[]; url?: string };
}
const start = load(resolve(REPO, "start.js")) as { daemon?: boolean; run: Step[] };

// Pinokio's reading of a terminal, from its own source (pinokiod 8.0.40, kernel/shell.js and kernel/shells.js):
// colours are stripped before any pattern is tried (Vite prints the port in bold), an event is a "/pattern/flags"
// string, and a script stops with an error screen when the output says "error:" or "errno ".
const COLOURS = new RegExp(
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-Za-z=><~]))",
  "gi",
);
const PINOKIO_STOPS_ON = [/error:/i, /errno /i];
function asPinokioReadsIt(event: string): RegExp {
  const parts = /^\/(.+)\/([dgimsuy]*)$/s.exec(event);
  if (!parts) throw new Error(`not a "/pattern/" event: ${event}`);
  return new RegExp(parts[1], parts[2].includes("g") ? parts[2] : `${parts[2]}g`);
}
/** What `local.set` stores from `{{input.event[n]}}`: that group of the event's first match. */
function fillIn(template: string, event: RegExpMatchArray): string {
  const group = /^\{\{input\.event\[(\d)\]\}\}$/.exec(template);
  if (!group) throw new Error(`a template this test does not read: ${template}`);
  return event[Number(group[1])];
}

/** Runs Start's own command where Start runs it, as a terminal would see it, until its pattern matches. */
async function runStart(): Promise<{ before: string; event: RegExpMatchArray | null; stop(): void }> {
  const [shell] = start.run;
  const command = ([] as string[]).concat(shell.params.message ?? []).join(" && ");
  const pattern = asPinokioReadsIt(shell.params.on![0].event);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_ENV" && !name.startsWith("VITEST")));
  const child = spawn(command, { cwd: resolve(REPO, shell.params.path ?? "."), env: { ...env, FORCE_COLOR: "1" }, shell: true, detached: process.platform !== "win32" });
  const stop = () => {
    if (child.pid === undefined) return;
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else process.kill(-child.pid, "SIGTERM"); // the whole group: npm, and the Vite it started
    } catch {
      // already gone
    }
  };
  let output = "";
  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const event = await new Promise<RegExpMatchArray | null>((settle) => {
    const read = (chunk: Buffer) => {
      output += chunk.toString();
      const found = [...output.replace(COLOURS, "").matchAll(pattern)][0];
      if (found) settle(found);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("exit", () => settle(null));
    giveUp = setTimeout(() => settle(null), 20_000);
  });
  clearTimeout(giveUp);
  const plain = output.replace(COLOURS, "");
  return { before: event ? plain.slice(0, event.index) : plain, event, stop };
}

describe("Start", () => {
  it("keeps the app running after its steps and finds the address Vite prints, port and all, bound to this computer only", { timeout: 30_000 }, async () => {
    expect(start.daemon).toBe(true);
    const remember = start.run[1];
    expect(remember.method).toBe("local.set");
    const { before, event, stop } = await runStart();
    try {
      expect(event, `Start's pattern never matched. It saw:\n${before}`).not.toBeNull();
      expect(PINOKIO_STOPS_ON.filter((stops) => stops.test(before))).toEqual([]);
      const url = fillIn(remember.params.url!, event!);
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d{2,5}$/);
      const page = await fetch(url);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("<title>GeoPace</title>");
    } finally {
      stop();
    }
  });
});

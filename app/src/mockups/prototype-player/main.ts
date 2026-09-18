// PROTOTYPE — throwaway (branch prototype/player-screen). See shared.ts for the question.
// Three variants of the first screen, switchable via ?variant=A|B|C, on /mockups/prototype-player.html
import "@fontsource-variable/archivo/wdth.css";
import "./prototype.css";

import { loadCourseBundle } from "../../bundle/loader";
import { buildStory } from "../story";
import { html } from "../svg";
import { createPlayer } from "./shared";
import { VARIANTS } from "./variants";

const params = new URLSearchParams(window.location.search);
const variant = VARIANTS.find((candidate) => candidate.key === params.get("variant")) ?? VARIANTS[0];
const courseId = params.get("course") === "berlin" ? "berlin" : "nyc";
const stage = document.getElementById("stage") as HTMLElement;

const story = buildStory(await loadCourseBundle(courseId), { goalFinishSeconds: 4 * 3600 });
const player = createPlayer(story, Number(params.get("km") ?? story.lengthKm * 0.58));
variant.mount(stage, player);

// Space plays and pauses from anywhere, like every video player.
window.addEventListener("keydown", (event) => {
  if (event.key !== " " || (event.target instanceof HTMLElement && event.target.matches("button, a, input, select"))) return;
  player.toggle();
  event.preventDefault();
});

// ── The floating switcher: not part of any design, and never shipped ────────────────────────
if (import.meta.env.DEV) {
  const go = (step: number, course = courseId) => {
    const next = VARIANTS[(VARIANTS.indexOf(variant) + step + VARIANTS.length) % VARIANTS.length];
    window.location.search = new URLSearchParams({ variant: next.key, course, km: player.km.toFixed(2) }).toString();
  };
  const state = html("span", { class: "proto-bar__state" });
  const previous = html("button", { type: "button", "aria-label": "Previous variant", text: "←" });
  const following = html("button", { type: "button", "aria-label": "Next variant", text: "→" });
  const course = html("button", { type: "button", text: courseId === "nyc" ? "Switch to Berlin" : "Switch to New York" });
  previous.addEventListener("click", () => go(-1));
  following.addEventListener("click", () => go(1));
  course.addEventListener("click", () => go(0, courseId === "nyc" ? "berlin" : "nyc"));
  document.body.append(
    html("div", { class: "proto-bar" }, previous, html("span", { class: "proto-bar__label" }, html("b", { text: `${variant.key} · ${variant.name}` }), html("small", { text: variant.pitch })), following, course, state),
  );
  const paint = () => (state.textContent = `km ${player.km.toFixed(2)} · ${player.playing ? "playing" : "paused"} · layer: ${player.layer}`);
  player.onChange(paint);
  paint();
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLElement && event.target.matches("button, a, input, select, [role=slider]")) return;
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  });
}

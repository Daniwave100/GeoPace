// The "Make it photoreal" control on the map, and the panel behind it where the runner pastes
// their own key (PLAN.md D30, D43, D44). Plain on purpose; the look arrives with #6. What it must
// get right:
//   - with no key it explains what is needed, where to get it, how long that takes and what it
//     costs, every fact with its source, instead of failing silently or nagging;
//   - it says which kind of key it recognized and the one place that key will be sent;
//   - the key is masked as it is typed and never shown again, only its last four characters, so it
//     can't end up in a screenshot or a screen recording. The box is deliberately not a password
//     box: browsers offer to save those to a password manager, which would be a second place the
//     key is kept, and one that may sync it to other machines;
//   - when photoreal is showing, it says the imagery's shadows are illustrative (D4);
//   - when the imagery can't be had, it says why in words a runner can act on, and says it to a
//     screen reader too.
import { html, link, sourceLink } from "../dom";
import { KEY_PROVIDERS, type KeyProvider, type OwnKey, recognizeKey } from "./key";
import type { Photoreal, PhotorealProblem, PhotorealState } from "./photoreal";
import { ILLUSTRATIVE_SHADOWS, KEY_HELP, type Sourced, WHAT_A_LOAD_IS } from "./setup-help";

export interface PhotorealPanel {
  show(state: PhotorealState): void;
  /** How high the camera is above the ground, for judging how low the imagery holds up (PLAN.md D33). Null when unknown. */
  showCameraHeight(meters: number | null): void;
}

const NOT_A_KEY =
  "That isn't a Google Maps key or a Cesium ion token, so it hasn't been sent anywhere. A Google Maps key starts with “AIza”. A Cesium ion token is much longer and starts with “eyJ”. Copy the whole thing, and nothing else.";

const CAMERA_HEIGHT_CAVEAT = "Measured from open terrain data, not from the imagery, and good to a few metres. On a bridge it counts from the ground or water underneath.";

export function createPhotorealPanel(container: HTMLElement, photoreal: Pick<Photoreal, "useKey" | "turnOn" | "turnOff" | "forgetKey">): PhotorealPanel {
  let state: PhotorealState | undefined;

  // On the map. The main button is never truly disabled: a disabled button drops the keyboard's
  // focus on the floor. While photoreal loads it says so and ignores presses instead.
  const main = html("button", { type: "button", class: "photoreal-main" });
  const settings = html("button", { type: "button", class: "photoreal-settings", text: "Key", "aria-label": "Photoreal key settings" });
  const status = html("p", { class: "photoreal-status" });
  const cameraHeight = html("p", { class: "photoreal-status photoreal-camera", title: CAMERA_HEIGHT_CAVEAT });
  // What a screen reader is told. It is always on the page, and only its words change: a message
  // that appears together with the box holding it is often not read out at all.
  const spoken = html("p", { class: "visually-hidden", role: "status" });

  // In the panel.
  const remembered = html("p", { class: "photoreal-remembered" });
  const problem = html("p", { class: "photoreal-problem" });
  const box = html("input", {
    type: "text",
    class: "photoreal-secret",
    id: "photoreal-key",
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    "aria-describedby": "photoreal-recognized photoreal-error",
  });
  const recognized = html("p", { class: "plan-fact", id: "photoreal-recognized" });
  const error = html("p", { class: "plan-error", id: "photoreal-error", role: "alert" });
  const use = html("button", { type: "submit", text: "Use this key" });
  const forget = html("button", { type: "button", text: "Forget my key" });
  const close = html("button", { type: "button", text: "Close" });

  const form = html("form", { class: "photoreal-form", novalidate: true }, html("label", { for: "photoreal-key", text: "Paste your key or token" }), box, recognized, error, html("div", { class: "photoreal-buttons" }, use, forget, close));
  const dialog = html(
    "dialog",
    { class: "photoreal-dialog", "aria-labelledby": "photoreal-heading" },
    html("h2", { id: "photoreal-heading", text: "Make it photoreal" }),
    html("p", {
      text: "Photoreal is Google's photographed 3D city under the course. It needs a key, and GeoPace can't come with one, so it uses yours. Everything else in GeoPace works without it.",
    }),
    remembered,
    problem,
    form,
    html("p", {
      class: "plan-note",
      text: "Your key stays in this browser. It is never put in GeoPace's files, and it is sent only to the map provider it belongs to. “Forget my key” removes it.",
    }),
    html("h3", { text: "Getting a key" }),
    keyHelp("cesium-ion"),
    keyHelp("google"),
    html("p", { class: "plan-note" }, ...sourced(WHAT_A_LOAD_IS)),
  );
  container.replaceChildren(html("div", { class: "photoreal-control" }, main, settings), status, cameraHeight, spoken, dialog);

  main.addEventListener("click", () => {
    if (!state?.key) openPanel();
    else if (state.look === "photoreal") photoreal.turnOff();
    else if (state.look === "keyless") void photoreal.turnOn();
  });
  settings.addEventListener("click", openPanel);
  close.addEventListener("click", () => dialog.close());
  forget.addEventListener("click", () => {
    photoreal.forgetKey();
    box.value = "";
    showRecognized();
    box.focus(); // the button that was pressed is gone now; the focus goes somewhere useful
  });
  box.addEventListener("input", showRecognized);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const pasted = box.value;
    if (!recognizeKey(pasted)) {
      error.textContent = pasted.trim() === "" ? "Paste your key or token first." : NOT_A_KEY;
      return;
    }
    // The key leaves the box the moment it is taken, so it is never left sitting on screen.
    box.value = "";
    showRecognized();
    dialog.close();
    void photoreal.useKey(pasted);
  });

  function openPanel(): void {
    error.textContent = "";
    if (!dialog.open) dialog.showModal();
  }

  /** While the runner types: which kind of key this is, and the one place it will be sent. */
  function showRecognized(): void {
    error.textContent = "";
    const provider = recognizeKey(box.value)?.provider;
    recognized.textContent = provider ? `That is a ${KEY_PROVIDERS[provider].keyName}. It will be sent to ${KEY_PROVIDERS[provider].company} (${KEY_PROVIDERS[provider].sentTo}) and nowhere else.` : "";
  }

  return {
    show(next) {
      state = next;
      const { look, key } = next;
      main.textContent = look === "photoreal" ? "Turn photoreal off" : look === "loading" ? "Loading photoreal…" : "Make it photoreal";
      main.setAttribute("aria-disabled", String(look === "loading"));
      settings.hidden = key === null; // with no key, the main button opens the panel itself

      const trouble = next.problem && key ? problemInWords(next.problem, key.provider) : "";
      status.textContent = look === "photoreal" ? ILLUSTRATIVE_SHADOWS : trouble;
      status.classList.toggle("photoreal-trouble", look !== "photoreal" && trouble !== "");
      cameraHeight.hidden = look !== "photoreal";
      spoken.textContent = look === "photoreal" ? `Photoreal is on. ${ILLUSTRATIVE_SHADOWS}` : look === "loading" ? "Loading photoreal." : trouble;

      remembered.hidden = key === null;
      remembered.textContent = key ? `${rememberedInWords(key, next.thisVisitOnly)} Paste another to replace it.` : "";
      problem.hidden = trouble === "";
      problem.textContent = trouble;
      forget.hidden = key === null;
    },
    showCameraHeight(meters) {
      cameraHeight.textContent = meters === null ? "" : `Camera: about ${Math.max(0, Math.round(meters))} m above the ground.`;
    },
  };
}

function rememberedInWords(key: OwnKey, thisVisitOnly: boolean): string {
  const which = `A ${KEY_PROVIDERS[key.provider].keyName} ending in “${key.secret.slice(-4)}”`;
  return thisVisitOnly ? `${which} is in use for this visit only: this browser wouldn't keep it (a private window, perhaps).` : `${which} is remembered in this browser.`;
}

/** Why photoreal isn't showing, and what the runner can do about it. */
function problemInWords(problem: PhotorealProblem, provider: KeyProvider): string {
  const { company, noun } = KEY_PROVIDERS[provider];
  switch (problem) {
    case "refused":
      return `${company} refused this ${noun}, so you are on the plain map. ${KEY_HELP[provider].ifRefused} Then press “Make it photoreal” again.`;
    case "over-limit":
      return `${company} says this ${noun} has been used too much for now, so you are on the plain map. The allowance resets with time; ${company}'s own dashboard shows how much is left.`;
    case "unreachable":
      return `${company} couldn't be reached, so you are on the plain map. Check your connection, then press “Make it photoreal” again. Everything else keeps working.`;
    case "tiles-failing":
      return "The photoreal imagery stopped arriving, so you are back on the plain map. Your plan and the course are untouched. Press “Make it photoreal” to try again.";
  }
}

function keyHelp(provider: KeyProvider): HTMLElement {
  const help = KEY_HELP[provider];
  return html(
    "section",
    { class: "photoreal-help" },
    html("h4", { text: help.heading }),
    ...help.cost.map((fact) => html("p", {}, ...sourced(fact))),
    html("p", {}, `${help.time} Start at `, link(help.startAt.url, help.startAt.text), "."),
    html("ol", {}, ...help.steps.map((step) => html("li", { text: step }))),
    html("p", { class: "plan-fact" }, "Steps: ", sourceLink(help.stepsSource)),
  );
}

function sourced(fact: Sourced): (Node | string)[] {
  return [`${fact.text} `, sourceLink(fact)];
}

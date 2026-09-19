// A choice between a few things, as a row of real radio buttons drawn as blocks: the arrow keys
// move between the choices with no code of ours, and a screen reader hears a group of radios. The
// banner's two switches are these (explore/switches.ts), and so is the Ride's choice of camera.
import { html } from "./dom";

export interface Choice {
  value: string;
  label: string;
  /** Said after the label by a screen reader, when the label on screen is an abbreviation: "km (kilometres)". Empty when the label says it all. */
  explained: string;
}

export interface Segmented {
  box: HTMLElement;
  check(value: string): void;
}

/** `className` adds to the look: the banner's is paper on black, a block on the map is ink on paper. */
export function segmented(legend: string, name: string, choices: Choice[], onPick: (value: string) => void, className = ""): Segmented {
  const inputs = choices.map((choice) => html("input", { type: "radio", name, value: choice.value }));
  const box = html(
    "fieldset",
    { class: ["segmented", className].filter(Boolean).join(" ") },
    html("legend", { class: "visually-hidden", text: legend }),
    // The name a screen reader says starts with the words on screen, so voice control can find it.
    ...choices.map((choice, index) => html("label", {}, inputs[index], choice.label, ...(choice.explained ? [html("span", { class: "visually-hidden", text: ` (${choice.explained})` })] : []))),
  );
  for (const input of inputs) input.addEventListener("change", () => input.checked && onPick(input.value));
  return {
    box,
    // Only what is wrong is rewritten: the Ride calls this on every frame, and the runner may be on the radios' arrow keys.
    check: (value) =>
      inputs.forEach((input) => {
        if (input.checked !== (input.value === value)) input.checked = input.value === value;
      }),
  };
}

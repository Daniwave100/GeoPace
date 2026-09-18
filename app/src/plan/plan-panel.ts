// The Race Plan form: edition, start wave, and a goal as a finish time or a pace. Plain on
// purpose; the look arrives with #6. What it must get right is honesty about the edition facts:
//   - every fact shown links to its source;
//   - a wave whose start time nobody has published can't be picked, and the panel says why;
//   - a carried-over start time is flagged, with the edition it came from and the reason;
//   - it says that every time assumes an even pace.
// The form is built once and then only refreshed, so typing a goal and pressing Tab never loses
// the runner's place.
import type { Edition, Wave } from "../bundle/types";
import { hasStartTime, parseGoal, type Goal, type Planner, type PlannerCourse, type RacePlan, sanitizePlan } from "../core/planner";
import { formatElapsed, formatPace } from "../core/race-clock";
import { raceDate } from "../core/words";

export interface PlanPanel {
  show(course: PlannerCourse, planner: Planner): void;
}

const GOAL_HELP: Record<Goal["kind"], string> = {
  finish: "Hours and minutes, like 3:45 (or 3:45:30).",
  pace: "Minutes and seconds per kilometre, like 5:20.",
};

const GOAL_ERROR: Record<Goal["kind"], string> = {
  finish: "That doesn't read as a marathon finish time. Write it like 3:45 or 3:45:30.",
  pace: "That doesn't read as a marathon pace. Write minutes and seconds per kilometre, like 5:20.",
};

/** `onChange` gets a complete, valid plan every time the runner changes something. */
export function createPlanPanel(container: HTMLElement, onChange: (plan: RacePlan) => void): PlanPanel {
  let course: PlannerCourse | undefined;
  let planner: Planner | undefined;

  const edition = document.createElement("select");
  const raceDay = paragraph("plan-fact");
  const wave = document.createElement("select");
  const waveFact = paragraph("plan-fact");
  const carriedOver = paragraph("plan-flag");
  const noStartTime = paragraph("plan-note");

  const finishKind = radio("finish");
  const paceKind = radio("pace");
  const goal = document.createElement("input");
  goal.type = "text";
  goal.inputMode = "numeric";
  goal.autocomplete = "off";
  goal.size = 8;
  goal.setAttribute("aria-label", "Goal");
  goal.setAttribute("aria-describedby", "goal-help goal-error");
  const goalHelp = document.createElement("small");
  goalHelp.id = "goal-help";
  const goalError = paragraph("plan-error");
  goalError.id = "goal-error";
  goalError.setAttribute("role", "alert");

  const summary = paragraph("plan-summary");
  const evenPace = paragraph("plan-note");
  evenPace.textContent =
    "Every time here assumes an even pace from start to finish. Real races slow on hills and late on, so read them as approximate.";

  const goalBox = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Goal";
  goalBox.append(legend, labelled("Finish time", finishKind, "after"), labelled("Pace per km", paceKind, "after"), goal, goalHelp, goalError);

  const form = document.createElement("form");
  form.className = "plan";
  form.noValidate = true;
  form.append(labelled("Edition", edition), raceDay, labelled("Start wave", wave), waveFact, carriedOver, noStartTime, goalBox, summary, evenPace);
  container.replaceChildren(form);

  const change = (changes: Partial<RacePlan>) => {
    if (course && planner) onChange(sanitizePlan(course, { ...planner.plan, ...changes }));
  };
  edition.addEventListener("change", () => change({ edition: Number(edition.value) }));
  wave.addEventListener("change", () => change({ waveId: wave.value }));
  for (const kind of [finishKind, paceKind]) {
    // Switching how the goal is written keeps the goal itself: 4:00:00 becomes 5:41 per km.
    kind.addEventListener("change", () => {
      if (!planner) return;
      change({
        goal:
          kind.value === "finish"
            ? { kind: "finish", seconds: Math.round(planner.goalFinishSeconds) }
            : { kind: "pace", secondsPerKm: Math.round(planner.goalPaceSecondsPerKm) },
      });
    });
  }
  const commitGoal = () => {
    if (!course || !planner) return;
    const kind = planner.plan.goal.kind;
    const parsed = parseGoal(kind, goal.value, course);
    goalError.textContent = parsed ? "" : GOAL_ERROR[kind];
    goal.setAttribute("aria-invalid", String(!parsed));
    if (parsed) change({ goal: parsed });
  };
  goal.addEventListener("change", commitGoal);
  goal.addEventListener("focus", () => goal.select()); // click, then just type the new goal
  form.addEventListener("submit", (event) => {
    event.preventDefault(); // Enter in the goal box commits it; there is nowhere to submit to
    commitGoal();
  });

  return {
    show(nextCourse, nextPlanner) {
      course = nextCourse;
      planner = nextPlanner;
      const chosen = planner.edition;

      edition.replaceChildren(...course.editions.map((known) => new Option(String(known.edition), String(known.edition))));
      edition.value = String(chosen.edition);
      raceDay.replaceChildren(`Race day: ${raceDate(chosen.date.day)}. `, sourceLink(chosen.date), ...(chosen.date.note ? [" ", small(chosen.date.note)] : []));

      wave.replaceChildren(...chosen.waves.map(waveOption));
      wave.value = planner.wave.id;
      waveFact.replaceChildren(`${planner.wave.name} starts at ${planner.wave.start_local}. `, sourceLink(planner.wave));
      carriedOver.hidden = planner.carriedOver === null;
      carriedOver.textContent = planner.carriedOver ? `Carried over from ${planner.carriedOver.fromEdition}. ${planner.carriedOver.reason}` : "";
      const unpublished = wavesWithoutStartTime(chosen);
      noStartTime.hidden = unpublished.length === 0;
      noStartTime.replaceChildren(...unpublished.flatMap(({ names, note, source }) => [`${names}: ${note} `, sourceLink(source), document.createElement("br")]));

      const kind = planner.plan.goal.kind;
      finishKind.checked = kind === "finish";
      paceKind.checked = kind === "pace";
      goal.value = kind === "finish" ? formatElapsed(planner.goalFinishSeconds) : formatPace(planner.goalPaceSecondsPerKm);
      goal.setAttribute("aria-invalid", "false");
      goalHelp.textContent = GOAL_HELP[kind];
      goalError.textContent = "";

      const finish = planner.at(planner.lengthKm);
      summary.textContent =
        `${formatElapsed(planner.goalFinishSeconds)} finish · ${formatPace(planner.goalPaceSecondsPerKm)} per km · ` +
        `start ${planner.at(0).localClock}, finish ${finish.localClock} ${finish.zoneLabel}`;
    },
  };
}

function waveOption(wave: Wave): HTMLOptionElement {
  const option = new Option(hasStartTime(wave) ? `${wave.name} · ${wave.start_local}${wave.carried_over ? " (carried over)" : ""}` : `${wave.name} · start time not published`, wave.id);
  option.disabled = !hasStartTime(wave);
  return option;
}

/** Waves that can't be picked, grouped by their reason, so one shared reason is said once. */
function wavesWithoutStartTime(edition: Edition): { names: string; note: string; source: Wave }[] {
  const byNote = new Map<string, Wave[]>();
  for (const wave of edition.waves.filter((candidate) => !hasStartTime(candidate))) {
    const note = wave.note ?? "No start time has been published.";
    byNote.set(note, [...(byNote.get(note) ?? []), wave]);
  }
  return [...byNote].map(([note, waves]) => ({ names: waves.map((wave) => wave.name).join(", "), note, source: waves[0] }));
}

function sourceLink(fact: { source: string; accessed: string }): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = fact.source;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Source";
  link.title = `Checked on ${fact.accessed}`;
  return link;
}

function labelled(text: string, control: HTMLElement, textGoes: "before" | "after" = "before"): HTMLLabelElement {
  const label = document.createElement("label");
  label.append(...(textGoes === "before" ? [`${text} `, control] : [control, ` ${text}`]));
  return label;
}

function radio(value: Goal["kind"]): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "goal-kind";
  input.value = value;
  return input;
}

function paragraph(className: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = className;
  return p;
}

function small(text: string): HTMLElement {
  const node = document.createElement("small");
  node.textContent = text;
  return node;
}

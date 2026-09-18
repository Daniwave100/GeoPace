// The Race Plan form: edition, start wave, and a goal as a finish time or a pace. Plain on
// purpose; the look arrives with #6. What it must get right is honesty about the edition facts:
//   - every fact shown links to its source;
//   - a race date the organizer hasn't confirmed says so, and how it is known;
//   - a wave whose start time nobody has published can't be picked, and the panel says why, and
//     that the times on screen are not that wave's;
//   - every time of day that rests on a carried-over start time is greyed, with the edition it
//     came from and the reason;
//   - it says that every time assumes an even pace.
// The form is built once and then only refreshed, so typing a goal and pressing Tab never loses
// the runner's place.
import type { Edition, Wave } from "../bundle/types";
import { type Goal, goalWrittenAs, hasStartTime, parseGoal, type Planner, type PlannerCourse, type RacePlan, sanitizePlan } from "../core/planner";
import { formatElapsed, formatPace } from "../core/race-clock";
import { raceDate } from "../core/words";
import { html, link } from "../dom";

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

const EVEN_PACE = "Every time here assumes an even pace from start to finish. Real races slow on hills and late on, so read them as approximate.";

/** `onChange` gets a complete, valid plan every time the runner changes something. */
export function createPlanPanel(container: HTMLElement, onChange: (plan: RacePlan) => void): PlanPanel {
  let course: PlannerCourse | undefined;
  let planner: Planner | undefined;

  const edition = html("select");
  const raceDay = html("p", { class: "plan-fact" });
  const wave = html("select");
  const waveFact = html("p", { class: "plan-fact" });
  const carriedOver = html("p", { class: "plan-flag" });
  const notPublished = html("p", { class: "plan-note" });

  const finishKind = html("input", { type: "radio", name: "goal-kind", value: "finish" });
  const paceKind = html("input", { type: "radio", name: "goal-kind", value: "pace" });
  const goal = html("input", { type: "text", inputmode: "numeric", autocomplete: "off", size: 8, "aria-label": "Goal", "aria-describedby": "goal-help goal-error" });
  const goalHelp = html("small", { id: "goal-help" });
  const goalError = html("p", { class: "plan-error", id: "goal-error", role: "alert" });
  const summary = html("p", { class: "plan-summary" });

  const form = html(
    "form",
    { class: "plan", novalidate: true },
    html("label", {}, "Edition ", edition),
    raceDay,
    html("label", {}, "Start wave ", wave),
    waveFact,
    carriedOver,
    notPublished,
    html("fieldset", {}, html("legend", { text: "Goal" }), html("label", {}, finishKind, " Finish time"), html("label", {}, paceKind, " Pace per km"), goal, goalHelp, goalError),
    summary,
    html("p", { class: "plan-note", text: EVEN_PACE }),
  );
  container.replaceChildren(form);

  const change = (changes: Partial<RacePlan>) => {
    if (course && planner) onChange(sanitizePlan(course, { ...planner.plan, ...changes }));
  };
  edition.addEventListener("change", () => change({ edition: Number(edition.value) }));
  wave.addEventListener("change", () => change({ waveId: wave.value }));
  for (const kind of [finishKind, paceKind]) {
    // Switching how the goal is written keeps the goal itself: 4:00:00 reads as 5:41 per km.
    kind.addEventListener("change", () => {
      if (course && planner) change({ goal: goalWrittenAs(kind.value as Goal["kind"], planner.plan.goal, course) });
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
      // A time of day: greyed, and labelled, when it rests on a carried-over start time.
      const timeOfDay = (text: string) => html("span", { class: planner?.carriedOver ? "carried-over" : undefined, text });
      const flag = planner.carriedOver ? ` (carried over from ${planner.carriedOver.fromEdition})` : "";

      edition.replaceChildren(...course.editions.map((known) => new Option(String(known.edition), String(known.edition))));
      edition.value = String(chosen.edition);
      raceDay.replaceChildren(
        `Race day: ${raceDate(chosen.date.day)}`,
        ...(chosen.date.confirmed ? [] : [html("span", { class: "carried-over", text: " (not yet confirmed)" })]),
        ". ",
        sourceLink(chosen.date),
        ...(chosen.date.note ? [" ", html("small", { text: chosen.date.note })] : []),
      );

      wave.replaceChildren(...chosen.waves.map(waveOption));
      wave.value = planner.wave.id;
      waveFact.replaceChildren(`${planner.wave.name} starts at `, timeOfDay(planner.wave.start_local), `${flag}. `, sourceLink(planner.wave));
      carriedOver.hidden = planner.carriedOver === null;
      carriedOver.textContent = planner.carriedOver ? `Carried over from ${planner.carriedOver.fromEdition}. ${planner.carriedOver.reason}` : "";
      const unpublished = wavesWithoutStartTime(chosen);
      notPublished.hidden = unpublished.length === 0;
      notPublished.replaceChildren(
        ...unpublished.flatMap(({ names, note, source }) => [`${names}: ${note} `, sourceLink(source), html("br")]),
        "If that is your wave, the times of day and the sun shown here are not yours.",
      );

      const kind = planner.plan.goal.kind;
      finishKind.checked = kind === "finish";
      paceKind.checked = kind === "pace";
      goal.value = kind === "finish" ? formatElapsed(planner.goalFinishSeconds) : formatPace(planner.goalPaceSecondsPerKm);
      goal.setAttribute("aria-invalid", "false");
      goalHelp.textContent = GOAL_HELP[kind];
      goalError.textContent = "";

      const finish = planner.at(planner.lengthKm);
      summary.replaceChildren(
        `${formatElapsed(planner.goalFinishSeconds)} finish · ${formatPace(planner.goalPaceSecondsPerKm)} per km · `,
        timeOfDay(`start ${planner.at(0).localClock}, finish ${finish.localClock} ${finish.zoneLabel}`),
        flag,
      );
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
  const source = link(fact.source, "Source");
  source.title = `Checked on ${fact.accessed}`;
  return source;
}

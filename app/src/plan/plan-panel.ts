// The Race Plan form: edition, start wave, start time, and a goal as a finish time or a pace.
// Plain on purpose; the look arrives with #6. What it must get right is honesty about the
// edition facts:
//   - every fact shown links to its source;
//   - a race date the organizer hasn't confirmed says so, and how it is known;
//   - a wave whose start time nobody has published has no time until the runner types their own
//     (it is on their start card), and until they do the panel says whose times are on screen;
//   - every time of day that rests on a carried-over start time is greyed, with the edition it
//     came from and the reason; the runner's own start time is theirs, and is never greyed;
//   - it says that every time assumes an even pace.
// The form is built once and then only refreshed, so typing and pressing Tab never loses the
// runner's place.
import type { Edition, Wave } from "../bundle/types";
import { type Goal, goalWrittenAs, hasStartTime, ownStartTimeFor, parseGoal, parseStartTime, type Planner, type PlannerCourse, type RacePlan, sanitizePlan } from "../core/planner";
import { formatElapsed, formatPace } from "../core/race-clock";
import { raceDate } from "../core/words";
import { html, sourceLink } from "../dom";

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

const START_TIME_ERROR = "That doesn't read as a time of day. Write it on the 24-hour clock, like 09:35.";
const EVEN_PACE = "Every time here assumes an even pace from start to finish. Real races slow on hills and late on, so read them as approximate.";

/** `onChange` gets a complete, valid plan every time the runner changes something. */
export function createPlanPanel(container: HTMLElement, onChange: (plan: RacePlan) => void): PlanPanel {
  let course: PlannerCourse | undefined;
  let planner: Planner | undefined;
  // A wave the runner has picked that has no published start time, while they type their own.
  // It isn't their plan yet: a plan always has a start time, so the times on screen never go blank.
  let awaitingStartTime: Wave | undefined;

  const edition = html("select");
  const raceDay = html("p", { class: "plan-fact" });
  const wave = html("select");
  const startTime = html("input", { type: "time", "aria-describedby": "start-fact start-error" });
  const usePublished = html("button", { type: "button" });
  const startFact = html("p", { class: "plan-fact", id: "start-fact" });
  const startError = html("p", { class: "plan-error", id: "start-error", role: "alert" });
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
    html("div", { class: "plan-start" }, html("label", {}, "Start time ", startTime), usePublished),
    startFact,
    startError,
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
  // An own start time belongs to the wave it was typed for, so a new edition or wave starts without one.
  edition.addEventListener("change", () => change({ edition: Number(edition.value), ownStartLocal: null }));
  wave.addEventListener("change", () => {
    const picked = planner?.edition.waves.find((candidate) => candidate.id === wave.value);
    if (!picked) return;
    if (hasStartTime(picked)) {
      change({ waveId: picked.id, ownStartLocal: null });
    } else {
      awaitingStartTime = picked;
      showStart();
      startTime.focus();
    }
  });
  startTime.addEventListener("change", () => {
    if (!planner) return;
    const target = awaitingStartTime ?? planner.wave;
    if (startTime.value.trim() === "") {
      // Cleared: back to the published time if there is one, else to what it was.
      if (!awaitingStartTime && hasStartTime(target)) change({ ownStartLocal: null });
      else showStart();
      return;
    }
    const typed = parseStartTime(startTime.value);
    startError.textContent = typed ? "" : START_TIME_ERROR;
    if (typed) change({ waveId: target.id, ownStartLocal: ownStartTimeFor(target, typed) });
  });
  usePublished.addEventListener("click", () => change({ ownStartLocal: null }));

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

  /** The start time box and the line under it: whose time this is, and where it comes from. */
  function showStart(): void {
    if (!planner) return;
    const planned = planner.wave;
    const flag = planner.carriedOver ? ` (carried over from ${planner.carriedOver.fromEdition})` : "";
    startError.textContent = "";
    startTime.value = awaitingStartTime ? "" : planner.startLocal;
    startTime.classList.toggle("carried-over", !awaitingStartTime && planner.carriedOver !== null);
    usePublished.hidden = awaitingStartTime !== undefined || !planner.ownStartTime || !hasStartTime(planned);
    usePublished.textContent = hasStartTime(planned) ? `Use ${planned.name}'s published time, ${planned.start_local}` : "";

    if (awaitingStartTime) {
      startFact.replaceChildren(
        `${awaitingStartTime.name}'s start time isn't published. Type the one on your start card. Until you do, the times shown still start at ${planner.startLocal}. `,
        sourceLink(awaitingStartTime),
      );
    } else if (planner.ownStartTime) {
      const published = hasStartTime(planned) ? `${planned.name}'s published time is ${planned.start_local}${planned.carried_over ? ", carried over" : ""}.` : `${planned.name}'s isn't published.`;
      startFact.replaceChildren(`Your own start time. ${published} `, sourceLink(planned));
    } else {
      startFact.replaceChildren(`${planned.name}'s published start time${flag}. `, sourceLink(planned), " If your start card says otherwise, type yours over it.");
    }
  }

  return {
    show(nextCourse, nextPlanner) {
      course = nextCourse;
      planner = nextPlanner;
      awaitingStartTime = undefined;
      const chosen = planner.edition;
      const whose = planner.carriedOver ? ` (carried over from ${planner.carriedOver.fromEdition})` : planner.ownStartTime ? " (your own start time)" : "";

      edition.replaceChildren(...course.editions.map((known) => new Option(String(known.edition), String(known.edition))));
      edition.value = String(chosen.edition);
      raceDay.replaceChildren(
        `Race day: ${raceDate(chosen.date.day)}`,
        ...(chosen.date.confirmed ? [] : [html("span", { class: "carried-over", text: " (not yet confirmed)" })]),
        ". ",
        sourceLink(chosen.date),
        ...(chosen.date.note ? [" ", html("small", { text: chosen.date.note })] : []),
      );

      wave.replaceChildren(...chosen.waves.map((known) => waveOption(known, known.id === nextPlanner.wave.id && nextPlanner.ownStartTime ? nextPlanner.startLocal : null)));
      wave.value = planner.wave.id;
      showStart();
      carriedOver.hidden = planner.carriedOver === null;
      carriedOver.textContent = planner.carriedOver ? `Carried over from ${planner.carriedOver.fromEdition}. ${planner.carriedOver.reason}` : "";
      const unpublished = wavesWithoutStartTime(chosen);
      notPublished.hidden = unpublished.length === 0;
      notPublished.replaceChildren(
        ...unpublished.flatMap(({ names, note, source }) => [`${names}: ${note} `, sourceLink(source), html("br")]),
        "If that is your wave, pick it and type in the start time from your start card.",
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
        // A time of day: greyed when it rests on a carried-over start time.
        html("span", { class: planner.carriedOver ? "carried-over" : undefined, text: `start ${planner.at(0).localClock}, finish ${finish.localClock} ${finish.zoneLabel}` }),
        whose,
      );
    },
  };
}

/** `ownStartLocal` is set for the planned wave when the runner has typed their own start time for it. */
function waveOption(wave: Wave, ownStartLocal: string | null): HTMLOptionElement {
  const time = ownStartLocal
    ? `${ownStartLocal} (your own time)`
    : hasStartTime(wave)
      ? `${wave.start_local}${wave.carried_over ? " (carried over)" : ""}`
      : "start time not published";
  return new Option(`${wave.name} · ${time}`, wave.id);
}

/** Waves with no published start time, grouped by their reason, so one shared reason is said once. */
function wavesWithoutStartTime(edition: Edition): { names: string; note: string; source: Wave }[] {
  const byNote = new Map<string, Wave[]>();
  for (const wave of edition.waves.filter((candidate) => !hasStartTime(candidate))) {
    const note = wave.note ?? "No start time has been published.";
    byNote.set(note, [...(byNote.get(note) ?? []), wave]);
  }
  return [...byNote].map(([note, waves]) => ({ names: waves.map((wave) => wave.name).join(", "), note, source: waves[0] }));
}

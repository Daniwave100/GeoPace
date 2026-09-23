// The Race Plan form: the start time, and a goal as a finish time or a pace. It opens from the
// banner, so the first screen stays small (PLAN.md principle 8). No wave is picked: the runner
// types the start time from their own start card over the organizer's first start (the owner,
// 09-23: "remove start wave, just keep it start time, and then the user will manually input
// that; don't worry about waves"). What it must get right is honesty about the edition facts:
//   - every fact shown links to its source;
//   - a race date the organizer hasn't confirmed says so, and how it is known;
//   - every time of day that rests on a carried-over start time is greyed, with the edition it
//     came from and the reason; the runner's own start time is theirs, and is never greyed;
//   - it says that every time assumes an even pace.
// The fueling plan is part of the same plan and sits at the bottom of the same form (#12,
// plan/fueling-panel.ts): what the runner means to take, where, and what the organizer's
// refreshment points make of it.
// A pace is typed and shown per kilometre or per mile, whichever the runner thinks in (D42); the
// plan itself keeps it per km, so switching units never changes the goal.
// The form is built once and then only refreshed, so typing and pressing Tab never loses the
// runner's place.
import type { FuelItem } from "../core/fueling";
import { type Goal, goalWrittenAs, hasStartTime, ownStartTimeFor, parseGoal, parseStartTime, type Planner, type PlannerCourse, type RacePlan, sanitizePlan } from "../core/planner";
import { formatElapsed, formatPace } from "../core/race-clock";
import { paceInUnits, type Units, unitName } from "../core/units";
import { raceDate } from "../core/words";
import { html, sourceLink } from "../dom";
import { createFuelingPanel } from "./fueling-panel";

export interface PlanPanel {
  show(course: PlannerCourse, planner: Planner, units: Units): void;
}

/** A pace a runner might type, so the example reads right in either unit. */
const EXAMPLE_PACE: Record<Units, string> = { km: "5:20", mi: "8:35" };

function goalHelp(kind: Goal["kind"], units: Units): string {
  return kind === "finish" ? "Hours and minutes, like 3:45 (or 3:45:30)." : `Minutes and seconds per ${unitName(units)}, like ${EXAMPLE_PACE[units]}.`;
}

function goalError(kind: Goal["kind"], units: Units): string {
  return kind === "finish"
    ? "That doesn't read as a marathon finish time. Write it like 3:45 or 3:45:30."
    : `That doesn't read as a marathon pace. Write minutes and seconds per ${unitName(units)}, like ${EXAMPLE_PACE[units]}.`;
}

const START_TIME_ERROR = "That doesn't read as a time of day. Write it on the 24-hour clock, like 09:35.";
const EVEN_PACE = "Every time here assumes an even pace from start to finish. Real races slow on hills and late on, so read them as approximate.";

/** `onChange` gets a complete, valid plan every time the runner changes something. */
export function createPlanPanel(container: HTMLElement, onChange: (plan: RacePlan) => void): PlanPanel {
  let course: PlannerCourse | undefined;
  let planner: Planner | undefined;
  let units: Units = "km";

  const edition = html("select");
  // Only where a course has more than one edition to plan for: with one, there is nothing to pick.
  const editionLabel = html("label", {}, "Edition ", edition);
  const raceDay = html("p", { class: "plan-fact" });
  const startTime = html("input", { type: "time", "aria-describedby": "start-fact start-error" });
  const useOrganizers = html("button", { type: "button" });
  const startFact = html("p", { class: "plan-fact", id: "start-fact" });
  const startError = html("p", { class: "plan-error", id: "start-error", role: "alert" });
  const carriedOver = html("p", { class: "plan-flag" });

  const finishKind = html("input", { type: "radio", name: "goal-kind", value: "finish" });
  const paceKind = html("input", { type: "radio", name: "goal-kind", value: "pace" });
  const paceLabel = html("span");
  const goal = html("input", { type: "text", inputmode: "numeric", autocomplete: "off", size: 8, "aria-label": "Goal", "aria-describedby": "goal-help goal-error" });
  const goalHint = html("small", { id: "goal-help" });
  const goalProblem = html("p", { class: "plan-error", id: "goal-error", role: "alert" });
  const summary = html("p", { class: "plan-summary" });
  const fuelingBox = html("div");

  const form = html(
    "form",
    { class: "plan", novalidate: true },
    editionLabel,
    raceDay,
    html("div", { class: "plan-start" }, html("label", {}, "Start time ", startTime), useOrganizers),
    startFact,
    startError,
    carriedOver,
    html("fieldset", {}, html("legend", { text: "Goal" }), html("label", {}, finishKind, " Finish time"), html("label", {}, paceKind, " ", paceLabel), goal, goalHint, goalProblem),
    summary,
    html("p", { class: "plan-note", text: EVEN_PACE }),
    fuelingBox,
  );
  container.replaceChildren(form);

  const change = (changes: Partial<RacePlan>) => {
    if (course && planner) onChange(sanitizePlan(course, { ...planner.plan, ...changes }));
  };
  // The fueling plan is one more part of the same plan: it comes back as a whole list and goes
  // through the same `change`, so it is sanitized and saved exactly like a start time or a goal.
  const fueling = createFuelingPanel(fuelingBox, (items: FuelItem[]) => change({ fueling: items }));
  // An own start time belongs to the edition it was typed for, so a new edition starts without one.
  edition.addEventListener("change", () => change({ edition: Number(edition.value), ownStartLocal: null }));
  startTime.addEventListener("change", () => {
    if (!planner) return;
    if (startTime.value.trim() === "") {
      // Cleared: back to the organizer's time.
      if (planner.ownStartTime) change({ ownStartLocal: null });
      else showStart();
      return;
    }
    const typed = parseStartTime(startTime.value);
    startError.textContent = typed ? "" : START_TIME_ERROR;
    // The plan still names the organizer's first start underneath (core/planner.ts keeps the
    // clock's edition facts by wave); typing the same time as a confirmed start is not an own time.
    if (typed) change({ waveId: planner.wave.id, ownStartLocal: ownStartTimeFor(planner.wave, typed) });
  });
  useOrganizers.addEventListener("click", () => change({ ownStartLocal: null }));

  for (const kind of [finishKind, paceKind]) {
    // Switching how the goal is written keeps the goal itself: 4:00:00 reads as 5:41 per km.
    kind.addEventListener("change", () => {
      if (course && planner) change({ goal: goalWrittenAs(kind.value as Goal["kind"], planner.plan.goal, course) });
    });
  }
  const commitGoal = () => {
    if (!course || !planner) return;
    const kind = planner.plan.goal.kind;
    const parsed = parseGoal(kind, goal.value, course, units);
    goalProblem.textContent = parsed ? "" : goalError(kind, units);
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
    const organizers = planner.wave; // the organizer's first start with a published time (core/planner.ts)
    const published = hasStartTime(organizers) ? organizers.start_local : null;
    const flag = planner.carriedOver ? `, carried over from ${planner.carriedOver.fromEdition}` : "";
    startError.textContent = "";
    startTime.value = planner.startLocal;
    startTime.classList.toggle("carried-over", planner.carriedOver !== null);
    useOrganizers.hidden = !planner.ownStartTime || published === null;
    useOrganizers.textContent = published === null ? "" : `Use the organizer's time, ${published}`;

    if (planner.ownStartTime) {
      startFact.replaceChildren(`Your own start time. The organizer's first start is ${published ?? "not published"}${published ? flag : ""}. `, sourceLink(organizers));
    } else {
      startFact.replaceChildren(`The organizer's first start${flag}. `, sourceLink(organizers), " Type the time on your start card over it.");
    }
  }

  return {
    show(nextCourse, nextPlanner, nextUnits) {
      course = nextCourse;
      planner = nextPlanner;
      units = nextUnits;
      fueling.show(nextPlanner, nextUnits);
      const chosen = planner.edition;
      const whose = planner.carriedOver ? ` (${planner.carriedOver.fromEdition}'s start time, carried over)` : planner.ownStartTime ? " (your own start time)" : "";

      edition.replaceChildren(...course.editions.map((known) => new Option(String(known.edition), String(known.edition))));
      edition.value = String(chosen.edition);
      editionLabel.hidden = course.editions.length < 2;
      raceDay.replaceChildren(
        `Race day: ${raceDate(chosen.date.day)}`,
        ...(chosen.date.confirmed ? [] : [html("span", { class: "carried-over", text: " (not yet confirmed)" })]),
        ". ",
        sourceLink(chosen.date),
        ...(chosen.date.note ? [" ", html("small", { text: chosen.date.note })] : []),
      );

      showStart();
      carriedOver.hidden = planner.carriedOver === null;
      carriedOver.textContent = planner.carriedOver ? `Carried over from ${planner.carriedOver.fromEdition}. ${planner.carriedOver.reason}` : "";

      const kind = planner.plan.goal.kind;
      finishKind.checked = kind === "finish";
      paceKind.checked = kind === "pace";
      const pace = formatPace(paceInUnits(planner.goalPaceSecondsPerKm, units));
      paceLabel.textContent = `Pace per ${unitName(units)}`;
      goal.value = kind === "finish" ? formatElapsed(planner.goalFinishSeconds) : pace;
      goal.setAttribute("aria-invalid", "false");
      goalHint.textContent = goalHelp(kind, units);
      goalProblem.textContent = "";

      const finish = planner.at(planner.lengthKm);
      summary.replaceChildren(
        `${formatElapsed(planner.goalFinishSeconds)} finish · ${pace} per ${unitName(units)} · `,
        // A time of day: greyed when it rests on a carried-over start time.
        html("span", { class: planner.carriedOver ? "carried-over" : undefined, text: `start ${planner.at(0).localClock}, finish ${finish.localClock} ${finish.zoneLabel}` }),
        whose,
      );
    },
  };
}

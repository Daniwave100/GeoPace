// Remembers the runner's Race Plan in the browser, so it is still there after a reload. One plan
// per course, plus which course was planned last, plus the units the runner thinks in: those
// belong to the runner, not to a course, so they sit beside the plans and apply to all of them.
//
// Storage is never trusted (see browser-storage.ts), and what it holds may name a wave the edition
// facts no longer list. Reading always ends in a plan the Planner can run; saving never throws.
import { type BrowserStorage, isRecord, readStored, writeStored } from "../browser-storage";
import { type PlannerCourse, type RacePlan, sanitizePlan } from "../core/planner";
import { sanitizeUnits, type Units } from "../core/units";

/** The two methods of the browser's `localStorage` this needs; tests pass a stand-in. */
export type PlanStorage = Pick<BrowserStorage, "getItem" | "setItem">;

const KEY = "geopace.race-plans";

interface Remembered {
  lastCourseId: string | null;
  plans: Record<string, unknown>;
  /** Missing in what an older version of the app stored: that reads as kilometres. */
  units: Units;
}

/** The remembered plan for this course, checked against today's edition facts; else the default. */
export function loadPlan(storage: PlanStorage, course: PlannerCourse): RacePlan {
  return sanitizePlan(course, read(storage).plans[course.courseId]);
}

export function savePlan(storage: PlanStorage, plan: RacePlan): void {
  const remembered = read(storage);
  remembered.plans[plan.courseId] = plan;
  remembered.lastCourseId = plan.courseId;
  writeStored(storage, KEY, remembered); // if the browser won't keep it, the plan still works for this visit
}

/** The course the runner planned last, for opening the app without one named in the URL. */
export function rememberedCourseId(storage: PlanStorage): string | null {
  return read(storage).lastCourseId;
}

/** Kilometres or miles. Kilometres on a first visit, and for a plan remembered before units existed. */
export function loadUnits(storage: PlanStorage): Units {
  return read(storage).units;
}

/** Changes the units and nothing else: the plans stay exactly as they were. */
export function saveUnits(storage: PlanStorage, units: Units): void {
  writeStored(storage, KEY, { ...read(storage), units });
}

function read(storage: PlanStorage): Remembered {
  const stored = readStored(storage, KEY);
  if (!isRecord(stored)) return { lastCourseId: null, plans: {}, units: sanitizeUnits(undefined) };
  const plans = isRecord(stored.plans) ? Object.fromEntries(Object.entries(stored.plans).filter(([, plan]) => isRecord(plan))) : {};
  const last = stored.lastCourseId;
  return { lastCourseId: typeof last === "string" && last in plans ? last : null, plans, units: sanitizeUnits(stored.units) };
}

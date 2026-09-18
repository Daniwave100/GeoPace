// Remembers the runner's Race Plan in the browser, so it is still there after a reload. One plan
// per course, plus which course was planned last. Nothing leaves the computer: there are no
// accounts and no server (PLAN.md principle 1).
//
// Storage is never trusted. It may be blocked (private windows), full, written by an older
// version of the app, or name a wave the edition facts no longer list. Reading always ends in a
// plan the Planner can run; saving never throws.
import { type PlannerCourse, type RacePlan, sanitizePlan } from "../core/planner";

/** The two methods of the browser's `localStorage` this needs; tests pass a stand-in. */
export type PlanStorage = Pick<Storage, "getItem" | "setItem">;

const KEY = "geopace.race-plans";

interface Remembered {
  lastCourseId: string | null;
  plans: Record<string, unknown>;
}

/** The remembered plan for this course, checked against today's edition facts; else the default. */
export function loadPlan(storage: PlanStorage, course: PlannerCourse): RacePlan {
  return sanitizePlan(course, read(storage).plans[course.courseId]);
}

export function savePlan(storage: PlanStorage, plan: RacePlan): void {
  const remembered = read(storage);
  remembered.plans[plan.courseId] = plan;
  remembered.lastCourseId = plan.courseId;
  try {
    storage.setItem(KEY, JSON.stringify(remembered));
  } catch {
    // Blocked or full. The plan still works for this visit; it just won't be remembered.
  }
}

/** The course the runner planned last, for opening the app without one named in the URL. */
export function rememberedCourseId(storage: PlanStorage): string | null {
  return read(storage).lastCourseId;
}

function read(storage: PlanStorage): Remembered {
  const nothing: Remembered = { lastCourseId: null, plans: {} };
  let stored: unknown;
  try {
    stored = JSON.parse(storage.getItem(KEY) ?? "null");
  } catch {
    return nothing; // blocked storage, or not JSON
  }
  if (!isRecord(stored) || !isRecord(stored.plans)) return nothing;
  const plans = Object.fromEntries(Object.entries(stored.plans).filter(([, plan]) => isRecord(plan)));
  const last = stored.lastCourseId;
  return { lastCourseId: typeof last === "string" && last in plans ? last : null, plans };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

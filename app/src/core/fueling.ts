// The fueling plan, and the check on it: what the runner means to take, where, and what the
// organizer's refreshment points make of that (issue #12).
//
// The whole value is in one sentence the app can say and the runner can't easily work out: *you
// have a gel at 15 km and the next water is at 17.5 km.* That is two and a half kilometres of
// swallowing gel dry, and it is invisible in a list of stations and invisible in a fueling plan —
// it only appears when the two are laid over each other. Everything here exists to say it.
//
// **A warning is never a value judgement.** It says what the organizer's list makes of the plan
// and offers somewhere to move to; it never says a plan is wrong, because a runner carrying their
// own bottle has answered every one of these already. Which is why each one has a `suggestion`
// and none of them has a severity.
//
// ⚠️ The three distances below are Claude's, not a runner's and not a physiologist's. They are the
// only invented numbers in this module and they are the ones worth arguing about (PLAN.md D61).
import { type AidStation, nearestStation, nextServing, type Serves } from "./aid";
import { formatDistance, type Units } from "./units";

/** What a runner puts in the plan. */
export type FuelKind = "gel" | "chew" | "own-drink" | "station-water" | "station-sports-drink";

export interface FuelItem {
  /** Stable across edits, so a warning can point at the item that caused it. */
  id: string;
  /** On the course line, the app's one distance scale (PLAN.md D20). */
  km: number;
  kind: FuelKind;
}

/** What each kind is called on screen. */
export const FUEL_NAME: Record<FuelKind, string> = {
  gel: "Gel",
  chew: "Chews",
  "own-drink": "My own drink",
  "station-water": "Water from a station",
  "station-sports-drink": "Sports drink from a station",
};

/** The two that need washing down, and the three that need a station to have something. */
const NEEDS_WATER: FuelKind[] = ["gel", "chew"];
const NEEDS_FROM_A_STATION: Partial<Record<FuelKind, Serves>> = {
  "own-drink": "own-bottle",
  "station-water": "water",
  "station-sports-drink": "sports-drink",
};

/**
 * How far ahead a gel may look for water. ⚠️ Claude's number: at a four-hour pace a kilometre and
 * a half is about eight and a half minutes of carrying a mouthful of gel, which is the point at
 * which the app is worth saying something. The owner's to move.
 */
export const WATER_WITHIN_KM = 1.5;
/** Water already drunk counts too: a gel taken just after a station is a gel washed down. */
export const WATER_JUST_BEHIND_KM = 0.5;
/** How near an item has to be to a station to be taken as *at* it. Half a minute of running. */
export const AT_A_STATION_KM = 0.25;
/** A suggestion puts the item this far before the station, so the runner arrives holding it. */
export const JUST_BEFORE_KM = 0.1;

/** Why the plan and the organizer's list disagree here, and where the item could go instead. */
export interface FuelWarning {
  itemId: string;
  kind: FuelKind;
  /** Where the item is now. */
  atKm: number;
  /** Where it could go, or null when nowhere on the course would fix it. */
  suggestedKm: number | null;
  /** What is wrong, then what to do about it, in the runner's own units. */
  text(units: Units): string;
}

/**
 * Every warning this plan earns, in course order. An empty list is the answer for a plan that
 * works — and for a plan with nothing in it, which is not a problem to be told about.
 */
export function checkFueling(items: FuelItem[], stations: AidStation[], lengthKm: number): FuelWarning[] {
  if (stations.length === 0) return []; // no list to check against: silence, not invented warnings
  return [...items]
    .sort((a, b) => a.km - b.km)
    .flatMap((item) => {
      const dry = NEEDS_WATER.includes(item.kind) ? dryWarning(item, stations, lengthKm) : null;
      const missing = NEEDS_FROM_A_STATION[item.kind] ? missingWarning(item, stations, NEEDS_FROM_A_STATION[item.kind] as Serves) : null;
      return [dry, missing].filter((warning): warning is FuelWarning => warning !== null);
    });
}

/** A gel or a chew with no water within reach of it, either way. */
function dryWarning(item: FuelItem, stations: AidStation[], lengthKm: number): FuelWarning | null {
  const ahead = nextServing(stations, item.km, "water");
  const behind = [...stations].reverse().find((station) => station.km <= item.km && station.km >= item.km - WATER_JUST_BEHIND_KM && station.serves.includes("water"));
  if (behind || (ahead && ahead.km - item.km <= WATER_WITHIN_KM)) return null;
  const suggestedKm = ahead ? Math.max(0, Math.min(ahead.km - JUST_BEFORE_KM, lengthKm)) : null;
  return {
    itemId: item.id,
    kind: item.kind,
    atKm: item.km,
    suggestedKm,
    // The sentence states the problem; where there is somewhere to move to, the button beside it
    // offers that (plan/fueling-panel.ts), so the words never repeat what the button already says.
    text: (units) =>
      ahead
        ? `${FUEL_NAME[item.kind]} at ${formatDistance(item.km, units)}, and the next water is at ${formatDistance(ahead.km, units)} (${ahead.label}).`
        : `${FUEL_NAME[item.kind]} at ${formatDistance(item.km, units)}, and there is no water after it. Carry your own.`,
  };
}

/** Relying on something the station there doesn't have — or on a station that isn't there. */
function missingWarning(item: FuelItem, stations: AidStation[], what: Serves): FuelWarning | null {
  const here = nearestStation(stations, item.km);
  const atOne = here !== null && Math.abs(here.km - item.km) <= AT_A_STATION_KM;
  if (atOne && (here as AidStation).serves.includes(what)) return null;
  const next = nextServing(stations, item.km, what);
  const suggestedKm = next ? next.km : null;
  const wanted = WANTED[what];
  return {
    itemId: item.id,
    kind: item.kind,
    atKm: item.km,
    suggestedKm,
    text: (units) => {
      const where = atOne ? `The station at ${formatDistance((here as AidStation).km, units)} (${(here as AidStation).label}) has no ${wanted.plain}` : `There is no station at ${formatDistance(item.km, units)}`;
      return next ? `${where}. The next one with ${wanted.some} is at ${formatDistance(next.km, units)} (${next.label}).` : `${where}, and there is none after it on the course.`;
    },
  };
}

/**
 * What the runner is relying on, in the two shapes the sentences need: bare after "has no", and
 * with its article after "the next one with". English will not let one string do both.
 */
const WANTED: Record<string, { plain: string; some: string }> = {
  water: { plain: "water", some: "water" },
  "sports-drink": { plain: "sports drink", some: "a sports drink" },
  "own-bottle": { plain: "bottle of yours waiting", some: "your own bottle" },
};

/** Anything at all into a fueling plan, keeping every item that still makes sense. */
export function sanitizeFueling(candidate: unknown, lengthKm: number): FuelItem[] {
  if (!Array.isArray(candidate)) return [];
  const kept: FuelItem[] = [];
  for (const raw of candidate) {
    if (typeof raw !== "object" || raw === null) continue;
    const { id, km, kind } = raw as Partial<Record<keyof FuelItem, unknown>>;
    if (typeof kind !== "string" || !(kind in FUEL_NAME)) continue;
    if (typeof km !== "number" || !Number.isFinite(km)) continue;
    kept.push({ id: typeof id === "string" && id !== "" ? id : newFuelItemId(), km: Math.min(Math.max(km, 0), lengthKm), kind: kind as FuelKind });
  }
  // One id each, whatever storage held: a repeated id would tie two items' warnings together.
  const seen = new Set<string>();
  return kept.map((item) => {
    const id = seen.has(item.id) ? newFuelItemId() : item.id;
    seen.add(id);
    return { ...item, id };
  });
}

let made = 0;

/** A fresh id for a new item. Only has to be unique within one runner's plan. */
export function newFuelItemId(): string {
  made += 1;
  return `fuel-${Date.now().toString(36)}-${made.toString(36)}`;
}

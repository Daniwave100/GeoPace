// The organizer's refreshment points, as the app asks questions of them.
//
// A station is a *sourced fact*: what the organizer says will be on the road, with the page it
// came from and the day we read it (PLAN.md D19). Not a measurement and not what runners say —
// the strongest claim anyone can make about a race that hasn't happened yet. Where it is last
// year's list, every station says so and the app greys it, exactly as it does a carried-over wave
// time (D38).
//
// Two numbers, on purpose. `kmMarked` is what the organizer published and what the sign by the
// road will say; `km` is where that lands on the course line the app measures everything else
// along, which is a little longer (D20). The runner is told the first and the app works in the
// second, and the gap between them — 77 m at Berlin's km 36 — is why they are not one field.
import type { AidStationFact, Edition } from "../bundle/types";

/** What a station hands out. The fixed vocabulary the pipeline writes (edition_facts.py). */
export type Serves = "water" | "sports-drink" | "gel" | "fruit" | "tea" | "refill" | "own-bottle";

export interface AidStation {
  /** Where it stands on the course line, in km: the app's own scale. */
  km: number;
  /** What the organizer published, in km on the certified course: what the road sign says. */
  kmMarked: number;
  /** What the organizer calls it: "9 km", "Mile 12". */
  label: string;
  serves: Serves[];
  /** A brand, a sponsor's bottle: shown, never reasoned about. */
  detail?: string;
  note?: string;
  /** This station is last year's list. The app greys it and says so. */
  carriedOver: boolean;
  source: string;
}

/** What each thing a station serves is called on screen, and how it reads in a list of them. */
export const SERVES_NAME: Record<Serves, string> = {
  water: "water",
  "sports-drink": "sports drink",
  gel: "gel",
  fruit: "fruit",
  tea: "tea",
  refill: "refill",
  "own-bottle": "your own bottle",
};

/** The things a runner drinks, in the order a list of them reads best. */
const DRINKS: Serves[] = ["water", "sports-drink", "tea"];

/**
 * This edition's stations, in course order. Empty for an edition nobody has published a list for,
 * and the app then has no Aid layer at all rather than an invented one (PLAN.md D47).
 */
export function aidStations(edition: Edition): AidStation[] {
  return (edition.aid_stations ?? []).map(fromFact).sort((a, b) => a.km - b.km);
}

function fromFact(fact: AidStationFact): AidStation {
  return {
    km: fact.km,
    kmMarked: fact.km_marked,
    label: fact.label,
    serves: fact.serves as Serves[],
    detail: fact.detail,
    note: fact.note,
    carriedOver: fact.carried_over,
    source: fact.source,
  };
}

/** The first station at or after `km` that serves this, or null if none does. */
export function nextServing(stations: AidStation[], km: number, what: Serves): AidStation | null {
  return stations.find((station) => station.km >= km && station.serves.includes(what)) ?? null;
}

/** The last station at or before `km` that serves this, or null. */
export function lastServing(stations: AidStation[], km: number, what: Serves): AidStation | null {
  return [...stations].reverse().find((station) => station.km <= km && station.serves.includes(what)) ?? null;
}

/** The station nearest `km`, or null where there are none at all. */
export function nearestStation(stations: AidStation[], km: number): AidStation | null {
  if (stations.length === 0) return null;
  return stations.reduce((best, station) => (Math.abs(station.km - km) < Math.abs(best.km - km) ? station : best));
}

/**
 * What a station hands out, in words: "water, a sports drink and fruit". Drinks first, because
 * that is what a runner is looking for, and then the rest in the order the organizer listed them.
 * `refill` and `own-bottle` are left out: they are conditions on the station, not things served,
 * and they get their own sentence where they matter.
 */
export function servesInWords(station: AidStation): string {
  const drinks = DRINKS.filter((what) => station.serves.includes(what));
  const rest = station.serves.filter((what) => !DRINKS.includes(what) && what !== "refill" && what !== "own-bottle");
  const names = [...drinks, ...rest].map((what) => (what === "sports-drink" ? "a sports drink" : what === "gel" ? "a gel" : SERVES_NAME[what]));
  if (names.length === 0) return "a refill point";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Seam: the Race Plan <-> the browser's storage. A "reload" here is a fresh load from the same
// storage, which is all a page reload is as far as the plan is concerned.
import { describe, expect, it } from "vitest";
import type { Edition } from "../src/bundle/types";
import { defaultPlan, type PlannerCourse, type RacePlan } from "../src/core/planner";
import { loadPlan, loadUnits, type PlanStorage, rememberedCourseId, savePlan, saveUnits } from "../src/plan/plan-store";

const SOURCE = { source: "https://example.org/race-day", accessed: "2026-09-18" };
const edition = (day: string, waveIds: string[]): Edition => ({
  edition: Number(day.slice(0, 4)),
  date: { day, confirmed: true, ...SOURCE },
  waves: waveIds.map((id) => ({ id, name: id, start_local: "09:00", start: `${day}T09:00:00+00:00`, carried_over: false, ...SOURCE })),
});
const course = (courseId: string, editions: Edition[]): PlannerCourse => ({ courseId, timezone: "Europe/Berlin", lineLengthM: 42195, certifiedDistanceM: 42195, editions });

const BERLIN = course("berlin", [edition("2026-09-27", ["wave-1", "wave-2"])]);
const NYC = course("nyc", [edition("2026-11-01", ["wave-1", "wave-2", "wave-3"])]);

/** The browser's localStorage, minus the browser. */
function fakeStorage(initial: Record<string, string> = {}): PlanStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return { items, getItem: (key) => items[key] ?? null, setItem: (key, value) => void (items[key] = value) };
}

const brokenStorage: PlanStorage = {
  getItem: () => {
    throw new Error("storage is blocked");
  },
  setItem: () => {
    throw new Error("storage is full");
  },
};

describe("Race Plan store", () => {
  it("remembers the fueling plan across a reload, and throws out what no longer makes sense", () => {
    // The fueling plan is part of the Race Plan (#12), so it is saved and sanitized with it and
    // needs no storage of its own. What comes back may be an older version of the app's.
    const storage = fakeStorage();
    const plan: RacePlan = {
      ...defaultPlan(BERLIN),
      fueling: [
        { id: "a", km: 15, kind: "gel" },
        { id: "b", km: 20, kind: "station-water" },
      ],
    };

    savePlan(storage, plan);

    expect(loadPlan(storage, BERLIN).fueling).toEqual(plan.fueling);
    // A plan remembered before fueling existed simply has none.
    expect(loadPlan(fakeStorage({ "geopace.race-plans": JSON.stringify({ plans: { berlin: { edition: 2026, waveId: "wave-1" } } }) }), BERLIN).fueling).toEqual([]);
  });

  it("remembers the plan across a reload", () => {
    const storage = fakeStorage();
    const plan: RacePlan = { courseId: "nyc", edition: 2026, waveId: "wave-3", ownStartLocal: "10:02", goal: { kind: "pace", secondsPerKm: 320 }, fueling: [] };

    savePlan(storage, plan);

    expect(loadPlan(storage, NYC)).toEqual(plan);
  });

  it("remembers a plan for each course, and which course was planned last", () => {
    const storage = fakeStorage();
    const berlin: RacePlan = { courseId: "berlin", edition: 2026, waveId: "wave-2", ownStartLocal: null, goal: { kind: "finish", seconds: 12600 }, fueling: [] };
    const nyc: RacePlan = { courseId: "nyc", edition: 2026, waveId: "wave-3", ownStartLocal: null, goal: { kind: "finish", seconds: 16200 }, fueling: [] };

    savePlan(storage, berlin);
    savePlan(storage, nyc);

    expect(loadPlan(storage, BERLIN)).toEqual(berlin);
    expect(loadPlan(storage, NYC)).toEqual(nyc);
    expect(rememberedCourseId(storage)).toBe("nyc");
  });

  it("starts from the default plan when nothing is remembered", () => {
    expect(loadPlan(fakeStorage(), NYC)).toEqual(defaultPlan(NYC));
    expect(rememberedCourseId(fakeStorage())).toBeNull();
  });

  it("checks a remembered plan against today's edition facts", () => {
    const storage = fakeStorage();
    savePlan(storage, { courseId: "nyc", edition: 2026, waveId: "wave-3", ownStartLocal: null, goal: { kind: "finish", seconds: 16200 }, fueling: [] });
    const withoutWave3 = course("nyc", [edition("2026-11-01", ["wave-1", "wave-2"])]);

    expect(loadPlan(storage, withoutWave3)).toEqual({ courseId: "nyc", edition: 2026, waveId: "wave-1", ownStartLocal: null, goal: { kind: "finish", seconds: 16200 }, fueling: [] });
  });

  it("carries on with the default plan when what is stored is unreadable", () => {
    for (const stored of ["not json", "null", "[]", '{"plans":7}', '{"plans":{"nyc":"wave-1"}}']) {
      const storage = fakeStorage({ "geopace.race-plans": stored });

      expect(loadPlan(storage, NYC), stored).toEqual(defaultPlan(NYC));
      expect(rememberedCourseId(storage), stored).toBeNull();
    }
  });

  it("carries on without remembering when the browser refuses storage", () => {
    expect(loadPlan(brokenStorage, NYC)).toEqual(defaultPlan(NYC));
    expect(rememberedCourseId(brokenStorage)).toBeNull();
    expect(() => savePlan(brokenStorage, defaultPlan(NYC))).not.toThrow();
  });

  it("repairs unreadable storage the next time a plan is saved", () => {
    const storage = fakeStorage({ "geopace.race-plans": "not json" });

    savePlan(storage, defaultPlan(BERLIN));

    expect(loadPlan(storage, BERLIN)).toEqual(defaultPlan(BERLIN));
  });
});

describe("units, remembered beside the plans", () => {
  const plan: RacePlan = { courseId: "nyc", edition: 2026, waveId: "wave-2", ownStartLocal: null, goal: { kind: "finish", seconds: 4 * 3600 }, fueling: [] };

  it("opens in kilometres on a first visit", () => {
    expect(loadUnits(fakeStorage())).toBe("km");
  });

  it("remembers miles across a reload, for every course at once", () => {
    const storage = fakeStorage();
    saveUnits(storage, "mi");

    expect(loadUnits(storage)).toBe("mi");
    // The choice belongs to the runner, not to a course: no plan had to exist for it to stick.
    expect(rememberedCourseId(storage)).toBeNull();
  });

  it("opens a plan remembered before units existed in kilometres, and keeps the plan", () => {
    const before = fakeStorage({ "geopace.race-plans": JSON.stringify({ lastCourseId: "nyc", plans: { nyc: plan } }) });

    expect(loadUnits(before)).toBe("km");
    expect(loadPlan(before, NYC)).toEqual(plan);
  });

  it("never changes the plan when the units change, and never loses the units when the plan does", () => {
    const storage = fakeStorage();
    savePlan(storage, plan);
    saveUnits(storage, "mi");
    expect(loadPlan(storage, NYC)).toEqual(plan); // a 4:00:00 goal is still 4:00:00

    savePlan(storage, { ...plan, waveId: "wave-3" });
    expect(loadUnits(storage)).toBe("mi");

    saveUnits(storage, "km");
    expect(loadPlan(storage, NYC)).toEqual({ ...plan, waveId: "wave-3" });
  });

  it("reads anything that isn't a unit as kilometres, and survives blocked storage", () => {
    expect(loadUnits(fakeStorage({ "geopace.race-plans": JSON.stringify({ lastCourseId: null, plans: {}, units: "furlongs" }) }))).toBe("km");
    expect(loadUnits(brokenStorage)).toBe("km");
    expect(() => saveUnits(brokenStorage, "mi")).not.toThrow();
  });
});

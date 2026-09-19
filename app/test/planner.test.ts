// Seam: a Race Plan (edition, wave, goal) + a course's edition facts -> the Planner, which says
// what time it is wherever the runner is, and where the runner is at any time.
//
// Expected values are wall-clock arithmetic anyone can redo by hand. The course here is made up,
// so a change to the real edition facts (NYRR publishing its 2026 waves, say) can't break a test
// of the logic; the committed bundles get their own checks at the bottom.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import type { Edition } from "../src/bundle/types";
import { createPlanner, defaultPlan, goalWrittenAs, hasStartTime, ownStartTimeFor, parseGoal, parseStartTime, plannerCourse, type PlannerCourse, type RacePlan, sanitizePlan } from "../src/core/planner";
import { formatElapsed } from "../src/core/race-clock";

const SOURCE = { source: "https://example.org/race-day", accessed: "2026-09-18" };

const NYC_2026: Edition = {
  edition: 2026,
  date: { day: "2026-11-01", confirmed: true, ...SOURCE },
  carried_over: { from_edition: 2025, reason: "The 2026 wave times aren't published yet." },
  waves: [
    { id: "wave-1", name: "Wave 1", start_local: "09:10", start: "2026-11-01T09:10:00-05:00", carried_over: false, ...SOURCE },
    { id: "wave-2", name: "Wave 2", start_local: "09:45", start: "2026-11-01T09:45:00-05:00", carried_over: true, ...SOURCE },
    { id: "wave-3", name: "Wave 3", start_local: null, start: null, carried_over: false, note: "Not published yet.", ...SOURCE },
  ],
};

// A course line exactly as long as the certified distance, so "km 21.0975" is plainly halfway.
const NYC: PlannerCourse = {
  courseId: "nyc",
  timezone: "America/New_York",
  lineLengthM: 42195,
  certifiedDistanceM: 42195,
  editions: [NYC_2026],
};

const plan = (overrides: Partial<RacePlan> = {}): RacePlan => ({
  courseId: "nyc",
  edition: 2026,
  waveId: "wave-1",
  ownStartLocal: null,
  goal: { kind: "finish", seconds: 4 * 3600 },
  ...overrides,
});

describe("Planner", () => {
  it("tells the clock time and the elapsed time at a km, for a wave and a goal finish time", () => {
    const planner = createPlanner(NYC, plan());

    const halfway = planner.at(21.0975);
    expect(formatElapsed(halfway.elapsedSeconds)).toBe("2:00:00");
    expect(halfway.localClock).toBe("11:10"); // 09:10 + two hours
    expect(planner.at(42.195).localClock).toBe("13:10"); // the goal, at the finish line
    expect(planner.at(0).localClock).toBe("09:10");
  });

  it("takes the goal as a pace per kilometre instead, the way a training plan states it", () => {
    // 5:00/km over the certified 42.195 km is 3:30:58.5.
    const planner = createPlanner(NYC, plan({ goal: { kind: "pace", secondsPerKm: 300 } }));

    expect(formatElapsed(planner.goalFinishSeconds)).toBe("3:30:59");
    expect(formatElapsed(planner.at(10).elapsedSeconds)).toBe("50:00");
    expect(planner.at(10).localClock).toBe("10:00"); // 09:10 + 50 minutes
  });

  it("counts km along the course line, which runs longer than the certified distance", () => {
    // PLAN.md D20: the app's one distance scale is the course line (New York's is 42.69 km), and a
    // goal is a promise about the finish line. So a 5:00/km runner, who finishes in 3:30:58.5,
    // reaches line km 10 after 3:30:58.5 x 10 / 42.69 = 49:25, not 50:00: line km 10 is only
    // 9.88 km of the certified course. Pinned here so it is a known property, not a surprise.
    const longerLine = createPlanner({ ...NYC, lineLengthM: 42690 }, plan({ goal: { kind: "pace", secondsPerKm: 300 } }));

    expect(formatElapsed(longerLine.at(10).elapsedSeconds)).toBe("49:25");
    expect(formatElapsed(longerLine.at(42.69).elapsedSeconds)).toBe("3:30:59");
  });

  it("gets New York right on Sunday 2026-11-01, the morning US clocks go back", () => {
    const planner = createPlanner(NYC, plan());

    // Daylight saving ended at 02:00, hours before the start: 09:10 is EST (UTC-5). A converter
    // that still believed in EDT would put the start, and every shadow after it, an hour out.
    expect(planner.at(0).instant.toISOString()).toBe("2026-11-01T14:10:00.000Z");
    expect(planner.at(0).zoneLabel).toBe("EST");
    expect(planner.at(42.195).instant.toISOString()).toBe("2026-11-01T18:10:00.000Z");
    expect(planner.at(42.195).localClock).toBe("13:10");
  });

  it("gives the course's time of day whatever time zone the computer is in", () => {
    const computerZone = process.env.TZ;
    try {
      for (const zone of ["Asia/Tokyo", "America/Los_Angeles", "UTC", "Europe/Berlin"]) {
        process.env.TZ = zone;
        const halfway = createPlanner(NYC, plan()).at(21.0975);

        expect(halfway.localClock, `on a computer in ${zone}`).toBe("11:10");
        expect(halfway.zoneLabel, `on a computer in ${zone}`).toBe("EST");
        expect(halfway.instant.toISOString(), `on a computer in ${zone}`).toBe("2026-11-01T16:10:00.000Z");
      }
    } finally {
      if (computerZone === undefined) delete process.env.TZ;
      else process.env.TZ = computerZone;
    }
  });

  it("maps a clock time back to the km the runner has reached, so scrubbing round-trips", () => {
    const planner = createPlanner(NYC, plan());

    // A known pair first: 11:10 EST is two hours in, which at even pace is halfway.
    expect(planner.kmAtInstant(new Date("2026-11-01T16:10:00Z"))).toBeCloseTo(21.0975, 6);
    // Then there and back, from both ends. A Date holds whole milliseconds and a runner covers
    // a few millimetres in one, so "the same km" means to within 5 cm (4 decimal places of a km).
    for (const km of [0, 0.1, 7.3, 31.4, 42.195]) {
      expect(planner.kmAtInstant(planner.at(km).instant)).toBeCloseTo(km, 4);
    }
    const noon = new Date("2026-11-01T17:00:00Z");
    expect(planner.at(planner.kmAtInstant(noon)).instant.getTime()).toBeCloseTo(noon.getTime(), -1);
  });

  it("keeps the runner on the course when asked about a time before the start or after the finish", () => {
    const planner = createPlanner(NYC, plan());

    expect(planner.kmAtInstant(new Date("2026-11-01T06:00:00Z"))).toBe(0);
    expect(planner.kmAtInstant(new Date("2026-11-02T00:00:00Z"))).toBe(42.195);
    expect(planner.at(-3).km).toBe(0);
    expect(planner.at(99).km).toBe(42.195);
  });

  it("lists the time of day and the elapsed time at every whole km, and at the finish", () => {
    const splits = createPlanner(NYC, plan()).splits(1);

    // Four hours over 42.195 km is 5:41.27 per km, from a 09:10 start.
    expect(splits.map((split) => split.km).slice(0, 3)).toEqual([1, 2, 3]);
    expect(formatElapsed(splits[0].elapsedSeconds)).toBe("5:41");
    expect(splits[0].localClock).toBe("09:15");
    expect(splits[9].km).toBe(10);
    expect(formatElapsed(splits[9].elapsedSeconds)).toBe("56:53");
    expect(splits[9].localClock).toBe("10:06");
    // 42 whole kilometres, then the finish line at 42.195.
    expect(splits).toHaveLength(43);
    expect(splits[42].km).toBe(42.195);
    expect(formatElapsed(splits[42].elapsedSeconds)).toBe("4:00:00");
    expect(splits[42].localClock).toBe("13:10");
  });

  it("splits at any distance, which is what a table in miles will need", () => {
    const planner = createPlanner(NYC, plan());

    expect(planner.splits(5).map((split) => split.km)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 42.195]);
    // A mile is 1.609344 km: 26 whole miles in a marathon, then the finish.
    const miles = planner.splits(1.609344);
    expect(miles).toHaveLength(27);
    expect(miles[25].km).toBeCloseTo(26 * 1.609344, 9);
    // Four hours is 9:09 a mile.
    expect(formatElapsed(miles[0].elapsedSeconds)).toBe("9:09");
  });

  it("does not list the finish twice when the course ends exactly on a mark", () => {
    const splits = createPlanner({ ...NYC, lineLengthM: 42000 }, plan()).splits(1);

    expect(splits).toHaveLength(42);
    expect(splits[41].km).toBe(42);
  });

  it("flags times that rest on a carried-over wave, with the edition they came from and why", () => {
    const planner = createPlanner(NYC, plan({ waveId: "wave-2" }));

    expect(planner.carriedOver).toEqual({ fromEdition: 2025, reason: "The 2026 wave times aren't published yet." });
    // The times are still given (greyed by whoever draws them), not withheld.
    expect(planner.at(0).localClock).toBe("09:45");
  });

  it("does not flag a wave the organizer has confirmed, even in an edition with carried-over waves", () => {
    expect(createPlanner(NYC, plan({ waveId: "wave-1" })).carriedOver).toBeNull();
  });

  it("refuses to run a clock for a wave whose start time nobody has published", () => {
    expect(() => createPlanner(NYC, plan({ waveId: "wave-3" }))).toThrow(/No race clock/);
  });

  it("runs the clock from the runner's own start time when they give one", () => {
    const planner = createPlanner(NYC, plan({ ownStartLocal: "09:33" }));

    expect(planner.startLocal).toBe("09:33");
    expect(planner.ownStartTime).toBe(true);
    expect(planner.at(0).instant.toISOString()).toBe("2026-11-01T14:33:00.000Z"); // 09:33 EST
    expect(planner.at(21.0975).localClock).toBe("11:33");
    // Without one, it is the wave's published time.
    expect(createPlanner(NYC, plan()).startLocal).toBe("09:10");
    expect(createPlanner(NYC, plan()).ownStartTime).toBe(false);
  });

  it("lets a wave with no published start time be planned with, once the runner gives their own", () => {
    const planner = createPlanner(NYC, plan({ waveId: "wave-3", ownStartLocal: "10:20" }));

    expect(planner.wave.name).toBe("Wave 3");
    expect(planner.at(0).localClock).toBe("10:20");
  });

  it("does not flag the runner's own start time as carried over: it is theirs, not last edition's", () => {
    expect(createPlanner(NYC, plan({ waveId: "wave-2" })).carriedOver).not.toBeNull();
    expect(createPlanner(NYC, plan({ waveId: "wave-2", ownStartLocal: "09:50" })).carriedOver).toBeNull();
  });
});

describe("Race Plan", () => {
  // Wave 1 has no published time here, as in Berlin 2026's later waves.
  const timeless = { ...NYC_2026.waves[2], id: "wave-0", name: "Wave 0" };
  const course: PlannerCourse = {
    ...NYC,
    editions: [{ ...NYC_2026, edition: 2025, date: { day: "2025-11-02", confirmed: true, ...SOURCE } }, { ...NYC_2026, waves: [timeless, ...NYC_2026.waves] }],
  };

  it("starts a new runner on the latest edition, in its first wave with a published time, aiming for four hours", () => {
    expect(defaultPlan(course)).toEqual({ courseId: "nyc", edition: 2026, waveId: "wave-1", ownStartLocal: null, goal: { kind: "finish", seconds: 14400 } });
  });

  it("keeps a remembered plan that still makes sense", () => {
    const remembered: RacePlan = { courseId: "nyc", edition: 2025, waveId: "wave-2", ownStartLocal: "09:50", goal: { kind: "pace", secondsPerKm: 320 } };

    expect(sanitizePlan(course, remembered)).toEqual(remembered);
  });

  it("replaces only the parts of a remembered plan that no longer make sense", () => {
    const goal = { kind: "finish", seconds: 3 * 3600 + 45 * 60 };

    // A wave that has since been removed, or has no start time: first wave that has one.
    expect(sanitizePlan(course, { courseId: "nyc", edition: 2026, waveId: "wave-9", goal })).toEqual({ courseId: "nyc", edition: 2026, waveId: "wave-1", ownStartLocal: null, goal });
    expect(sanitizePlan(course, { courseId: "nyc", edition: 2026, waveId: "wave-3", goal }).waveId).toBe("wave-1");
    // An edition we have no facts for: the latest one.
    expect(sanitizePlan(course, { courseId: "nyc", edition: 2019, waveId: "wave-2", goal })).toEqual({ courseId: "nyc", edition: 2026, waveId: "wave-2", ownStartLocal: null, goal });
    // A goal nobody could mean.
    for (const nonsense of [{ kind: "finish", seconds: -5 }, { kind: "finish", seconds: "fast" }, { kind: "pace", secondsPerKm: 1 }, { kind: "stroll" }, null]) {
      expect(sanitizePlan(course, { courseId: "nyc", edition: 2026, waveId: "wave-2", goal: nonsense }).goal).toEqual({ kind: "finish", seconds: 14400 });
    }
    // Not a plan at all.
    for (const junk of [null, undefined, "plan", 7, [], { goal: {} }]) {
      expect(sanitizePlan(course, junk)).toEqual(defaultPlan(course));
    }
  });

  it("keeps a remembered own start time, and with it a wave that has no published one", () => {
    const goal = { kind: "finish", seconds: 14400 };

    expect(sanitizePlan(course, { edition: 2026, waveId: "wave-3", ownStartLocal: "10:20", goal })).toEqual({ courseId: "nyc", edition: 2026, waveId: "wave-3", ownStartLocal: "10:20", goal });
    // A plan remembered before own start times existed has none.
    expect(sanitizePlan(course, { edition: 2026, waveId: "wave-2", goal }).ownStartLocal).toBeNull();
    // An own start time that isn't a time of day is dropped, and the wave with it if it has no time of its own.
    for (const junk of ["25:00", "9:5", "soon", 620, {}, ""]) {
      expect(sanitizePlan(course, { edition: 2026, waveId: "wave-2", ownStartLocal: junk, goal }), String(junk)).toEqual({ courseId: "nyc", edition: 2026, waveId: "wave-2", ownStartLocal: null, goal });
      expect(sanitizePlan(course, { edition: 2026, waveId: "wave-3", ownStartLocal: junk, goal }).waveId, String(junk)).toBe("wave-1");
    }
  });

  it("reads a start time the way a runner types it", () => {
    expect(parseStartTime("09:33")).toBe("09:33");
    expect(parseStartTime(" 9:05 ")).toBe("09:05");
    expect(parseStartTime("23:59")).toBe("23:59");
    for (const text of ["", "24:00", "9:60", "9.30", "0933", "9:5", "soon"]) {
      expect(parseStartTime(text), `"${text}"`).toBeNull();
    }
  });

  it("counts a typed start time as the runner's own only when it tells us something the wave doesn't", () => {
    const [confirmed, carriedOver, notPublished] = NYC_2026.waves;

    expect(ownStartTimeFor(confirmed, "09:12")).toBe("09:12");
    expect(ownStartTimeFor(notPublished, "10:20")).toBe("10:20");
    // The organizer's confirmed time, typed back in: nothing new, so no override to remember.
    expect(ownStartTimeFor(confirmed, "09:10")).toBeNull();
    // A carried-over time, typed in on purpose: the runner's start card agrees with last edition's.
    // That is a confirmation from the best source there is, so it is theirs, and no longer greyed.
    expect(ownStartTimeFor(carriedOver, "09:45")).toBe("09:45");
  });

  it("always yields a plan the Planner can run", () => {
    expect(() => createPlanner(course, sanitizePlan(course, { edition: 2026, waveId: "wave-0" }))).not.toThrow();
  });

  it("reads a goal the way a runner types it", () => {
    expect(parseGoal("finish", "3:45", course)).toEqual({ kind: "finish", seconds: 13500 });
    expect(parseGoal("finish", " 3:45:30 ", course)).toEqual({ kind: "finish", seconds: 13530 });
    expect(parseGoal("pace", "5:20", course)).toEqual({ kind: "pace", secondsPerKm: 320 });
  });

  it("reads a pace typed per mile when the runner thinks in miles, and keeps it per km inside", () => {
    const typed = parseGoal("pace", "9:09", course, "mi");
    expect(typed?.kind).toBe("pace");
    expect(typed?.kind === "pace" && typed.secondsPerKm).toBeCloseTo(549 / 1.609344, 9);
    // 9:09 per km would be a six-and-a-half-hour marathon, and 5:20 per mile a 2:20 one: both fine.
    // But what is plausible is judged on the marathon it means, not on the digits.
    expect(parseGoal("pace", "20:00", course, "mi")).not.toBeNull(); // 8:44 finish
    expect(parseGoal("pace", "25:00", course, "mi")).toBeNull(); // 10:55 finish
    // A finish time is a finish time in any units.
    expect(parseGoal("finish", "4:00", course, "mi")).toEqual({ kind: "finish", seconds: 14400 });
  });

  it("keeps the goal itself when the runner switches how it is written", () => {
    const fourHours = { kind: "finish", seconds: 4 * 3600 } as const;
    const asPace = goalWrittenAs("pace", fourHours, course);

    // 4:00:00 is 5:41.27/km. Rounding that to 5:41 and back would quietly make it 3:59:48.
    expect(asPace.kind).toBe("pace");
    expect(goalWrittenAs("finish", asPace, course)).toEqual(fourHours);
    expect(goalWrittenAs("finish", goalWrittenAs("pace", { kind: "finish", seconds: 13500 }, course), course)).toEqual({ kind: "finish", seconds: 13500 });
    // Written the way it already is: untouched.
    expect(goalWrittenAs("finish", fourHours, course)).toBe(fourHours);
  });

  it("turns down a goal that isn't a time, or isn't a marathon anyone runs", () => {
    for (const text of ["", "fast", "3:75", "3.45", "-3:45", "0:45", "11:00"]) {
      expect(parseGoal("finish", text, course), `finish "${text}"`).toBeNull();
    }
    // 1:30/km would be a 63-minute marathon; 20:00/km is a fourteen-hour one.
    for (const text of ["", "5", "5:75", "1:30", "20:00"]) {
      expect(parseGoal("pace", text, course), `pace "${text}"`).toBeNull();
    }
  });
});

describe("the committed courses", () => {
  const committed = (id: string) =>
    plannerCourse(parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${id}/course-bundle.json`, import.meta.url), "utf8")), id));

  it("agree with the pipeline on the exact moment every wave starts", () => {
    // Two independent answers to "when is 09:10 in New York on 2026-11-01?": Python's zoneinfo
    // wrote `start` into the bundle, and the app works it out again from the wall-clock time.
    for (const id of ["berlin", "nyc"]) {
      const course = committed(id);
      for (const edition of course.editions) {
        for (const wave of edition.waves.filter(hasStartTime)) {
          const planner = createPlanner(course, { ...defaultPlan(course), edition: edition.edition, waveId: wave.id });
          expect(planner.startInstant.getTime(), `${id} ${edition.edition} ${wave.name}`).toBe(new Date(wave.start).getTime());
        }
      }
    }
  });

  it("put New York's 2026 race on standard time, not daylight time", () => {
    const course = committed("nyc");
    const planner = createPlanner(course, { ...defaultPlan(course), edition: 2026 });

    expect(planner.edition.date.day).toBe("2026-11-01");
    expect(planner.at(0).zoneLabel).toBe("EST");
    // Berlin in late September is on summer time; browsers call it "GMT+2" or "CEST".
    expect(createPlanner(committed("berlin"), defaultPlan(committed("berlin"))).at(0).zoneLabel).toMatch(/^(GMT\+2|CEST)$/);
  });
});

// Seam: a number held in meters and km -> what a runner who thinks in kilometres or in miles
// reads and types. Everything inside the app stays metric; only this module converts.
import { describe, expect, it } from "vitest";
import { formatPace } from "../src/core/race-clock";
import {
  axisMarks,
  feetToMeters,
  formatDistance,
  formatHeight,
  formatNearby,
  KM_PER_MILE,
  kmToMiles,
  M_PER_FOOT,
  metersToFeet,
  milesToKm,
  paceInUnits,
  secondsPerKmFromPace,
  unitKm,
} from "../src/core/units";

describe("converting", () => {
  it("uses the exact factors, which are definitions and not measurements", () => {
    expect(KM_PER_MILE).toBe(1.609344);
    expect(M_PER_FOOT).toBe(0.3048);
    expect(kmToMiles(1.609344)).toBe(1);
    expect(metersToFeet(0.3048)).toBe(1);
    expect(kmToMiles(42.195)).toBeCloseTo(26.2188, 4);
  });

  it("round-trips, so switching units and back never moves anything", () => {
    for (const km of [0, 0.1, 5, 21.0975, 42.195, 42.69]) expect(milesToKm(kmToMiles(km))).toBeCloseTo(km, 12);
    for (const m of [-3, 0, 2.37, 78.11]) expect(feetToMeters(metersToFeet(m))).toBeCloseTo(m, 12);
  });
});

describe("what a runner reads", () => {
  it("shows a distance along the course in the chosen unit", () => {
    expect(formatDistance(21.0975, "km")).toBe("21.10 km");
    expect(formatDistance(21.0975, "mi")).toBe("13.11 mi");
    expect(formatDistance(42.69, "mi", 1)).toBe("26.5 mi");
  });

  it("shows a height in metres or feet", () => {
    expect(formatHeight(78.11, "km")).toBe("78 m");
    expect(formatHeight(78.11, "mi")).toBe("256 ft");
    expect(formatHeight(-0.4, "km")).toBe("0 m"); // never "-0 m"
  });

  it("says a nearby distance the way a runner would: round, and small units when close", () => {
    expect(formatNearby(0.42, "km")).toBe("400 m");
    expect(formatNearby(0.98, "km")).toBe("1.0 km");
    expect(formatNearby(1.24, "km")).toBe("1.2 km");
    expect(formatNearby(0.42, "mi")).toBe("0.3 mi");
    expect(formatNearby(0.1, "mi")).toBe("350 ft");
    expect(formatNearby(1.24, "mi")).toBe("0.8 mi");
  });

  it("reads a 4:00:00 marathon as 5:41 per km and 9:09 per mile", () => {
    const secondsPerKm = (4 * 3600) / 42.195;
    expect(formatPace(paceInUnits(secondsPerKm, "km"))).toBe("5:41");
    expect(formatPace(paceInUnits(secondsPerKm, "mi"))).toBe("9:09");
  });

  it("takes a typed pace per mile back to the per-km pace the Planner keeps", () => {
    expect(secondsPerKmFromPace(549, "km")).toBe(549);
    expect(secondsPerKmFromPace(549, "mi")).toBeCloseTo(549 / 1.609344, 12);
    // There and back: what was typed is what is shown.
    expect(formatPace(paceInUnits(secondsPerKmFromPace(9 * 60 + 9, "mi"), "mi"))).toBe("9:09");
  });
});

describe("marks along the strip", () => {
  it("has one km, or one mile, as the length of a step", () => {
    expect(unitKm("km")).toBe(1);
    expect(unitKm("mi")).toBe(1.609344);
  });

  it("puts a mark at every fifth kilometre, placed in km whatever the unit shown", () => {
    const marks = axisMarks(42.28, "km");
    expect(marks.map((mark) => mark.label)).toEqual(["0", "5", "10", "15", "20", "25", "30", "35", "40"]);
    expect(marks[1].km).toBe(5);
  });

  it("puts a mark at every fifth mile when miles are shown", () => {
    const marks = axisMarks(42.69, "mi");
    expect(marks.map((mark) => mark.label)).toEqual(["0", "5", "10", "15", "20", "25"]);
    expect(marks[1].km).toBeCloseTo(8.04672, 9);
    expect(marks[5].km).toBeLessThan(42.69);
  });
});

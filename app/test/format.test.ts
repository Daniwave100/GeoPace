// Seam: numbers and dates -> the words a runner reads.
import { describe, expect, it } from "vitest";
import { grade, raceDate, shortName } from "../src/mockups/format";

describe("mockup formatting", () => {
  it("writes a race date out in full, whatever time zone the browser is in", () => {
    // A bare date parsed as local midnight slips to the day before west of Greenwich. The NYC
    // date is the one that matters: it is the day the clocks change.
    expect(raceDate("2026-11-01")).toBe("Sunday 1 November 2026");
    expect(raceDate("2026-09-27")).toBe("Sunday 27 September 2026");
  });

  it("signs a grade so a descent can't be read as a climb", () => {
    expect(grade(3.24)).toBe("+3.2%");
    expect(grade(-3.24)).toBe("−3.2%");
  });

  it("shortens a landmark name at a word, and leaves short ones alone", () => {
    expect(shortName("Ed Koch Queensboro Bridge (into Manhattan)")).toBe("Ed Koch Queensboro…");
    expect(shortName("Leaves the park at Grand Army Plaza")).toBe("Leaves the park at Grand…");
    expect(shortName("Columbus Circle")).toBe("Columbus Circle");
  });
});

// Seam: the organizer's refreshment points, and what they make of a runner's fueling plan (#12).
//
// The one thing this feature is for is a sentence nobody can work out from either half alone: you
// have a gel at 15 km and the next water is at 17.5 km. So most of what is tested here is that
// sentence — when it appears, when it doesn't, and what it offers instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import type { AidStationFact, CourseBundle } from "../src/bundle/types";
import { aidLayer, furthestWithoutWater, toNextWaterKm } from "../src/core/aid-layer";
import { type AidStation, aidStations, nextServing, servesInWords } from "../src/core/aid";
import { checkFueling, type FuelItem, type FuelKind, sanitizeFueling, WATER_WITHIN_KM } from "../src/core/fueling";
import { somewhereFree } from "../src/plan/fueling-panel";
import { createPlanner, plannerCourse, type RacePlan } from "../src/core/planner";

const berlin = parseCourseBundle(JSON.parse(readFileSync(new URL("../../data/derived/berlin/course-bundle.json", import.meta.url), "utf8")), "berlin");
const nyc = parseCourseBundle(JSON.parse(readFileSync(new URL("../../data/derived/nyc/course-bundle.json", import.meta.url), "utf8")), "nyc");

const planFor = (bundle: CourseBundle, fueling: FuelItem[] = []): RacePlan => ({
  courseId: bundle.course_id,
  edition: 2026,
  waveId: "wave-1",
  ownStartLocal: null,
  goal: { kind: "finish", seconds: 4 * 3600 },
  fueling,
});
const layerFor = (bundle: CourseBundle) => aidLayer(bundle, createPlanner(plannerCourse(bundle), planFor(bundle)));

/** A made-up list, for the cases the real courses don't happen to hold. */
function station(km: number, serves: string[], extra: Partial<AidStation> = {}): AidStation {
  return { km, kmMarked: km, label: `${km} km`, serves: serves as AidStation["serves"], carriedOver: false, source: "https://example.org/course", ...extra };
}

const item = (km: number, kind: FuelKind, id = `i-${km}-${kind}`): FuelItem => ({ id, km, kind });

describe("the organizer's stations, as the bundle carries them", () => {
  it("are Berlin's fifteen, in course order, each with what it serves and where it came from", () => {
    const stations = aidStations(berlin.editions[0]);

    expect(stations).toHaveLength(15);
    expect(stations.map((s) => s.label)).toEqual(["5 km", "9 km", "12 km", "15 km", "17.5 km", "20 km", "22.5 km", "25 km", "27.5 km", "30 km", "32.5 km", "34.5 km", "36 km", "38 km", "40 km"]);
    expect(stations.every((s) => s.serves.includes("water"))).toBe(true);
    expect(stations.every((s) => /^https?:\/\//.test(s.source))).toBe(true);
    expect(stations.find((s) => s.label === "27.5 km")?.serves).toContain("gel");
  });

  it("stand on the course line, not on the certified course the signs are marked on", () => {
    // Berlin's line is 42.285 km where the certified course is 42.195: a station is where the
    // organizer's own kilometre lands on our line, and 40 km of signs is 40.085 km of our road.
    const last = aidStations(berlin.editions[0])[14];

    expect(last.kmMarked).toBe(40);
    expect(last.km).toBeCloseTo(40.085, 2);
    expect(last.km).toBeGreaterThan(last.kmMarked);
  });

  it("are absent for New York, so the course has no Aid layer at all", () => {
    // NYRR publishes them behind a waiting room our tools don't pass, and we don't work around it
    // (PLAN.md §10). Only layers that exist get a switch (D47) — never an invented list.
    expect(aidStations(nyc.editions[0])).toEqual([]);
    expect(layerFor(nyc)).toBeNull();
  });

  it("read as a sentence, drinks first", () => {
    expect(servesInWords(station(9, ["water", "fruit", "tea", "sports-drink", "refill", "own-bottle"]))).toBe("water, a sports drink, tea and fruit");
    expect(servesInWords(station(5, ["water", "refill"]))).toBe("water");
    expect(servesInWords(station(27.5, ["water", "gel", "refill"]))).toBe("water and a gel");
  });
});

describe("the Aid layer", () => {
  it("marks every station on the course line, and names what each one has", () => {
    const layer = layerFor(berlin)!;

    expect(layer.lineMarks()).toHaveLength(15);
    expect(layer.lineMarks().every((mark) => mark.encoding === "measured" && mark.toKm > mark.fromKm)).toBe(true);
    expect(layer.lineLabels().map((label) => label.text("km"))).toContain("27.5 km: water and a gel");
  });

  it("charts how far there still is to run for water, which is what a runner wants off a chart", () => {
    const layer = layerFor(berlin)!;
    const [row] = layer.rows();
    const bins = row.bins(400);

    // A sawtooth: it climbs through every dry stretch and drops to nothing at each station.
    expect(Math.min(...bins.map((bin) => bin.value as number))).toBeLessThan(0.2);
    expect(Math.max(...bins.map((bin) => bin.value as number))).toBeLessThanOrEqual(row.domain[1]);
    expect(Math.max(...bins.map((bin) => bin.value as number))).toBeGreaterThan(row.domain[1] - 0.2);
    expect(bins.every((bin) => (bin.value as number) >= 0 && bin.encoding === "measured")).toBe(true);
    expect(row.valueAt(9.02, "km").text).toBe("water here");
  });

  it("measures its own reach by the water, not by the stations", () => {
    // The row counts the run to the next *water*, so a list with a gel depot in it — which is
    // exactly what New York's will be — must not have its scale set by the depot. Otherwise the
    // trace climbs past the top of the row and the header states a maximum it exceeds.
    const withADepot = [station(5, ["water"]), station(12, ["gel"]), station(20, ["water"])];

    expect(furthestWithoutWater(withADepot, 42)).toBe(22); // finish to the last water, not 8 to the depot
    expect(furthestWithoutWater([station(5, ["water"]), station(20, ["water"])], 42)).toBe(22);
    expect(Math.max(...[10, 16, 30].map((km) => toNextWaterKm(km, withADepot, 42)))).toBeLessThanOrEqual(furthestWithoutWater(withADepot, 42));
  });

  it("counts the run to the finish as thirst once the last station is behind you", () => {
    const stations = [station(5, ["water"])];

    expect(toNextWaterKm(1, stations, 10)).toBe(4);
    expect(toNextWaterKm(6, stations, 10)).toBe(4); // nothing more is coming: the count runs to the end
    expect(nextServing(stations, 6, "water")).toBeNull();
  });

  it("says the next station in the sentence, and what is on it when you get there", () => {
    const layer = layerFor(berlin)!;

    expect(layer.clause(8, "km")?.text).toMatch(/^Water, a sports drink, tea and fruit in [\d.]+ ?(m|km), at 9 km\.$/);
    expect(layer.clause(9.02, "km")?.text).toBe("Water, a sports drink, tea and fruit here, at the 9 km station.");
    expect(layer.clause(9.02, "km")?.note).toMatch(/Maurten DRINK MIX 160/);
    expect(layer.clause(41, "km")?.text).toBe("No more aid stations.");
  });

  it("puts the same note on the map label as in the sentence, so the two never disagree", () => {
    const layer = layerFor(berlin)!;
    const label = layer.lineLabels().find((mark) => mark.text("km").startsWith("9 km"))!;

    expect(label.note).toBe(layer.clause(9.02, "km")?.note);
    expect(label.note).toMatch(/Maurten DRINK MIX 160/);
  });

  it("flags a station carried over from last year's list, and says why", () => {
    // New York's will be this, the day somebody copies NYRR's page in: the waves are this year's
    // and the refreshment list is last year's, and the runner is told which is which.
    const lastYears = JSON.parse(JSON.stringify(berlin)) as CourseBundle;
    lastYears.editions[0].carried_over = { from_edition: 2025, reason: "The 2026 list is not published yet." };
    for (const station of lastYears.editions[0].aid_stations as AidStationFact[]) station.carried_over = true;

    const clause = aidLayer(lastYears, createPlanner(plannerCourse(lastYears), planFor(lastYears)))!.clause(8, "km")!;

    expect(clause.carriedOver).toBe(true);
    expect(clause.note).toContain("This is 2025's list. The 2026 list is not published yet.");
    // And a reader who can't see the grey hears what was carried over. Not "a start time", which
    // is what carrying over meant when only a wave time could be carried over.
    expect(clause.carriedOverSaid).toBe(" (from an earlier edition's list of refreshment points)");
  });
});

describe("the fueling check", () => {
  const berlinStations = aidStations(berlin.editions[0]);

  it("says nothing at all about a plan that works", () => {
    // Berlin has water at 15 km and at 17.5; a gel just before either is a gel washed down.
    const clean = [item(14.9, "gel"), item(17.4, "chew"), item(20.0, "station-sports-drink"), item(25.0, "own-drink")];

    expect(checkFueling(clean, berlinStations, 42.285)).toEqual([]);
  });

  it("names the next water and somewhere to move to, for a gel with none in reach", () => {
    // Berlin's longest dry stretch after the start is 5 km to 9 km: a gel in the middle of it has
    // water a kilometre and a half behind and two and a half ahead.
    const [warning, ...rest] = checkFueling([item(6.5, "gel", "the-gel")], berlinStations, 42.285);

    expect(rest).toEqual([]);
    expect(warning.itemId).toBe("the-gel");
    expect(warning.atKm).toBe(6.5);
    expect(warning.suggestedKm).toBeCloseTo(8.92, 2); // just before the water at 9.019
    // The sentence states the problem and stops: the Move button beside it offers the fix.
    expect(warning.text("km")).toBe("Gel at 6.50 km, and the next water is at 9.02 km (9 km).");
  });

  it("counts water the runner has just passed, as well as water ahead", () => {
    const stations = [station(10, ["water"]), station(20, ["water"])];

    expect(checkFueling([item(10.3, "gel")], stations, 42)).toEqual([]); // drunk three minutes ago
    expect(checkFueling([item(20 - WATER_WITHIN_KM + 0.01, "gel")], stations, 42)).toEqual([]); // water just ahead
    expect(checkFueling([item(11.5, "gel")], stations, 42)).toHaveLength(1); // dry both ways
  });

  it("says so when a runner is relying on a drink the station there doesn't have", () => {
    // Berlin's 12 km is a water table: there is no sports drink until 15 km.
    const [warning] = checkFueling([item(12.03, "station-sports-drink")], berlinStations, 42.285);

    expect(warning.text("km")).toBe("The station at 12.03 km (12 km) has no sports drink. The next one with a sports drink is at 15.03 km (15 km).");
    expect(warning.suggestedKm).toBeCloseTo(15.03, 1);
  });

  it("says so when a runner is relying on a station that isn't there at all", () => {
    const [warning] = checkFueling([item(18.5, "station-water")], berlinStations, 42.285);

    expect(warning.text("km")).toMatch(/^There is no station at 18\.50 km\. The next one with water is at 20\.04 km \(20 km\)\.$/);
  });

  it("knows which of Berlin's stations will have your own bottle waiting, and which won't", () => {
    // Own refreshments are taken at 5, 9, 15, 20, 25, 30, 36 and 40 km, and nowhere else.
    expect(checkFueling([item(20.04, "own-drink")], berlinStations, 42.285)).toEqual([]);
    expect(checkFueling([item(22.55, "own-drink")], berlinStations, 42.285)).toHaveLength(1);
  });

  it("stays quiet about a course whose stations nobody has published", () => {
    // Never invented warnings from an empty list: New York would otherwise warn about everything.
    expect(checkFueling([item(15, "gel"), item(20, "station-water")], [], 42.688)).toEqual([]);
  });

  it("tells a runner to carry their own where there is no water left to move to", () => {
    const stations = [station(5, ["water"])];

    const [warning] = checkFueling([item(30, "gel")], stations, 42);

    expect(warning.suggestedKm).toBeNull();
    expect(warning.text("km")).toBe("Gel at 30.00 km, and there is no water after it. Carry your own.");
  });

  it("gives each warning the id of the item that earned it, so the plan can point at it", () => {
    const warnings = checkFueling([item(6.5, "gel", "one"), item(18.5, "station-water", "two")], berlinStations, 42.285);

    expect(warnings.map((warning) => warning.itemId)).toEqual(["one", "two"]);
  });
});

describe("where a new item goes", () => {
  it("is five kilometres past the last one, while there is room for it", () => {
    expect(somewhereFree([], 42.285)).toBe(5);
    expect(somewhereFree([item(5, "gel"), item(12, "gel")], 42.285)).toBe(17);
  });

  it("is never on top of an item that is already there", () => {
    // Once anything sits at the finish, "five past the last one" is the finish for ever after, and
    // a stack of rows at exactly 42.285 is a plan the runner can't take apart again.
    const atTheEnd = [item(42.285, "gel")];

    const next = somewhereFree(atTheEnd, 42.285);

    expect(next).toBeLessThan(42.285);
    expect(next).toBeGreaterThan(0);
    expect(somewhereFree([...atTheEnd, { id: "x", km: next, kind: "gel" }], 42.285)).not.toBe(next);
  });
});

describe("a fueling plan that has been through browser storage", () => {
  it("keeps every item that still makes sense and drops the rest", () => {
    const kept = sanitizeFueling(
      [
        { id: "a", km: 15, kind: "gel" },
        { id: "b", km: -3, kind: "chew" }, // before the start: pulled back onto the course
        { id: "c", km: 999, kind: "gel" }, // past the finish
        { id: "d", km: 20, kind: "espresso" }, // a kind the app has never heard of
        { km: 25, kind: "own-drink" }, // no id at all
        "not an item",
        null,
      ],
      42.285,
    );

    expect(kept.map((fuel) => [fuel.km, fuel.kind])).toEqual([
      [15, "gel"],
      [0, "chew"],
      [42.285, "gel"],
      [25, "own-drink"],
    ]);
    expect(new Set(kept.map((fuel) => fuel.id)).size).toBe(4);
    expect(sanitizeFueling(undefined, 42.285)).toEqual([]);
  });

  it("never lets two items share an id, whatever storage held", () => {
    const kept = sanitizeFueling(
      [
        { id: "same", km: 5, kind: "gel" },
        { id: "same", km: 25, kind: "gel" },
      ],
      42.285,
    );

    expect(new Set(kept.map((fuel) => fuel.id)).size).toBe(2);
  });
});

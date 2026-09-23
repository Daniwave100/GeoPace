// Seam: the organizer's refreshment points, and what they make of a runner's fueling plan (#12).
//
// The one thing this feature is for is a sentence nobody can work out from either half alone: you
// have a gel at 15 km and the next water is at 17.5 km. So most of what is tested here is that
// sentence — when it appears, when it doesn't, and what it offers instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import type { AidStationFact, CourseBundle } from "../src/bundle/types";
import { rowsHeightAtSizeOne } from "../src/strip/strip";
import { SERVE_GLYPH } from "../src/core/serve-glyphs";
import { hillsLayer } from "../src/core/hills-layer";
import { aidLayer, furthestWithoutWater } from "../src/core/aid-layer";
import { type AidStation, aidStations, markedIn, nextServing, servesInWords, stationName } from "../src/core/aid";
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
  return { km, kmMarked: km, label: `${km} km`, markedIn: "km", serves: serves as AidStation["serves"], carriedOver: false, source: "https://example.org/course", ...extra };
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

  it("are New York's twenty, every mile from 3 to 25 but for three of them", () => {
    // NYRR's own page: water and Gatorade every mile from 3 to 25 except 5, 7 and 9; Maurten gels
    // at 12 and 18; bananas at 21. It sits behind a waiting room our tools don't pass, so the
    // owner opened it and read it out (PLAN.md §10, D61).
    const stations = aidStations(nyc.editions[0]);

    expect(stations.map((s) => s.label)).toEqual([3, 4, 6, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map((mile) => `Mile ${mile}`));
    expect(stations.every((s) => s.serves.includes("water") && s.serves.includes("sports-drink"))).toBe(true);
    expect(stations.filter((s) => s.serves.includes("gel")).map((s) => s.label)).toEqual(["Mile 12", "Mile 18"]);
    expect(stations.filter((s) => s.serves.includes("fruit")).map((s) => s.label)).toEqual(["Mile 21"]);
    // NYRR takes no personal refreshments and this page names no refill points, so neither is here.
    expect(stations.some((s) => s.serves.includes("own-bottle") || s.serves.includes("refill"))).toBe(false);
    // The page says medical volunteers and supplies are at *all* aid stations, so every one has it.
    expect(stations.every((s) => s.serves.includes("medical"))).toBe(true);
    // And every one of them is last year's list, which the app flags to the runner.
    expect(stations.every((s) => s.carriedOver)).toBe(true);
  });

  it("flags every New York station as last year's, in the sentence and in the words a reader hears", () => {
    // The owner read NYRR's page on 2026-09-21 and it was still the 2025 edition's list (D61).
    const clause = layerFor(nyc)!.clause(19.5, "km")!;

    expect(clause.carriedOver).toBe(true);
    expect(clause.note).toContain("This is 2025's list.");
    expect(clause.carriedOverSaid).toBe(" (from an earlier edition's list of refreshment points)");
  });

  it("put a mile marker where that mile lands on our own longer line", () => {
    // Mile 12 is 19.312 km of certified course; our New York line is 42.688 against 42.195.
    const mile12 = aidStations(nyc.editions[0]).find((s) => s.label === "Mile 12")!;

    expect(mile12.kmMarked).toBeCloseTo(19.312, 3);
    expect(mile12.km).toBeCloseTo(19.537, 2);
  });

  it("gives a course with no published list no Aid layer at all", () => {
    // Only layers that exist get a switch (PLAN.md D47) — never an invented list.
    const unlisted = JSON.parse(JSON.stringify(nyc)) as CourseBundle;
    delete unlisted.editions[0].aid_stations;

    expect(aidStations(unlisted.editions[0])).toEqual([]);
    expect(aidLayer(unlisted, createPlanner(plannerCourse(unlisted), planFor(unlisted)))).toBeNull();
  });

  it("warns a New York runner counting on a bottle of their own, and never a Berlin one at the right station", () => {
    // The two lists really do differ, and the check is reading them rather than a rule of thumb.
    const inNewYork = checkFueling([item(19.54, "own-drink", "mine")], aidStations(nyc.editions[0]), 42.688);

    expect(inNewYork).toHaveLength(1);
    expect(inNewYork[0].text("km")).toMatch(/has no bottle of yours waiting/);
    expect(checkFueling([item(20.04, "own-drink")], aidStations(berlin.editions[0]), 42.285)).toEqual([]);
  });

  it("read as a sentence, drinks first", () => {
    expect(servesInWords(station(9, ["water", "fruit", "tea", "sports-drink", "refill", "own-bottle"]))).toBe("water, a sports drink, tea and fruit");
    expect(servesInWords(station(5, ["water", "refill"]))).toBe("water");
    expect(servesInWords(station(27.5, ["water", "gel", "refill"]))).toBe("water and a gel");
  });
});

describe("the Aid layer", () => {
  it("wins the room for its chip from any hill's label: the chip is all a station has on the map", () => {
    // With Hills on, the two share one declutter pass (scene/map-labels.ts); a hill still has its
    // band on the line when its label waits, a station would have nothing.
    for (const bundle of [berlin, nyc]) {
      const chips = layerFor(bundle)!.lineLabels();
      const hills = hillsLayer(bundle).lineLabels();
      expect(chips.length).toBeGreaterThan(0);
      expect(Math.min(...chips.map((chip) => chip.priority))).toBeGreaterThan(Math.max(...hills.map((hill) => hill.priority)));
    }
  });

  it("asks for its label to be drawn as a chip: a station is a place the organizer names, not a value measured of the course", () => {
    // The owner, 09-22: "I prefer white." The look is the chip's, not the measured encoding's, so
    // a hill's label — which does state a measured value — is untouched (style.css draws both).
    expect(layerFor(berlin)!.lineLabels().every((label) => label.chip)).toBe(true);
    expect(hillsLayer(berlin).lineLabels().every((label) => label.chip)).toBeFalsy();
  });

  it("draws each thing in a colour that reads on the light strip, the dark ground and the black chip alike", () => {
    // The owner asked for colour (09-22); pale colour on paper is what "washed out" looks like.
    // Paper is the light strip and the chip on the map; the dark ground is the strip in dark theme.
    const grounds = { paper: "#f4f4f0", dark: "#262624" };
    for (const [serve, glyph] of Object.entries(SERVE_GLYPH)) {
      for (const [name, ground] of Object.entries(grounds)) expect(contrast(glyph.color, ground), `${serve} on ${name}`).toBeGreaterThanOrEqual(3);
    }
    // And no glyph is the course's blue, in either theme.
    for (const glyph of Object.values(SERVE_GLYPH)) expect(["#1546ff", "#5a7dff"]).not.toContain(glyph.color);

    function contrast(a: string, b: string): number {
      const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
      return (light + 0.05) / (dark + 0.05);
    }
    function luminance(hex: string): number {
      const channel = (at: number) => {
        const c = parseInt(hex.slice(at, at + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    }
  });

  it("adds nothing to what the strip's top edge scales: a row of marks keeps its height", () => {
    expect(rowsHeightAtSizeOne({ layerRows: layerFor(berlin)!.rows() })).toBe(rowsHeightAtSizeOne({ layerRows: [] }));
  });

  it("puts a chip at every station on the course line, and names what each one has", () => {
    const layer = layerFor(berlin)!;

    // The chip is the mark: a station is a point, and painting the line under it would take the
    // band from the hills or the rim from the shade for a few metres (PLAN.md D62).
    expect(layer.lineMarks()).toEqual([]);
    expect(layer.lineLabels()).toHaveLength(15);
    // The label is the station's own name and the marks for what it has; the words are in its note
    // and in the sentence, so the map stays legible with fifteen of them on it (owner, 09-21).
    const gel = layer.lineLabels().find((label) => label.text("km") === "27.5 km")!;
    expect(gel.glyphs?.map((glyph) => glyph.name)).toEqual(["Water", "Gel"]);
  });

  it("is a row of the stations themselves, not a chart of the gaps between them", () => {
    // The owner, 09-21, having looked at the sawtooth this used to be: "the chart for water
    // shouldn't be a bar or a line chart… just have like an indicator with the same images."
    const [row] = layerFor(berlin)!.rows();

    expect(row.bins(400)).toEqual([]);
    expect(row.marks!("km")).toHaveLength(15);
    expect(row.marks!("km")[1].glyphs.map((glyph) => glyph.name)).toEqual(["Water", "Sports drink", "Tea", "Fruit"]);
    expect(row.marks!("km")[1].km).toBeCloseTo(9.019, 2);
    expect(row.marks!("km")[1].label).toBe("9 km: water, a sports drink, tea and fruit");
    // How far the next water is hasn't gone: it is the readout, where a number belongs.
    expect(row.valueAt(9.02, "km").text).toBe("here"); // under the scale line "to the next water"
    expect(row.valueAt(10, "km").text).toMatch(/km|m$/);
  });

  it("says in its header the longest the runner will go without water, counting only water", () => {
    // A gel depot between two water stations — which New York has, at miles 12 and 18 — is not a
    // drink, so it must not shorten the number the header states.
    const withADepot = [station(5, ["water"]), station(12, ["gel"]), station(20, ["water"])];

    expect(furthestWithoutWater(withADepot, 42)).toBe(22); // the finish to the last water, not 8 to the depot
    expect(furthestWithoutWater([station(5, ["water"]), station(20, ["water"])], 42)).toBe(22);
    // Said in "What the marks mean" (the layer's key), now that the row's header holds the key of its marks.
    expect(layerFor(berlin)!.key!("km")).toMatch(/longest run without water is 5\.0 km/);
    expect(layerFor(berlin)!.key!("mi")).toMatch(/longest run without water is 3\.1 mi/);
  });

  it("says there is no more water once the last station is behind you", () => {
    const stations = [station(5, ["water"])];

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

describe("a station's name follows the runner's units (owner, 09-22)", () => {
  // It used to be the organizer's own words whatever the switch said: Berlin's chips read in
  // kilometres and New York's in miles, in both units.
  it("reads the unit the organizer counts in off the organizer's own name", () => {
    expect(markedIn("Mile 12")).toBe("mi");
    expect(markedIn("mile 3")).toBe("mi");
    expect(markedIn("9 km")).toBe("km");
    expect(markedIn("Miles Ave")).toBe("mi"); // and a street called that would be wrong: the organizer names stations by distance
    expect(aidStations(berlin.editions[0]).every((s) => s.markedIn === "km")).toBe(true);
    expect(aidStations(nyc.editions[0]).every((s) => s.markedIn === "mi")).toBe(true);
  });

  it("is the organizer's own name where the runner counts as the organizer does, and the organizer's distance converted otherwise", () => {
    const berlinStations = aidStations(berlin.editions[0]);
    const nycStations = aidStations(nyc.editions[0]);

    expect(stationName(berlinStations[0], "km")).toBe("5 km");
    expect(stationName(berlinStations[0], "mi")).toBe("3.1 mi");
    expect(stationName(berlinStations[4], "mi")).toBe("10.9 mi"); // 17.5 km
    expect(stationName(nycStations[0], "mi")).toBe("Mile 3");
    expect(stationName(nycStations[0], "km")).toBe("4.8 km"); // the organizer's 4.828 km, not the 4.884 on our longer line
  });

  it("moves every station's name at once: on the map, on the strip and in the sentence", () => {
    const layer = layerFor(nyc)!;
    const first = nycStations0();

    expect(layer.lineLabels()[0].text("mi")).toBe("Mile 3");
    expect(layer.lineLabels()[0].text("km")).toBe("4.8 km");
    // The strip's tooltip keeps the organizer's name beside the converted one: the road sign says "Mile 3" whatever the switch says.
    expect(layer.rows()[0].marks!("km")[0].label).toMatch(/^4\.8 km \(Mile 3\): /);
    expect(layer.rows()[0].marks!("mi")[0].label).toMatch(/^Mile 3: /);
    expect(layer.clause(first.km - 0.4, "mi")?.text).toMatch(/, at Mile 3\.$/);
    expect(layer.clause(first.km - 0.4, "km")?.text).toMatch(/, at 4\.8 km\.$/);
    // The row's readout is a bare distance; its scale line says what it is a distance to.
    expect(layer.rows()[0].valueAt(first.km - 0.4, "km").text).toBe("400 m");
    expect(layer.rows()[0].scale("km")).toBe("to the next water");
  });

  it("gives the key of its marks to its row, and only the marks this course uses", () => {
    expect(layerFor(berlin)!.rows()[0].keyGlyphs!.map((glyph) => glyph.name)).toEqual(["Water", "Sports drink", "Tea", "Gel", "Fruit"]);
    expect(layerFor(nyc)!.rows()[0].keyGlyphs!.map((glyph) => glyph.name)).toEqual(["Water", "Sports drink", "Gel", "Fruit", "Medical help"]);
  });
});

function nycStations0(): AidStation {
  return aidStations(nyc.editions[0])[0];
}

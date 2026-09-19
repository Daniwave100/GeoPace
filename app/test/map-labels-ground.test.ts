// Seam: lifting the map's labels onto the ground <-> a ground that changes while the answer is on
// its way. The open terrain can give way to the plain ground at any moment (plain-ground.ts: a top
// tile failed). An answer still on its way from the terrain that has gone is about a ground that
// is no longer drawn: taken, it left Berlin's labels 73 m up in the air over flat ground, and was
// remembered for the rest of the session.
import { Cartesian3, Cartographic, EllipsoidTerrainProvider, type TerrainProvider } from "cesium";
import { describe, expect, it } from "vitest";
import { liftOntoTheGround } from "../src/scene/map-labels";

const label = { lat: 52.5, lon: 13.4, ellipsoidHeightM: 112, text: "Start", look: "place" as const, priority: 1 };
const heightOf = (position: Cartesian3) => Cartographic.fromCartesian(position).height;

/** A terrain lookup whose answer the test lets through when it chooses. */
function heldBack(heightM: number) {
  let answer: (() => void) | undefined;
  const sample = (_provider: TerrainProvider, places: Cartographic[]) =>
    new Promise<Cartographic[]>((resolve) => {
      answer = () => resolve(places.map((place) => new Cartographic(place.longitude, place.latitude, heightM)));
    });
  return { sample, answer: () => answer?.() };
}

describe("lifting the map's labels onto the ground", () => {
  it("puts a label at the height the open terrain gives, and remembers it", async () => {
    const viewer = { terrainProvider: new EllipsoidTerrainProvider() as TerrainProvider };
    const placed = [{ label, position: Cartesian3.fromDegrees(label.lon, label.lat, 0) }];
    const known = new Map<string, number>();
    const terrain = heldBack(73);

    const lifting = liftOntoTheGround(viewer, placed, known, () => true, terrain.sample);
    terrain.answer();
    await lifting;

    expect(heightOf(placed[0].position)).toBeCloseTo(73, 3);
    expect([...known.values()]).toEqual([73]);
  });

  it("drops an answer from a terrain that has since given way: the label stays on the ground that is drawn, and nothing is remembered", async () => {
    const viewer = { terrainProvider: new EllipsoidTerrainProvider() as TerrainProvider };
    const placed = [{ label, position: Cartesian3.fromDegrees(label.lon, label.lat, 0) }];
    const known = new Map<string, number>();
    const terrain = heldBack(73);

    const lifting = liftOntoTheGround(viewer, placed, known, () => true, terrain.sample);
    viewer.terrainProvider = new EllipsoidTerrainProvider(); // a top tile failed: the plain ground took over
    terrain.answer();
    await lifting;

    expect(heightOf(placed[0].position)).toBeCloseTo(0, 3);
    expect(known.size).toBe(0);
  });
});

// Seam: the course in the 3D scene -> draped over the keyless map, at the road's own height in photoreal.
//
// Draped, CesiumJS paints the line onto whatever surface the camera sees above the route. On the
// keyless map that is the ground, and right. In photoreal it is a tree's canopy, a bridge's cables,
// the Queensboro's upper deck: metres above the road, so the line slides as the camera moves
// (issue #22). There the line is drawn in 3D, at the height the pipeline measured, and that height
// comes from the Course Bundle, never from the imagery (PLAN.md D5). The scene is a stand-in with
// the two things drawing touches: the list of what is drawn, and the clock.
import { readFileSync } from "node:fs";
import { Cartographic, type Entity, EntityCollection, HeightReference, JulianDate } from "cesium";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { hillsLayer } from "../src/core/hills-layer";
import { stretchesByMeasured } from "../src/core/measured-stretches";
import { positionAtKm } from "../src/core/scrub";
import { nearestIndex } from "../src/core/series";
import { showLineMarks } from "../src/scene/course-marks";
import { showCourse, showRunner } from "../src/scene/globe";
import { ROAD_LOOK } from "../src/scene/placement";

const bundleFor = (course: string) =>
  parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${course}/course-bundle.json`, import.meta.url), "utf8")), course);
const nyc = bundleFor("nyc");
const line = nyc.measured.course_line;
const NOW = JulianDate.now();

const scene = () => ({ entities: new EntityCollection(), clock: { currentTime: new JulianDate() } });
const lines = (map: { entities: EntityCollection }) => map.entities.values.filter((entity) => entity.polyline);
const points = (map: { entities: EntityCollection }) => map.entities.values.filter((entity) => entity.point);
const isDraped = (entity: Entity) => entity.polyline?.clampToGround?.getValue(NOW) === true;
/** Every corner of a drawn line, as [km along the course, height above the ellipsoid]. */
function heightsAlong(entity: Entity): [number, number][] {
  const corners: Cartographic[] = entity.polyline!.positions!.getValue(NOW).map((corner: never) => Cartographic.fromCartesian(corner));
  return corners.map((corner) => {
    const degrees = { lat: (corner.latitude * 180) / Math.PI, lon: (corner.longitude * 180) / Math.PI };
    let nearest = 0;
    line.lat.forEach((lat, i) => {
      if (Math.hypot(lat - degrees.lat, line.lon[i] - degrees.lon) < Math.hypot(line.lat[nearest] - degrees.lat, line.lon[nearest] - degrees.lon)) nearest = i;
    });
    return [nearest, corner.height];
  });
}

describe("the course line on the keyless map", () => {
  it("is draped on the ground: nothing stands over the road there, and the open terrain is too coarse for surveyed heights", () => {
    const map = scene();

    showCourse(map, nyc, "draped");

    expect(lines(map).length).toBeGreaterThan(0);
    expect(lines(map).every(isDraped)).toBe(true);
    expect(points(map).every((dot) => dot.point?.heightReference?.getValue(NOW) === HeightReference.CLAMP_TO_GROUND)).toBe(true);
  });
});

describe("the course line in photoreal", () => {
  it("is drawn at the road's own height, a little above it, and is not clamped to whatever stands over the road", () => {
    const map = scene();

    showCourse(map, nyc, "road-height");

    expect(lines(map).some(isDraped)).toBe(false);
    const drawn = lines(map).flatMap(heightsAlong);
    expect(drawn.length).toBeGreaterThanOrEqual(line.km.length);
    for (const [sample, height] of drawn) {
      const aboveTheRoad = height - line.ellipsoid_height_m[sample];
      expect(aboveTheRoad, `km ${line.km[sample]}`).toBeGreaterThanOrEqual(ROAD_LOOK.liftM - 0.01);
      expect(aboveTheRoad, `km ${line.km[sample]}`).toBeLessThan(ROAD_LOOK.liftM + 0.5);
    }
    // The lift is what keeps the line out of the road where Google's surface and the survey
    // disagree. A few metres at most: more and the line floats where a runner can see under it.
    expect(ROAD_LOOK.liftM).toBeGreaterThan(0);
    expect(ROAD_LOOK.liftM).toBeLessThanOrEqual(5);
  });

  it("is on the Queensboro's lower deck, in the scene's own heights: 44 m above sea level is 12 m above the ellipsoid there", () => {
    const map = scene();

    showCourse(map, nyc, "road-height");

    const onTheBridge = nearestIndex(line.km, 25.1);
    const there = lines(map).flatMap(heightsAlong).filter(([sample]) => sample === onTheBridge);
    expect(there.length).toBeGreaterThan(0);
    // Sea level is 32.5 m *below* the ellipsoid in New York. Drawn at the height above sea level
    // the line would float 32 m over the bridge; with the sign flipped, 65 m.
    for (const [, height] of there) expect(height - ROAD_LOOK.liftM).toBeCloseTo(44.4 - 32.54, 0);
  });

  it("puts the start and the finish at the road's height too", () => {
    const map = scene();

    showCourse(map, nyc, "road-height");

    const dots = points(map);
    expect(dots).toHaveLength(2);
    expect(dots.every((dot) => dot.point?.heightReference?.getValue(NOW) === HeightReference.NONE)).toBe(true);
    const finish = Cartographic.fromCartesian(dots[1].position!.getValue(NOW)!);
    const aboveTheRoad = finish.height - line.ellipsoid_height_m[line.km.length - 1];
    expect(aboveTheRoad).toBeGreaterThanOrEqual(ROAD_LOOK.liftM - 0.01);
    expect(aboveTheRoad).toBeLessThan(ROAD_LOOK.liftM + 0.5);
  });

  it("stays on the map, fainter, where a tree or the deck above stands in front of it; and shows through where its height is not measured", () => {
    const map = scene();

    showCourse(map, nyc, "road-height");

    // The middle of the Verrazzano's main span is a straight line between measured heights, a few
    // metres under the real deck (PLAN.md D45). Hiding the line there would be hiding our own gap.
    const strength = (entity: Entity) => entity.polyline?.depthFailMaterial?.getValue(NOW)?.color?.alpha as number | undefined;
    const onTheVerrazzano = nearestIndex(line.km, 1.0);
    const stretches = lines(map).map((entity) => ({ samples: heightsAlong(entity).map(([sample]) => sample), behind: strength(entity) }));
    const filledIn = stretches.filter((stretch) => stretch.samples.includes(onTheVerrazzano));
    const measured = stretches.filter((stretch) => stretch.samples.includes(nearestIndex(line.km, 30)));
    expect(filledIn.map((stretch) => stretch.behind)).toEqual([1]);
    expect(measured.map((stretch) => stretch.behind)).toEqual([ROAD_LOOK.faintAlpha]);
    expect(ROAD_LOOK.faintAlpha).toBeGreaterThan(0.2);
    expect(ROAD_LOOK.faintAlpha).toBeLessThan(0.7);
    // Every filled-in stretch of New York's course gets that treatment, and nothing else does.
    expect(stretches.filter((stretch) => stretch.behind === 1)).toHaveLength(nyc.measured.elevation_not_measured.length);
  });

  it("leaves one course on the map, not two, when the placement changes", () => {
    const map = scene();

    showCourse(map, nyc, "draped");
    const draped = map.entities.values.length;
    showCourse(map, nyc, "road-height");
    showCourse(map, nyc, "draped");

    expect(map.entities.values.length).toBe(draped);
    expect(lines(map).every(isDraped)).toBe(true);
  });
});

describe("the course line cut where its height stops being measured", () => {
  it("covers the whole course with no holes: each stretch starts on the sample the last one ended on", () => {
    const stretches = stretchesByMeasured(line.km, nyc.measured.elevation_not_measured);

    expect(stretches[0].first).toBe(0);
    expect(stretches[stretches.length - 1].last).toBe(line.km.length - 1);
    stretches.slice(1).forEach((stretch, i) => expect(stretch.first).toBe(stretches[i].last));
    expect(stretches.filter((stretch) => !stretch.measured).map((stretch) => [line.km[stretch.first], line.km[stretch.last]])).toEqual(
      nyc.measured.elevation_not_measured.map((gap) => [expect.closeTo(gap.km_start, 2), expect.closeTo(gap.km_end, 2)]),
    );
  });

  it("is one stretch where everything is measured", () => {
    const berlin = bundleFor("berlin").measured;
    expect(stretchesByMeasured(berlin.course_line.km, berlin.elevation_not_measured)).toEqual([{ first: 0, last: berlin.course_line.km.length - 1, measured: true }]);
  });
});

describe("a layer's marks on the course line", () => {
  const marks = hillsLayer(nyc).lineMarks();

  it("are draped with the line on the keyless map", () => {
    const map = scene();

    showLineMarks(map, nyc, marks, "draped");

    expect(lines(map).length).toBeGreaterThanOrEqual(marks.length);
    expect(lines(map).every(isDraped)).toBe(true);
  });

  it("are at the road's height in photoreal, just under the blue line, so the blue stays on top from above", () => {
    const map = scene();

    showLineMarks(map, nyc, marks, "road-height");

    expect(lines(map).some(isDraped)).toBe(false);
    for (const [sample, height] of lines(map).flatMap(heightsAlong)) {
      const aboveTheRoad = height - line.ellipsoid_height_m[sample];
      expect(aboveTheRoad).toBeGreaterThanOrEqual(ROAD_LOOK.liftM - 0.01);
      expect(aboveTheRoad).toBeLessThan(ROAD_LOOK.liftM + 0.5);
    }
    const course = scene();
    showCourse(course, nyc, "road-height");
    const lowestBlue = Math.min(...lines(course).flatMap(heightsAlong).map(([sample, height]) => height - line.ellipsoid_height_m[sample]));
    const highestMark = Math.max(...lines(map).flatMap(heightsAlong).map(([sample, height]) => height - line.ellipsoid_height_m[sample]));
    expect(highestMark).toBeLessThan(lowestBlue);
  });
});

describe("the runner", () => {
  const onTheVerrazzano = positionAtKm(line, 1.0);
  const instant = new Date("2026-11-01T14:10:00Z");

  it("rests on the ground of the keyless map", () => {
    const map = scene();

    showRunner(map, onTheVerrazzano, instant, "draped");

    expect(points(map)[0].point?.heightReference?.getValue(NOW)).toBe(HeightReference.CLAMP_TO_GROUND);
  });

  it("stands at the road's height in photoreal, and moves there when the placement changes", () => {
    const map = scene();
    showRunner(map, onTheVerrazzano, instant, "draped");

    showRunner(map, onTheVerrazzano, instant, "road-height");

    expect(points(map)).toHaveLength(1);
    expect(points(map)[0].point?.heightReference?.getValue(NOW)).toBe(HeightReference.NONE);
    const aboveTheRoad = Cartographic.fromCartesian(points(map)[0].position!.getValue(NOW)!).height - onTheVerrazzano.roadHeightM;
    expect(aboveTheRoad).toBeGreaterThanOrEqual(ROAD_LOOK.liftM - 0.01);
    expect(aboveTheRoad).toBeLessThan(ROAD_LOOK.liftM + 0.5);
    // Scrubbing still sets the scene's clock, whichever way the runner is drawn.
    expect(JulianDate.toDate(map.clock.currentTime).toISOString()).toBe(instant.toISOString());
  });
});

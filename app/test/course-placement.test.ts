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
import { markLook } from "../src/core/mark-look";
import { courseStretches } from "../src/core/course-stretches";
import { positionAtKm } from "../src/core/scrub";
import { nearestIndex } from "../src/core/series";
import { showCourseLine } from "../src/scene/course-line";
import { COURSE_BLUE } from "../src/scene/course-ribbon";
import { showRunner } from "../src/scene/globe";
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

    showCourseLine(map, nyc, [], "draped");

    expect(lines(map).length).toBeGreaterThan(0);
    expect(lines(map).every(isDraped)).toBe(true);
    expect(points(map).every((dot) => dot.point?.heightReference?.getValue(NOW) === HeightReference.CLAMP_TO_GROUND)).toBe(true);
  });
});

describe("the course line in photoreal", () => {
  it("is drawn at the road's own height, a little above it, and is not clamped to whatever stands over the road", () => {
    const map = scene();

    showCourseLine(map, nyc, [], "road-height");

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

    showCourseLine(map, nyc, [], "road-height");

    const onTheBridge = nearestIndex(line.km, 25.1);
    const there = lines(map).flatMap(heightsAlong).filter(([sample]) => sample === onTheBridge);
    expect(there.length).toBeGreaterThan(0);
    // Sea level is 32.5 m *below* the ellipsoid in New York. Drawn at the height above sea level
    // the line would float 32 m over the bridge; with the sign flipped, 65 m.
    for (const [, height] of there) expect(height - ROAD_LOOK.liftM).toBeCloseTo(44.4 - 32.54, 0);
  });

  it("puts the start and the finish at the road's height too", () => {
    const map = scene();

    showCourseLine(map, nyc, [], "road-height");

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

    showCourseLine(map, nyc, [], "road-height");

    // The middle of the Verrazzano's main span is a straight line between measured heights, a few
    // metres under the real deck (PLAN.md D45). Hiding the line there would be hiding our own gap.
    const strength = (entity: Entity) => entity.polyline?.depthFailMaterial?.getValue(NOW)?.strength as number | undefined;
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

    showCourseLine(map, nyc, [], "draped");
    const draped = map.entities.values.length;
    showCourseLine(map, nyc, [], "road-height");
    showCourseLine(map, nyc, [], "draped");

    expect(map.entities.values.length).toBe(draped);
    expect(lines(map).every(isDraped)).toBe(true);
  });
});

describe("the course cut into stretches, each drawn as one line", () => {
  const marks = hillsLayer(nyc).lineMarks();
  const stretches = courseStretches(line.km, marks, nyc.measured.elevation_not_measured);

  it("covers the whole course with no holes and no overlaps: each stretch starts on the sample the last one ended on", () => {
    expect(stretches[0].first).toBe(0);
    expect(stretches[stretches.length - 1].last).toBe(line.km.length - 1);
    stretches.slice(1).forEach((stretch, i) => expect(stretch.first).toBe(stretches[i].last));
  });

  it("gives every mark its stretch, and leaves the plain course between them", () => {
    const marked = stretches.filter((stretch) => stretch.mark !== null);
    expect(marked.map((stretch) => stretch.mark)).toEqual(marks.filter((mark) => nearestIndex(line.km, mark.toKm) > nearestIndex(line.km, mark.fromKm)));
    for (const stretch of marked) {
      expect(line.km[stretch.first]).toBeCloseTo(stretch.mark!.fromKm, 2);
      expect(line.km[stretch.last]).toBeCloseTo(stretch.mark!.toKm, 2);
    }
    expect(stretches.some((stretch) => stretch.mark === null)).toBe(true);
  });

  it("says where the height is not measured, whether or not a layer has marked it", () => {
    const gaps = nyc.measured.elevation_not_measured;
    const filledIn = (from: typeof stretches) => from.filter((stretch) => !stretch.measured).map((stretch) => [line.km[stretch.first], line.km[stretch.last]]);
    const expected = gaps.map((gap) => [expect.closeTo(gap.km_start, 2), expect.closeTo(gap.km_end, 2)]);
    expect(filledIn(stretches)).toEqual(expected);
    expect(filledIn(courseStretches(line.km, [], gaps))).toEqual(expected); // no layer on: the plain line still knows
  });

  it("is one stretch where nothing is marked and everything is measured", () => {
    const berlin = bundleFor("berlin").measured;
    expect(courseStretches(berlin.course_line.km, [], berlin.elevation_not_measured)).toEqual([{ first: 0, last: berlin.course_line.km.length - 1, mark: null, measured: true }]);
  });
});

describe("a layer's marks on the course line", () => {
  const marks = hillsLayer(nyc).lineMarks();
  const uniforms = (entity: Entity) => entity.polyline!.material!.getValue(NOW) as { coreColor: { toCssHexString(): string }; bandColor: { toCssHexString(): string }; dashColor: { alpha: number } };

  it("are draped with the line on the keyless map, and at the road's height with it in photoreal", () => {
    const [keyless, photoreal] = [scene(), scene()];

    showCourseLine(keyless, nyc, marks, "draped");
    showCourseLine(photoreal, nyc, marks, "road-height");

    expect(lines(keyless).every(isDraped)).toBe(true);
    expect(lines(photoreal).some(isDraped)).toBe(false);
    expect(lines(photoreal)).toHaveLength(lines(keyless).length);
    for (const [sample, height] of lines(photoreal).flatMap(heightsAlong)) expect(height - line.ellipsoid_height_m[sample]).toBeCloseTo(ROAD_LOOK.liftM, 1);
  });

  it("are painted beside the blue by the same line that paints the blue: nothing lies over the course, so nothing can be painted over it", () => {
    // Drawn as a wide mark with the blue line on top, the mark came out over the blue wherever the
    // line shows through what is in front of it: on the Verrazzano's unmeasured span the course vanished.
    const map = scene();

    showCourseLine(map, nyc, marks, "road-height");

    const samples = lines(map).map((entity) => heightsAlong(entity).map(([sample]) => sample));
    const steps = samples.flatMap((along) => along.slice(1).map((sample, i) => `${along[i]}-${sample}`));
    expect(new Set(steps).size).toBe(steps.length); // no step of the course is drawn twice
    expect(steps.length).toBe(line.km.length - 1); // and none is left out
    for (const entity of lines(map)) expect(uniforms(entity).coreColor.toCssHexString()).toBe(COURSE_BLUE);
  });

  it("look like what they claim: a hill in its colour, a filled-in stretch as grey dashes on a paper band", () => {
    const map = scene();

    showCourseLine(map, nyc, marks, "road-height");

    const at = (km: number) => lines(map).find((entity) => heightsAlong(entity).some(([sample]) => sample === nearestIndex(line.km, km)))!;
    expect(uniforms(at(1.0))).toMatchObject({ dashColor: { alpha: 1 } }); // the Verrazzano's unscanned main span
    expect(uniforms(at(1.0)).bandColor.toCssHexString()).toBe("#f4f4f0");
    expect(uniforms(at(24.6)).dashColor.alpha).toBe(0); // halfway up the Queensboro: a measured climb
    expect(uniforms(at(24.6)).bandColor.toCssHexString()).toBe(markLook("measured", marks.find((mark) => mark.fromKm <= 24.6 && mark.toKm >= 24.6)!.howMuch).color);
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

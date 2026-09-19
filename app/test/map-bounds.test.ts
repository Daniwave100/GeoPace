// Seam: the course that is showing -> how far the map may be taken from it (issue #25).
//
// What must hold: with either course showing, every way of moving the map leaves it looking within
// the vicinity of that course; the map's own views — the whole course, where the runner is,
// straight down — are never fought by the wall, whatever shape the map is; switching course moves
// the wall with it; and the Ride's own camera, and the runner's in free look, look at the runner,
// who is on the course, so the wall has nothing to move.
//
// The bounds themselves are arithmetic (src/core/map-bounds.ts) and are tested as such against
// both real courses. Putting them on the camera is CesiumJS's own arithmetic to carry out, so
// those tests drive the real CesiumJS camera, not a stand-in.
import { readFileSync } from "node:fs";
import { BoundingSphere, Camera, Cartesian3, Cartesian4, Event, Ellipsoid, GeographicProjection, HeadingPitchRange, Math as CesiumMath, Matrix4, SceneMode, Transforms } from "cesium";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import type { CourseBundle, CourseLine } from "../src/bundle/types";
import { CAMERA_TILT_RAD, type MapView, rangeToFitM, sidewaysShiftM } from "../src/core/framing";
import { type CameraOnTheMap, farthestOutM, isInTheVicinity, ROUND_THE_COURSE_M, type Vicinity, vicinityOf, whatTheMapLooksAt, whereTheCameraMayStand, zoomStepM } from "../src/core/map-bounds";
import { RIDE_CAMERAS } from "../src/core/ride";
import { rideView, type RideScene, runnerInTheScene } from "../src/core/ride-view";
import { stopsFor } from "../src/core/stops";
import { keepTheMapInTheVicinity } from "../src/scene/map-bounds";
import { middleOfTheMap } from "../src/scene/map-middle";
import { FREE_LOOK } from "../src/scene/ride-camera";

function bundleOf(id: string): CourseBundle {
  return parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${id}/course-bundle.json`, import.meta.url), "utf8")), id);
}
const nyc = bundleOf("nyc");
const berlin = bundleOf("berlin");
const nycVicinity = vicinityOf(nyc.measured.course_line);
const berlinVicinity = vicinityOf(berlin.measured.course_line);
const COURSES = [
  { bundle: nyc, vicinity: nycVicinity },
  { bundle: berlin, vicinity: berlinVicinity },
];

/** Real places, so that what the map must not reach is somewhere anyone can check. */
const PLACES = {
  timesSquare: { lat: 40.758, lon: -73.985 },
  brandenburgGate: { lat: 52.5163, lon: 13.3777 },
  philadelphia: { lat: 39.9526, lon: -75.1652 },
  hamburg: { lat: 53.5511, lon: 9.9937 },
  madrid: { lat: 40.4168, lon: -3.7038 },
};

const M_PER_DEG_LAT = 111_320;
const apartM = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * M_PER_DEG_LAT, (a.lon - b.lon) * M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180));

/** A camera looking down as the map's own views look down, from `heightM` up. */
const looking = (place: { lat: number; lon: number }, heightM: number, headingDeg = 0, pitchDeg = -60): CameraOnTheMap => ({ ...place, heightM, headingDeg, pitchDeg });

/** The map at the shapes it takes: wide open, with the strip open, with the strip dragged large, on the full screen, and on a phone. */
const SHAPES: { name: string; view: MapView }[] = [
  { name: "a laptop with no strip", view: { fovRad: CesiumMath.toRadians(60), viewWidthPx: 1440, viewHeightPx: 760, coveredLeftPx: 320 } },
  { name: "a laptop with the strip open", view: { fovRad: CesiumMath.toRadians(60), viewWidthPx: 1440, viewHeightPx: 300, coveredLeftPx: 320 } },
  { name: "the strip dragged large", view: { fovRad: CesiumMath.toRadians(60), viewWidthPx: 1440, viewHeightPx: 220, coveredLeftPx: 320 } },
  // Full map: the readout block steps aside with the strip, so nothing covers the map's left (main.ts).
  { name: "Full map", view: { fovRad: CesiumMath.toRadians(60), viewWidthPx: 1440, viewHeightPx: 900, coveredLeftPx: 0 } },
  { name: "a phone", view: { fovRad: CesiumMath.toRadians(60), viewWidthPx: 420, viewHeightPx: 900, coveredLeftPx: 0 } },
];

describe("the vicinity of a course", () => {
  it("holds the whole course, with about a city's width round it", () => {
    for (const { bundle, vicinity } of COURSES) {
      const line = bundle.measured.course_line;
      for (let i = 0; i < line.km.length; i += 25) {
        expect(isInTheVicinity(vicinity, { lat: line.lat[i], lon: line.lon[i] })).toBe(true);
      }
      // The course's own box, grown by the same amount every way round.
      const north = Math.max(...line.lat);
      expect((vicinity.north - north) * M_PER_DEG_LAT).toBeCloseTo(ROUND_THE_COURSE_M, -1);
      expect(apartM({ lat: north, lon: vicinity.east }, { lat: north, lon: Math.max(...line.lon) })).toBeGreaterThan(ROUND_THE_COURSE_M);
    }
  });

  it("keeps the city the course is in, and not the next city along", () => {
    expect(isInTheVicinity(nycVicinity, PLACES.timesSquare)).toBe(true);
    expect(isInTheVicinity(berlinVicinity, PLACES.brandenburgGate)).toBe(true);
    expect(isInTheVicinity(nycVicinity, PLACES.philadelphia)).toBe(false);
    expect(isInTheVicinity(berlinVicinity, PLACES.hamburg)).toBe(false);
  });

  it("moves with the course: one city's vicinity is nowhere near the other's", () => {
    expect(isInTheVicinity(nycVicinity, PLACES.brandenburgGate)).toBe(false);
    expect(isInTheVicinity(berlinVicinity, PLACES.timesSquare)).toBe(false);
  });
});

describe("what the map is looking at", () => {
  it("is the ground ahead of the camera, as far ahead as its height and the framing's tilt put it", () => {
    // 43 km up, tilted 60°, facing north: the middle of the view is 43 / tan(60°) = 24.8 km north.
    const looksAt = whatTheMapLooksAt(looking(PLACES.timesSquare, 43_000));
    expect(looksAt.lon).toBeCloseTo(PLACES.timesSquare.lon, 9);
    expect((looksAt.lat - PLACES.timesSquare.lat) * M_PER_DEG_LAT).toBeCloseTo(24_827, -1);
    expect(whatTheMapLooksAt(looking(PLACES.timesSquare, 43_000, 180)).lat).toBeLessThan(PLACES.timesSquare.lat);
  });

  it("is the camera's own place looking straight down, and the street at street level", () => {
    expect(whatTheMapLooksAt(looking(PLACES.timesSquare, 5000, 0, -90))).toEqual(PLACES.timesSquare);
    expect(apartM(whatTheMapLooksAt(looking(PLACES.timesSquare, 20)), PLACES.timesSquare)).toBeLessThan(15);
  });

  it("is never further off than the framing's own tilt, so tilting towards the horizon moves nothing", () => {
    const tilted = whatTheMapLooksAt(looking(PLACES.timesSquare, 2000, 0, -2));
    // Where the ground really is in the middle of that view is 57 km ahead; the map counts as
    // looking 1.2 km ahead, so a tilt on its own can never take it out of the vicinity.
    expect(apartM(tilted, PLACES.timesSquare)).toBeCloseTo(1155, -1);
    expect(whatTheMapLooksAt(looking(PLACES.timesSquare, 2000, 0, 20))).toEqual(tilted); // looking up, the same
  });
});

describe("where the camera may stand", () => {
  it("leaves a camera looking at the course exactly where it is", () => {
    const over = looking(PLACES.timesSquare, 2000);
    expect(whereTheCameraMayStand(nycVicinity, over)).toEqual({ lat: over.lat, lon: over.lon });
  });

  it("puts a camera looking at Spain back over New York", () => {
    const asked = looking(PLACES.madrid, 30_000);
    const kept = whereTheCameraMayStand(nycVicinity, asked);
    expect(apartM(kept, PLACES.timesSquare)).toBeLessThan(80_000);
    expect(apartM(kept, PLACES.madrid)).toBeGreaterThan(5_000_000); // and nowhere near Spain
    expect(isInTheVicinity(nycVicinity, whatTheMapLooksAt({ ...asked, ...kept }))).toBe(true);
  });

  it("moves the camera by exactly as far as what it was looking at had gone too far", () => {
    const tooFarEast = looking({ lat: PLACES.timesSquare.lat, lon: -73 }, 6000);
    const kept = whereTheCameraMayStand(nycVicinity, tooFarEast);
    expect(whatTheMapLooksAt({ ...tooFarEast, ...kept }).lon).toBeCloseTo(nycVicinity.east, 9);
    expect(kept.lat).toBe(tooFarEast.lat); // the way round that hadn't gone too far is untouched
  });

  it("lands on the corner of the wall, and never outside it, from as far out as the map goes", () => {
    // Both ways round at once, and from a height where the camera looks 50 km ahead of itself: the
    // camera comes back in latitude as well, where a degree of longitude is a different length.
    const pastTheCorner = looking({ lat: nycVicinity.north + 0.3, lon: nycVicinity.east + 0.3 }, farthestOutM(nycVicinity, SHAPES[0].view), 45);
    const looksAt = whatTheMapLooksAt({ ...pastTheCorner, ...whereTheCameraMayStand(nycVicinity, pastTheCorner) });
    expect(isInTheVicinity(nycVicinity, looksAt)).toBe(true);
    expect(apartM(looksAt, { lat: nycVicinity.north, lon: nycVicinity.east })).toBeLessThan(500);
  });

  it("bounds each way round on its own, so a drag along a wall slides along it", () => {
    const pastTheCorner = looking({ lat: nycVicinity.north + 0.2, lon: nycVicinity.east + 0.2 }, 0);
    expect(whereTheCameraMayStand(nycVicinity, pastTheCorner)).toEqual({ lat: nycVicinity.north, lon: nycVicinity.east });
    const alongTheWall = whereTheCameraMayStand(nycVicinity, looking({ lat: PLACES.timesSquare.lat, lon: nycVicinity.east + 0.2 }, 0));
    expect(alongTheWall.lat).toBe(PLACES.timesSquare.lat);
  });

  it("leaves the whole-course view alone, whatever shape the map is", () => {
    for (const { name, view } of SHAPES) {
      for (const { bundle, vicinity } of COURSES) {
        const camera = wholeCourseView(bundle.measured.course_line, view);
        expect(whereTheCameraMayStand(vicinity, camera), `${bundle.course.name}, ${name}`).toEqual({ lat: camera.lat, lon: camera.lon });
      }
    }
  });

  it("holds the whole-course view even where the camera itself stands far outside the vicinity", () => {
    // With the strip open the camera stands 57 km south of the middle of New York, well outside
    // the city: a wall round the camera would have to let it out there, and then the course could
    // be dragged clean off the map. It is what the map looks at that is held.
    const stripOpen = wholeCourseView(nyc.measured.course_line, SHAPES[1].view);
    expect(isInTheVicinity(nycVicinity, stripOpen)).toBe(false);
    expect(whereTheCameraMayStand(nycVicinity, stripOpen)).toEqual({ lat: stripOpen.lat, lon: stripOpen.lon });
  });
});

describe("how far out the map may be taken", () => {
  it("is never less far than the whole course needs, whatever shape the map is", () => {
    for (const { name, view } of SHAPES) {
      for (const { bundle, vicinity } of COURSES) {
        // Under the whole-course view, a floor would yank the camera in the moment a runner asked for less.
        expect(farthestOutM(vicinity, view), `${bundle.course.name}, ${name}`).toBeGreaterThan(wholeCourseView(bundle.measured.course_line, view).heightM);
      }
    }
  });

  it("is about the height the city fills the map from, and further out when the map is a letterbox", () => {
    const [laptop, stripOpen] = SHAPES;
    expect(farthestOutM(nycVicinity, laptop.view) / 1000).toBeCloseTo(87, 0);
    expect(farthestOutM(berlinVicinity, laptop.view) / 1000).toBeCloseTo(41, 0);
    expect(farthestOutM(nycVicinity, stripOpen.view)).toBeGreaterThan(farthestOutM(nycVicinity, laptop.view));
  });

  it("stops the zoom buttons dead at the floor, and a press with nowhere to go moves nothing", () => {
    expect(zoomStepM(-1, 10_000, 76_000)).toBeCloseTo(7000, 6); // room to spare: the usual step
    expect(zoomStepM(-1, 80_000, 6000)).toBeCloseTo(6000, 6); // the last of the room, and no more
    expect(zoomStepM(-1, 86_000, 0)).toBe(0);
    expect(zoomStepM(-1, 120_000, -34_000)).toBe(0); // left out there by a framing: not pulled in
    expect(zoomStepM(1, 10_000, 76_000)).toBeCloseTo(4000, 6);
    expect(zoomStepM(1, 40, 86_000)).toBe(0); // and never into the ground
  });
});

describe("the Ride's own camera and the runner's in free look", () => {
  it("look at the runner all the way along both courses, so the wall has nothing to move", () => {
    for (const { bundle, vicinity } of COURSES) {
      const line = bundle.measured.course_line;
      const scene: RideScene = { line, stops: stopsFor(bundle), notMeasured: bundle.measured.elevation_not_measured };
      const lengthKm = line.km[line.km.length - 1];
      for (let km = 0; km <= lengthKm; km += 0.5) {
        for (const camera of RIDE_CAMERAS) {
          const { eye, headingDeg, pitchDeg } = rideView(scene, km, camera, { leftOfRunner: 0.14 });
          expect(whereTheCameraMayStand(vicinity, { ...eye, headingDeg, pitchDeg }), `${camera} at km ${km}`).toEqual({ lat: eye.lat, lon: eye.lon });
        }
        // Free look, taken as far from the runner as it may go and as low as it may go, all the way round them.
        const runner = runnerInTheScene(scene, km);
        for (const roundDeg of [0, 90, 180, 270]) {
          const away = freeLookAtItsFurthest(runner, roundDeg);
          expect(whereTheCameraMayStand(vicinity, away), `free look at km ${km}, ${roundDeg}°`).toEqual({ lat: away.lat, lon: away.lon });
        }
      }
    }
  });
});

/** A free-look camera as far from the runner as its own bounds allow and as low, `roundDeg` round them, looking back at them. */
function freeLookAtItsFurthest(runner: { lat: number; lon: number; heightM: number }, roundDeg: number): CameraOnTheMap {
  const upRad = CesiumMath.toRadians(FREE_LOOK.lowestDeg);
  const alongM = FREE_LOOK.farthestM * Math.cos(upRad);
  return {
    lat: runner.lat + (alongM * Math.cos(CesiumMath.toRadians(roundDeg))) / M_PER_DEG_LAT,
    lon: runner.lon + (alongM * Math.sin(CesiumMath.toRadians(roundDeg))) / (M_PER_DEG_LAT * Math.cos((runner.lat * Math.PI) / 180)),
    heightM: runner.heightM + FREE_LOOK.farthestM * Math.sin(upRad),
    headingDeg: (roundDeg + 180) % 360,
    pitchDeg: -FREE_LOOK.lowestDeg,
  };
}

// Putting the bounds on the camera. The camera is CesiumJS's own, in an empty scene, driven
// through the same before-every-frame event the real map raises.
function cesiumViewer(at: CameraOnTheMap) {
  const scene = {
    canvas: { clientWidth: 1440, clientHeight: 760 },
    drawingBufferWidth: 1440,
    drawingBufferHeight: 760,
    mapProjection: new GeographicProjection(),
    // What CesiumJS itself reads off the scene to work in three dimensions: without them a camera
    // flown to a bounding sphere ends up facing somewhere else entirely.
    mode: SceneMode.SCENE3D,
    ellipsoid: Ellipsoid.WGS84,
    screenSpaceCameraController: { minimumZoomDistance: 1, maximumZoomDistance: Number.POSITIVE_INFINITY },
    preRender: new Event(),
  };
  const camera = new Camera(scene as never);
  const put = (place: CameraOnTheMap) =>
    camera.setView({
      destination: Cartesian3.fromDegrees(place.lon, place.lat, place.heightM),
      orientation: { heading: CesiumMath.toRadians(place.headingDeg), pitch: CesiumMath.toRadians(place.pitchDeg), roll: 0 },
    });
  const whereItIs = (): CameraOnTheMap => {
    const eye = camera.positionCartographic;
    return {
      lat: CesiumMath.toDegrees(eye.latitude),
      lon: CesiumMath.toDegrees(eye.longitude),
      heightM: eye.height,
      headingDeg: CesiumMath.toDegrees(camera.heading),
      pitchDeg: CesiumMath.toDegrees(camera.pitch),
    };
  };
  put(at);
  return {
    viewer: { camera, scene },
    camera,
    scene,
    put,
    whereItIs,
    /** What a hand or an arrow key does: the camera moves over the ground, and nothing else. */
    drag(eastM: number, northM: number) {
      const where = whereItIs();
      put({ ...where, lat: where.lat + northM / M_PER_DEG_LAT, lon: where.lon + eastM / (M_PER_DEG_LAT * Math.cos((where.lat * Math.PI) / 180)) });
    },
    frame() {
      scene.preRender.raiseEvent();
    },
  };
}

/** The bounds as the app installs them: whichever course is showing, and the map's own camera unless said otherwise. */
function bounds(viewer: Parameters<typeof keepTheMapInTheVicinity>[0], showing: { vicinity?: Vicinity; theMapsOwn?: boolean; view?: MapView }) {
  const state = { vicinity: showing.vicinity, theMapsOwn: showing.theMapsOwn ?? true, view: showing.view ?? SHAPES[0].view };
  keepTheMapInTheVicinity(viewer, {
    vicinity: () => state.vicinity,
    theMapsOwn: () => state.theMapsOwn,
    mapView: () => state.view,
  });
  return state;
}

describe("the map's camera, held to the vicinity", () => {
  it("puts a camera asked to go to Spain back over New York, facing the same way", () => {
    const { viewer, camera, whereItIs, put, frame } = cesiumViewer(looking(PLACES.timesSquare, 8000, 30));
    bounds(viewer, { vicinity: nycVicinity });

    put(looking(PLACES.madrid, 8000, 30));
    frame();

    expect(apartM(whereItIs(), PLACES.timesSquare)).toBeLessThan(80_000);
    expect(isInTheVicinity(nycVicinity, whatTheMapLooksAt(whereItIs()))).toBe(true);
    expect(camera.positionCartographic.height).toBeCloseTo(8000, 0); // the same height
    expect(CesiumMath.toDegrees(camera.heading)).toBeCloseTo(30, 4); // the same heading
    expect(CesiumMath.toDegrees(camera.pitch)).toBeCloseTo(-60, 4); // the same tilt
  });

  it("stops a drag dead at the wall, and lets it slide along it", () => {
    const { viewer, whereItIs, drag, frame } = cesiumViewer(looking(PLACES.timesSquare, 1000));
    bounds(viewer, { vicinity: nycVicinity });

    for (let i = 0; i < 40; i += 1) {
      drag(5000, 0);
      frame();
    }
    const atTheWall = whereItIs();
    expect(whatTheMapLooksAt(atTheWall).lon).toBeCloseTo(nycVicinity.east, 6);

    drag(5000, 4000); // on east, and north along the wall
    frame();
    expect(whatTheMapLooksAt(whereItIs()).lon).toBeCloseTo(nycVicinity.east, 6);
    expect(whereItIs().lat).toBeGreaterThan(atTheWall.lat + 0.03);
  });

  it("doesn't move a camera that is looking inside the wall at all, to the millimetre", () => {
    const { viewer, camera, frame } = cesiumViewer(looking(PLACES.timesSquare, 3000, 12, -47));
    bounds(viewer, { vicinity: nycVicinity });
    const was = Cartesian3.clone(camera.positionWC, new Cartesian3());

    for (let i = 0; i < 10; i += 1) frame();

    expect(Cartesian3.distance(camera.positionWC, was)).toBeLessThan(0.001);
  });

  it("leaves the camera alone while it is the Ride's, or the runner's in free look", () => {
    const { viewer, whereItIs, put, frame } = cesiumViewer(looking(PLACES.timesSquare, 8000));
    const state = bounds(viewer, { vicinity: nycVicinity, theMapsOwn: false });

    put(looking(PLACES.madrid, 8000));
    frame();
    expect(apartM(whereItIs(), PLACES.madrid)).toBeLessThan(1);

    state.theMapsOwn = true; // the map's own buttons take the camera back, and the wall applies again
    frame();
    expect(apartM(whereItIs(), PLACES.timesSquare)).toBeLessThan(80_000);
  });

  it("does nothing at all while no course is showing", () => {
    const { viewer, scene, whereItIs, put, frame } = cesiumViewer(looking(PLACES.timesSquare, 8000));
    bounds(viewer, { vicinity: undefined });

    put(looking(PLACES.madrid, 8000));
    frame();

    expect(apartM(whereItIs(), PLACES.madrid)).toBeLessThan(1);
    expect(scene.screenSpaceCameraController.maximumZoomDistance).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps the wheel's own floor up to date, and moves it with the course", () => {
    const { viewer, scene, frame } = cesiumViewer(looking(PLACES.timesSquare, 8000));
    const state = bounds(viewer, { vicinity: nycVicinity });

    frame();
    expect(scene.screenSpaceCameraController.maximumZoomDistance).toBeCloseTo(farthestOutM(nycVicinity, SHAPES[0].view), 3);

    state.vicinity = berlinVicinity;
    frame();
    expect(scene.screenSpaceCameraController.maximumZoomDistance).toBeCloseTo(farthestOutM(berlinVicinity, SHAPES[0].view), 3);
  });

  it("never fights the map's own views: the whole course, straight down, where the runner is", () => {
    for (const { name, view } of SHAPES) {
      for (const { bundle, vicinity } of COURSES) {
        const line = bundle.measured.course_line;
        const where = `${bundle.course.name}, ${name}`;
        const { viewer, camera, frame } = cesiumViewer(looking({ lat: line.lat[0], lon: line.lon[0] }, 3, 0, -3));
        bounds(viewer, { vicinity, view });

        // The whole course, framed exactly as scene/globe.ts frames it.
        frameCourseLikeTheApp(camera, line, view);
        const framed = Cartesian3.clone(camera.positionWC, new Cartesian3());
        frame();
        expect(Cartesian3.distance(camera.positionWC, framed), where).toBeLessThan(0.001);

        // Straight down from there, exactly as scene/globe.ts tips it over: the middle of the map
        // stays in the middle, at the same distance.
        const middle = middleOfTheMap(camera, viewer.scene.canvas, 0);
        if (!middle) throw new Error("the middle of the map should be on the ground below");
        camera.flyToBoundingSphere(new BoundingSphere(middle, 1), {
          offset: new HeadingPitchRange(0, -CesiumMath.PI_OVER_TWO, Math.max(Cartesian3.distance(camera.positionWC, middle), 300)),
          duration: 0,
        });
        const straightDown = Cartesian3.clone(camera.positionWC, new Cartesian3());
        frame();
        expect(Cartesian3.distance(camera.positionWC, straightDown), `${where}, straight down`).toBeLessThan(0.001);

        // Where I am, from as far out as the map may be taken: the furthest the camera ever stands from the runner.
        const lengthKm = line.km[line.km.length - 1];
        for (const km of [0, lengthKm / 2, lengthKm]) {
          const i = line.km.findIndex((atKm) => atKm >= km);
          const heightM = farthestOutM(vicinity, view);
          camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(line.lon[i], line.lat[i]), 1), {
            offset: new HeadingPitchRange(camera.heading, -CAMERA_TILT_RAD, heightM / Math.sin(CAMERA_TILT_RAD)),
            duration: 0,
          });
          const whereIAm = Cartesian3.clone(camera.positionWC, new Cartesian3());
          frame();
          expect(Cartesian3.distance(camera.positionWC, whereIAm), `${where}, where I am at km ${km}`).toBeLessThan(0.001);
        }
      }
    }
  });
});

/** The whole-course framing of scene/globe.ts, so that what the wall is asked about is what the app really does. */
function frameCourseLikeTheApp(camera: Camera, line: CourseLine, view: MapView): void {
  const sphere = BoundingSphere.fromPoints(line.lat.map((lat, i) => Cartesian3.fromDegrees(line.lon[i], lat)));
  const rangeM = rangeToFitM({ ...view, radiusM: sphere.radius, tiltRad: CAMERA_TILT_RAD });
  camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.add(sphere.center, westOf(sphere.center, sidewaysShiftM({ ...view, rangeM })), new Cartesian3()), sphere.radius), {
    offset: new HeadingPitchRange(0, -CAMERA_TILT_RAD, rangeM),
    duration: 0,
  });
}

/** Where the camera stands to show the whole course in a map of that shape: the framing above, carried out by CesiumJS and read back. */
function wholeCourseView(line: CourseLine, view: MapView): CameraOnTheMap {
  const { camera, whereItIs } = cesiumViewer(looking({ lat: line.lat[0], lon: line.lon[0] }, 3, 0, -3));
  frameCourseLikeTheApp(camera, line, view);
  return whereItIs();
}

function westOf(centre: Cartesian3, meters: number): Cartesian3 {
  const east = Matrix4.getColumn(Transforms.eastNorthUpToFixedFrame(centre), 0, new Cartesian4());
  return Cartesian3.multiplyByScalar(new Cartesian3(east.x, east.y, east.z), -meters, new Cartesian3());
}

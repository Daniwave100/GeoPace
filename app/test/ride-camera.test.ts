// Seam: a view the Ride asks for (core/ride-view.ts) -> what the CesiumJS camera is told to do.
// The viewer is a stand-in with only what this touches: the camera, the scene's before-each-frame
// event (a real CesiumJS one), and the open terrain's answer to "how high is the ground here".
// What must hold (issue #8): the camera follows the Ride exactly, gets to a far-off view in a
// moment rather than in a cut, cuts when reduced motion is asked for, is the runner's own again
// whenever the Ride isn't moving it, and never needs a terrain or imagery tile to have arrived.
import { readFileSync } from "node:fs";
import { Camera, Cartesian3, Cartographic, Event, GeographicProjection, Math as CesiumMath, Matrix4 } from "cesium";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { createRide } from "../src/core/ride";
import { rideCourseFor, type RideScene, rideView, type RideView, runnerInTheScene, type ScenePlace } from "../src/core/ride-view";
import { stopsFor } from "../src/core/stops";
import type { RoadPosition } from "../src/core/scrub";
import { createRideCamera, FREE_LOOK, roadHeightOnTheMap } from "../src/scene/ride-camera";

interface Shot {
  lat: number;
  lon: number;
  heightM: number;
  headingDeg: number;
  pitchDeg: number;
}

function fakeViewer(start: Shot = { lat: 40.7, lon: -74, heightM: 30_000, headingDeg: 0, pitchDeg: -60 }) {
  const shots: Shot[] = [];
  const camera = {
    positionCartographic: Cartographic.fromDegrees(start.lon, start.lat, start.heightM),
    // Free look ties the camera to a frame on the runner, and what that does to a camera is
    // CesiumJS's own arithmetic: those tests below drive the real CesiumJS camera instead.
    position: new Cartesian3(),
    ties: [] as Matrix4[],
    lookAtTransform(transform: Matrix4) {
      camera.ties.push(Matrix4.clone(transform, new Matrix4()));
    },
    heading: CesiumMath.toRadians(start.headingDeg),
    pitch: CesiumMath.toRadians(start.pitchDeg),
    flightsCancelled: 0,
    cancelFlight() {
      camera.flightsCancelled += 1;
    },
    setView(options: { destination: Cartesian3; orientation: { heading: number; pitch: number; roll: number } }) {
      camera.positionCartographic = Cartographic.fromCartesian(options.destination);
      camera.heading = options.orientation.heading;
      camera.pitch = options.orientation.pitch;
      shots.push(lastShot());
    },
  };
  const lastShot = (): Shot => ({
    lat: CesiumMath.toDegrees(camera.positionCartographic.latitude),
    lon: CesiumMath.toDegrees(camera.positionCartographic.longitude),
    heightM: camera.positionCartographic.height,
    headingDeg: CesiumMath.toDegrees(camera.heading),
    pitchDeg: CesiumMath.toDegrees(camera.pitch),
  });
  const preRender = new Event();
  let nowMs = 0;
  return {
    viewer: { camera, scene: { preRender } },
    shots,
    now: () => nowMs,
    /** Let `seconds` of frames go by, sixty to the second. */
    run(seconds: number) {
      for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
        nowMs += 1000 / 60;
        preRender.raiseEvent();
      }
    },
  };
}

const view = (lat: number, heightM = 28): RideView => ({ eye: { lat, lon: -74.05, heightM }, headingDeg: 40, pitchDeg: -3 });
const expectShot = (shot: Shot, wanted: RideView) => {
  expect(shot.lat).toBeCloseTo(wanted.eye.lat, 7);
  expect(shot.lon).toBeCloseTo(wanted.eye.lon, 7);
  expect(shot.heightM).toBeCloseTo(wanted.eye.heightM, 3);
  expect(shot.headingDeg).toBeCloseTo(wanted.headingDeg, 6);
  expect(shot.pitchDeg).toBeCloseTo(wanted.pitchDeg, 6);
};

describe("the Ride's camera in the scene", () => {
  it("gets to a view the Ride has jumped to in a moment, not in a cut: the start of the Ride, Back, a switch of cameras", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });

    camera.follow(() => view(40.6), "jump");
    run(0.1);

    expect(shots.length).toBeGreaterThan(0);
    expect(shots[shots.length - 1].heightM).toBeGreaterThan(1000); // still on its way down from 30 km
    expect(viewer.camera.flightsCancelled).toBe(1); // a flight of the map's own would fight it

    run(2);
    expectShot(shots[shots.length - 1], view(40.6));
  });

  it("goes over the city, not through it, between two places at road height, and turns the short way round", () => {
    const from: RideView = { eye: { lat: 40.6, lon: -74.05, heightM: 28 }, headingDeg: 350, pitchDeg: -3 };
    const to: RideView = { eye: { lat: 40.65, lon: -74.05, heightM: 12 }, headingDeg: 40, pitchDeg: -3 }; // Back, 5.5 km up the road
    const { viewer, shots, now, run } = fakeViewer({ lat: from.eye.lat, lon: from.eye.lon, heightM: from.eye.heightM, headingDeg: from.headingDeg, pitchDeg: from.pitchDeg });
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });

    camera.follow(() => to, "jump");
    run(2);

    expectShot(shots[shots.length - 1], to);
    expect(Math.min(...shots.map((shot) => shot.heightM))).toBeGreaterThanOrEqual(12 - 1e-6); // never under either road
    expect(Math.max(...shots.map((shot) => shot.heightM))).toBeGreaterThan(500); // up and over
    // From 350° to 40° is 50° to the right, through north; the long way would pass through south.
    const turned = shots.map((shot) => ((shot.headingDeg - 350 + 540) % 360) - 180);
    expect(Math.min(...turned)).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(...turned)).toBeLessThanOrEqual(50 + 1e-6);
  });

  it("follows a Ride under way exactly, frame by frame, with no lag, however far a late frame carries the view", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    camera.follow(() => view(40.6), "jump");
    run(2);

    // From above, a frame a tenth of a second late moves the view nearly 200 m. It is still the Ride
    // moving on, not a jump: no glide starts in the middle of plain playing.
    for (let frame = 1; frame <= 5; frame += 1) {
      const next = view(40.6 + frame * 0.0018);
      camera.follow(() => next, "riding");
      run(1 / 60);
      expectShot(shots[shots.length - 1], next);
    }
  });

  it("catches up with a Ride that is already moving while it glides: Play from far away doesn't leave the camera behind", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });

    let latest = view(40.6);
    camera.follow(() => latest, "jump");
    for (let frame = 0; frame < 120; frame += 1) {
      latest = view(40.6 + frame * 0.00009); // the Ride moves on, ten metres a frame, for two seconds
      camera.follow(() => latest, "riding");
      run(1 / 60);
    }

    expectShot(shots[shots.length - 1], latest);
  });

  it("starts a new glide from where it has got to when the Ride jumps again: Back pressed twice, a drag along the strip", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    camera.follow(() => view(40.6), "jump");
    run(0.3);

    camera.follow(() => view(40.7), "jump");
    run(2);

    expectShot(shots[shots.length - 1], view(40.7));
  });

  it("cuts straight to the view when reduced motion is asked for, even if it was asked for in the middle of a glide", () => {
    const motion = { reduced: false };
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => motion.reduced, now });
    camera.follow(() => view(40.6), "jump");
    run(0.2);

    motion.reduced = true;
    camera.follow(() => view(40.7), "jump");
    run(1 / 60);

    expectShot(shots[shots.length - 1], view(40.7)); // there in one frame: nothing in between
  });

  it("glides round when the runner has only turned their head: Play after looking around On the road is not a snap", () => {
    const wanted = view(40.6);
    const { viewer, shots, now, run } = fakeViewer({ lat: 40.6, lon: -74.05, heightM: 28, headingDeg: 220, pitchDeg: -30 }); // same place, looking back and down
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });

    camera.follow(() => wanted, "jump");
    run(0.1);
    const onTheWay = shots[shots.length - 1];
    expect(onTheWay.pitchDeg).toBeLessThan(-4);
    expect(onTheWay.pitchDeg).toBeGreaterThan(-30);

    run(2);
    expectShot(shots[shots.length - 1], wanted);
  });

  it("holds the camera on every frame while the Ride has it, asking afresh where that is", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    const road = { heightM: 5 }; // what coarse, far-off terrain says the road's height is
    camera.follow(() => view(40.6, road.heightM + 3), "jump");
    run(2);

    // Paused. The finer terrain arrives and the road turns out to be higher: the camera goes with it.
    road.heightM = 19;
    run(1 / 60);
    expectShot(shots[shots.length - 1], view(40.6, 22));

    // And whatever else moves the camera meanwhile is undone before the frame is drawn. (CesiumJS lifts
    // a camera it finds under a photographed surface: under the Queensboro's upper deck, a tree.)
    viewer.camera.positionCartographic = Cartographic.fromDegrees(-74.05, 40.6, 60);
    run(1 / 60);
    expectShot(shots[shots.length - 1], view(40.6, 22));
  });

  it("lets go at once when the runner takes hold of the map, even in the middle of a glide: from then on the map is theirs", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    camera.follow(() => view(40.6), "jump");
    run(0.2); // part of the way there

    camera.letGo();
    const told = shots.length;
    viewer.camera.positionCartographic = Cartographic.fromDegrees(-74.2, 40.9, 9000); // the runner orbits, pans and zooms
    run(5);

    expect(shots).toHaveLength(told); // nothing pulls against them, and nothing pulls the camera back
  });

  it("glides back from wherever the runner left the camera when the Ride resumes", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    camera.follow(() => view(40.6), "jump");
    run(2);
    camera.letGo();
    viewer.camera.positionCartographic = Cartographic.fromDegrees(-74.2, 40.9, 9000); // the runner looked around

    camera.follow(() => view(40.6001), "jump");
    run(0.1);
    expect(shots[shots.length - 1].heightM).toBeGreaterThan(1000);
    run(2);
    expectShot(shots[shots.length - 1], view(40.6001));
  });
});

describe("the road's height on the keyless map", () => {
  const place: RoadPosition = { lat: 40.6, lon: -74.05, ellipsoidHeightM: 28, bearingDeg: 40 };

  it("is the open terrain's at that very place, where the terrain has arrived: the course is draped on it", () => {
    const asked: { latDeg: number; lonDeg: number }[] = [];
    const globe = {
      getHeight(where: Cartographic) {
        asked.push({ latDeg: CesiumMath.toDegrees(where.latitude), lonDeg: CesiumMath.toDegrees(where.longitude) });
        return -31.5;
      },
    };

    expect(roadHeightOnTheMap(globe)(place)).toBe(-31.5);
    expect(asked[0].latDeg).toBeCloseTo(40.6, 9);
    expect(asked[0].lonDeg).toBeCloseTo(-74.05, 9);
  });

  it("is the Course Bundle's own where the terrain has no answer, so a failed tile never stops the Ride", () => {
    expect(roadHeightOnTheMap({ getHeight: () => undefined })(place)).toBe(28);
    expect(roadHeightOnTheMap({ getHeight: () => Number.NaN })(place)).toBe(28);
  });
});

// Issue #8: "Simulated tile failure leaves the course, the strip and the layers working." The
// course, the strip and the layers are made from the Course Bundle alone, and the Ride moves them
// through scrubbing; what could depend on a tile is the camera. Here every tile has failed: the
// open terrain never answers, and no imagery is ever asked anything.
describe("the Ride with every tile failed", () => {
  it("rides New York from the start to the finish On the road, at the Course Bundle's own heights", () => {
    const nyc = parseCourseBundle(JSON.parse(readFileSync(new URL("../../data/derived/nyc/course-bundle.json", import.meta.url), "utf8")), "nyc");
    const scene = { line: nyc.measured.course_line, stops: stopsFor(nyc), notMeasured: nyc.measured.elevation_not_measured };
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    const heightAt = roadHeightOnTheMap({ getHeight: () => undefined }); // the terrain's tiles never arrived
    let frame: ((nowMs: number) => void) | null = null;
    const moves: number[] = [];
    const ride = createRide({
      course: rideCourseFor(scene),
      frames: { request: (callback) => ((frame = callback), 1), cancel: () => (frame = null) },
      reducedMotion: () => false,
      onMove: (km) => {
        moves.push(km); // what moves the strip's cursor, the readout, the sentence and the layer's clause
        camera.follow(() => rideView(scene, km, ride.camera, { heightAt }), "riding");
      },
      onChange: () => undefined,
    });
    ride.useCamera("on-the-road");

    ride.playPause();
    for (let ms = 0; ride.playing && ms < 3_600_000; ms += 100) {
      const callback = frame as ((nowMs: number) => void) | null;
      frame = null;
      callback?.(ms);
      run(1 / 60);
    }

    expect(ride.km).toBe(scene.line.length_m / 1000);
    expect(moves.length).toBeGreaterThan(1000);
    expect(shots.every((shot) => [shot.lat, shot.lon, shot.heightM, shot.headingDeg, shot.pitchDeg].every(Number.isFinite))).toBe(true);
    // On the Verrazzano's deck, tens of metres over the water, not at the sea level a missing terrain might suggest.
    const onTheBridge = shots.filter((shot) => shot.lat > 40.603 && shot.lat < 40.609 && shot.lon < -74.03 && shot.heightM < 200);
    expect(onTheBridge.length).toBeGreaterThan(10);
    expect(Math.min(...onTheBridge.map((shot) => shot.heightM))).toBeGreaterThan(20);
  });
});


// Free look (issue #28): in the Ride a hand on the map turns the camera round the runner and the
// Ride plays on. The camera is tied to a frame of reference that sits on the runner, and before
// every frame that frame is moved to where the runner now is while the camera keeps its place
// within it; CesiumJS's own mouse controls, finding a camera tied to a frame, orbit the frame's
// origin rather than the globe. So these tests drive the real CesiumJS camera, not a stand-in:
// what is ours here is the frame, the bounds and the untying, and all three are CesiumJS's
// arithmetic to carry out.
const nycBundle = parseCourseBundle(JSON.parse(readFileSync(new URL("../../data/derived/nyc/course-bundle.json", import.meta.url), "utf8")), "nyc");
const nycScene: RideScene = { line: nycBundle.measured.course_line, stops: stopsFor(nycBundle), notMeasured: nycBundle.measured.elevation_not_measured };

/** A real CesiumJS camera in an empty scene, looking at `start`. */
function cesiumViewer(start: RideView) {
  const scene = { canvas: { clientWidth: 1200, clientHeight: 800 }, drawingBufferWidth: 1200, drawingBufferHeight: 800, mapProjection: new GeographicProjection() };
  const camera = new Camera(scene as never);
  camera.setView({
    destination: Cartesian3.fromDegrees(start.eye.lon, start.eye.lat, start.eye.heightM),
    orientation: { heading: CesiumMath.toRadians(start.headingDeg), pitch: CesiumMath.toRadians(start.pitchDeg), roll: 0 },
  });
  const preRender = new Event();
  let nowMs = 0;
  return {
    viewer: { camera, scene: { preRender } },
    camera,
    now: () => nowMs,
    run(seconds: number) {
      for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
        nowMs += 1000 / 60;
        preRender.raiseEvent();
      }
    },
    /** What the runner's own hand does to the camera through CesiumJS's controls: it moves within the frame it is tied to. */
    drag(eastM: number, northM: number, upM: number) {
      Cartesian3.clone(new Cartesian3(eastM, northM, upM), camera.position);
    },
  };
}

const placeOf = (at: ScenePlace) => Cartesian3.fromDegrees(at.lon, at.lat, at.heightM);
/** How far off the middle of the view a place is, in degrees. */
const offTheMiddleDeg = (camera: Camera, at: ScenePlace) => CesiumMath.toDegrees(Cartesian3.angleBetween(camera.directionWC, Cartesian3.subtract(placeOf(at), camera.positionWC, new Cartesian3())));
const KM = 10;

describe("free look: the camera the runner turns", () => {
  /** The Ride From above at km 10 of New York, with the runner held off the middle of the map as the readout block asks. */
  const fromAbove = () => rideView(nycScene, KM, "from-above", { leftOfRunner: 0.14 });
  const runnerAt = (km: number) => runnerInTheScene(nycScene, km);

  it("goes wherever the runner goes, at the distance and the way round the runner has turned it to", () => {
    const { viewer, camera, now, run, drag } = cesiumViewer(fromAbove());
    const ride = { km: KM };
    const free = createRideCamera(viewer, { reducedMotion: () => false, now });

    free.lookAround(() => runnerAt(ride.km));
    run(1); // the view settles on the runner
    drag(700, -400, 500); // the runner turns the camera round to the south-east and brings it in

    ride.km = KM + 0.45; // and the Ride plays on: a second from above
    run(1);

    // The camera keeps its place within the frame, and the frame is where the runner now is.
    expect(camera.position.x).toBeCloseTo(700, 3);
    expect(camera.position.y).toBeCloseTo(-400, 3);
    expect(camera.position.z).toBeCloseTo(500, 3);
    expect(Cartesian3.distance(camera.positionWC, placeOf(runnerAt(ride.km)))).toBeCloseTo(Math.hypot(700, 400, 500), 0);
    expect(offTheMiddleDeg(camera, runnerAt(ride.km))).toBeLessThan(0.05); // and it is looking at them
  });

  it("asks where the runner is before every frame, so the road's height follows our terrain as it arrives", () => {
    const { viewer, camera, now, run } = cesiumViewer(fromAbove());
    const road = { heightM: 5 }; // what coarse, far-off terrain says the road's height is
    const free = createRideCamera(viewer, { reducedMotion: () => false, now });

    free.lookAround(() => ({ ...runnerAt(KM), heightM: road.heightM }));
    run(1);
    const was = camera.positionCartographic.height;

    road.heightM = 40; // the finer terrain arrives and the road turns out to be 35 m higher
    run(1 / 60);

    expect(camera.positionCartographic.height - was).toBeCloseTo(35, 1); // the camera goes up with it, at the same distance
  });

  it("brings the runner to the middle of the view by turning, not by moving: From above holds them off it", () => {
    const { viewer, camera, now, run } = cesiumViewer(fromAbove());
    const free = createRideCamera(viewer, { reducedMotion: () => false, now });
    const was = Cartographic.toCartesian(Cartographic.clone(camera.positionCartographic));

    free.lookAround(() => runnerAt(KM));
    run(1 / 60);

    // The readout block covers the left of the map, so From above holds the runner off its middle
    // (core/framing.ts); free look orbits them, so entering it takes them to the middle. Not in
    // the first frame, and never by carrying the camera there: it stands still and turns.
    expect(offTheMiddleDeg(camera, runnerAt(KM))).toBeGreaterThan(3);
    for (let frame = 0; frame < 30; frame += 1) {
      run(1 / 60);
      expect(Cartesian3.distance(camera.positionWC, was)).toBeLessThan(1);
    }

    run(0.5);
    expect(offTheMiddleDeg(camera, runnerAt(KM))).toBeLessThan(0.05);
    expect(Cartesian3.distance(camera.positionWC, was)).toBeLessThan(1);
  });

  it("is the runner's hand's even in the middle of that turn: a drag then is kept whole", () => {
    const { viewer, camera, now, run, drag } = cesiumViewer(fromAbove());
    const free = createRideCamera(viewer, { reducedMotion: () => false, now });

    free.lookAround(() => runnerAt(KM));
    run(0.25); // half way into the turn, the runner drags the camera round to the north-west of themselves
    drag(-1200, 900, 800);
    run(1 / 60);
    const where = Cartesian3.clone(camera.positionWC, new Cartesian3());

    run(1);

    expect(Cartesian3.distance(camera.positionWC, where)).toBeLessThan(1); // the rest of the turn doesn't take the camera back
    expect(camera.position.x).toBeLessThan(-1000); // it is where the hand left it, and now counted from the runner
    expect(camera.position.y).toBeGreaterThan(800);
    expect(offTheMiddleDeg(camera, runnerAt(KM))).toBeLessThan(0.05);
  });

  it("cuts to the middle when reduced motion is asked for", () => {
    const { viewer, camera, now, run } = cesiumViewer(fromAbove());
    const free = createRideCamera(viewer, { reducedMotion: () => true, now });

    free.lookAround(() => runnerAt(KM));
    run(1 / 60);

    expect(offTheMiddleDeg(camera, runnerAt(KM))).toBeLessThan(0.05);
  });

  it("keeps the camera where it can still see the runner: not under the road, not on top of them, not miles off", () => {
    const { viewer, camera, now, run, drag } = cesiumViewer(fromAbove());
    const free = createRideCamera(viewer, { reducedMotion: () => false, now });
    free.lookAround(() => runnerAt(KM));
    run(1);

    drag(0, -40_000, -9000); // dragged under the road and out of the city
    run(1 / 60);
    const far = Cartesian3.clone(camera.position, new Cartesian3());
    expect(Cartesian3.magnitude(far)).toBeCloseTo(FREE_LOOK.farthestM, 3);
    expect(CesiumMath.toDegrees(Math.asin(far.z / Cartesian3.magnitude(far)))).toBeCloseTo(FREE_LOOK.lowestDeg, 3);
    expect(Math.atan2(far.x, far.y)).toBeCloseTo(Math.atan2(0, -1), 6); // still due south of the runner: only how far and how low are ours

    drag(0.5, 0.5, 0.2); // and brought in on top of them
    run(1 / 60);
    expect(Cartesian3.magnitude(camera.position)).toBeCloseTo(FREE_LOOK.nearestM, 3);
    expect(offTheMiddleDeg(camera, runnerAt(KM))).toBeLessThan(0.05);
  });

  it("unties the camera when the runner leaves the Ride, leaving it where they left it: the map's own flights are the map's again", () => {
    const { viewer, camera, now, run, drag } = cesiumViewer(fromAbove());
    const free = createRideCamera(viewer, { reducedMotion: () => false, now });
    free.lookAround(() => runnerAt(KM));
    run(1);
    drag(400, -400, 300);
    run(1 / 60);
    const where = Cartographic.clone(camera.positionCartographic);

    free.letGo();

    expect(camera.transform.equals(Matrix4.IDENTITY)).toBe(true);
    expect(camera.positionCartographic.longitude).toBeCloseTo(where.longitude, 12);
    expect(camera.positionCartographic.latitude).toBeCloseTo(where.latitude, 12);
    expect(camera.positionCartographic.height).toBeCloseTo(where.height, 6);
    // And nothing pulls at it afterwards: it is the runner's map.
    run(1);
    expect(Cartesian3.distance(camera.positionWC, Cartographic.toCartesian(where))).toBeLessThan(1e-6);
  });

  it("gives the camera back to the Ride in a glide from wherever the runner left it, untied", () => {
    const { viewer, camera, now, run, drag } = cesiumViewer(fromAbove());
    const free = createRideCamera(viewer, { reducedMotion: () => false, now });
    free.lookAround(() => runnerAt(KM));
    run(1);
    drag(900, -900, 400); // turned right round behind the runner

    const wanted = rideView(nycScene, KM, "from-above");
    free.follow(() => wanted, "jump");
    expect(camera.transform.equals(Matrix4.IDENTITY)).toBe(true); // the frame is set back before the glide: a glide is in the world

    run(0.1);
    expect(Cartesian3.distance(camera.positionWC, Cartesian3.fromDegrees(wanted.eye.lon, wanted.eye.lat, wanted.eye.heightM))).toBeGreaterThan(100); // on its way
    run(2);
    expect(camera.positionCartographic.height).toBeCloseTo(wanted.eye.heightM, 1);
    expect(CesiumMath.toDegrees(camera.heading)).toBeCloseTo(wanted.headingDeg, 3);
    expect(CesiumMath.toDegrees(camera.pitch)).toBeCloseTo(wanted.pitchDeg, 3);
  });
});

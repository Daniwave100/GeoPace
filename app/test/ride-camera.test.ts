// Seam: a view the Ride asks for (core/ride-view.ts) -> what the CesiumJS camera is told to do.
// The viewer is a stand-in with only what this touches: the camera, the scene's before-each-frame
// event (a real CesiumJS one), and the open terrain's answer to "how high is the ground here".
// What must hold (issue #8): the camera follows the Ride exactly, gets to a far-off view in a
// moment rather than in a cut, cuts when reduced motion is asked for, is the runner's own again
// whenever the Ride isn't moving it, and never needs a terrain or imagery tile to have arrived.
import { readFileSync } from "node:fs";
import { Cartesian3, Cartographic, Event, Math as CesiumMath } from "cesium";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { createRide } from "../src/core/ride";
import { rideCourseFor, rideView, type RideView } from "../src/core/ride-view";
import { stopsFor } from "../src/core/stops";
import type { RoadPosition } from "../src/core/scrub";
import { createRideCamera, roadHeightOnTheMap } from "../src/scene/ride-camera";

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


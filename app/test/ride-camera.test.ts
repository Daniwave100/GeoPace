// Seam: a view the Ride asks for (core/ride-view.ts) -> what the CesiumJS camera is told to do.
// The viewer is a stand-in with only what this touches: the camera, the scene's before-each-frame
// event (a real CesiumJS one), and the open terrain's answer to "how high is the ground here".
// What must hold (issue #8): the camera follows the Ride exactly, gets to a far-off view in a
// moment rather than in a cut, cuts when reduced motion is asked for, is the runner's own again
// whenever the Ride isn't moving it, and never needs a terrain or imagery tile to have arrived.
import { Cartesian3, Cartographic, Event, Math as CesiumMath } from "cesium";
import { describe, expect, it } from "vitest";
import type { RideView } from "../src/core/ride-view";
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
  it("gets to a far-off view in a moment, not in a cut: the start of the Ride, Back, a switch of cameras", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });

    camera.show(view(40.6));
    run(0.1);

    expect(shots.length).toBeGreaterThan(0);
    expect(shots[shots.length - 1].heightM).toBeGreaterThan(1000); // still on its way down from 30 km
    expect(viewer.camera.flightsCancelled).toBe(1); // a flight of the map's own would fight it

    run(2);
    expectShot(shots[shots.length - 1], view(40.6));
    // On the way it never went under the road it was heading for.
    expect(Math.min(...shots.map((shot) => shot.heightM))).toBeGreaterThanOrEqual(28 - 1e-6);
  });

  it("follows a Ride under way exactly, frame by frame, with no lag", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    camera.show(view(40.6));
    run(2);

    // Ten metres further up the road each frame: about what On the road covers at the cruise.
    for (let frame = 1; frame <= 5; frame += 1) {
      const next = view(40.6 + frame * 0.00009);
      camera.show(next);
      run(1 / 60);
      expectShot(shots[shots.length - 1], next);
    }
  });

  it("catches up with a Ride that is already moving while it glides: Play from far away doesn't leave the camera behind", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });

    let latest = view(40.6);
    for (let frame = 0; frame < 120; frame += 1) {
      latest = view(40.6 + frame * 0.00009); // the Ride moves on, ten metres a frame, for two seconds
      camera.show(latest);
      run(1 / 60);
    }

    expectShot(shots[shots.length - 1], latest);
  });

  it("cuts straight to the view when reduced motion is asked for: nothing in between", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => true, now });

    camera.show(view(40.6));
    run(1);

    expect(shots).toHaveLength(1);
    expectShot(shots[0], view(40.6));
  });

  it("leaves the camera alone whenever the Ride isn't moving it, so paused, the map is the runner's", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    camera.show(view(40.6));
    run(2);
    const told = shots.length;

    run(5); // paused: the runner orbits, pans and zooms, and nothing pulls the camera back

    expect(shots).toHaveLength(told);
  });

  it("glides back from wherever the runner left the camera when the Ride resumes", () => {
    const { viewer, shots, now, run } = fakeViewer();
    const camera = createRideCamera(viewer, { reducedMotion: () => false, now });
    camera.show(view(40.6));
    run(2);
    viewer.camera.positionCartographic = Cartographic.fromDegrees(-74.2, 40.9, 9000); // the runner looked around

    camera.show(view(40.6001));
    run(0.1);
    expect(shots[shots.length - 1].heightM).toBeGreaterThan(1000);
    run(2);
    expectShot(shots[shots.length - 1], view(40.6001));
  });
});

describe("the road's height on the keyless map", () => {
  const place: RoadPosition = { lat: 40.6, lon: -74.05, ellipsoidHeightM: 28, bearingDeg: 40 };

  it("is the open terrain's, where the terrain has arrived: the course is draped on it", () => {
    expect(roadHeightOnTheMap({ getHeight: () => -31.5 })(place)).toBe(-31.5);
  });

  it("is the Course Bundle's own where the terrain has no answer, so a failed tile never stops the Ride", () => {
    expect(roadHeightOnTheMap({ getHeight: () => undefined })(place)).toBe(28);
    expect(roadHeightOnTheMap({ getHeight: () => Number.NaN })(place)).toBe(28);
  });
});

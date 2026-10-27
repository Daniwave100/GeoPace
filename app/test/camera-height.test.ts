// Seam: a camera, the frames the scene draws from it -> the height photoreal's key panel says the
// camera is above the ground (issue #52).
//
// What must hold: a camera the Ride moves every frame, which never comes to rest, still gets a
// fresh height, a couple of times a second and no more (each is a question to the terrain service);
// the height is the camera's as that frame was drawn from it; a camera standing still is not asked
// about again; and an answer that comes back after watching has stopped is dropped.
// The viewer is a stand-in: the camera, the scene's after-each-frame event (a real CesiumJS one),
// and the terrain's answer, which the test holds back or gives.
import { Cartographic, Event, type TerrainProvider } from "cesium";
import { describe, expect, it } from "vitest";
import { watchCameraHeight } from "../src/scene/camera-height";

const GROUND_M = 10;

function fakeScene() {
  const camera = { positionCartographic: Cartographic.fromDegrees(-74, 40.6, 15_000) };
  const postRender = new Event();
  let nowMs = 0;
  const asked: number[] = [];
  const pending: (() => void)[] = [];
  const sample = (_terrain: TerrainProvider, places: Cartographic[]) => {
    asked.push(places[0].height);
    return new Promise<Cartographic[]>((resolve) => {
      pending.push(() => resolve(places.map((p) => new Cartographic(p.longitude, p.latitude, GROUND_M))));
    });
  };
  const heights: (number | null)[] = [];
  const viewer = { camera, scene: { postRender }, terrainProvider: {} as TerrainProvider };
  const stop = watchCameraHeight(viewer, (m) => heights.push(m), { sample, now: () => nowMs });
  /** Every answer on its way arrives; promise callbacks run before this resolves. */
  const answer = async () => {
    for (const give of pending.splice(0)) give();
    await new Promise((r) => setTimeout(r, 0));
  };
  /** One frame drawn from a camera at `heightM`, `ms` after the last. */
  const frame = (heightM: number, ms = 16) => {
    nowMs += ms;
    camera.positionCartographic = Cartographic.fromDegrees(-74, 40.6, heightM);
    postRender.raiseEvent();
  };
  return { asked, heights, frame, answer, stop };
}

describe("the camera's height above the ground", () => {
  it("is fresh while the Ride moves the camera every frame and it never comes to rest", async () => {
    const s = fakeScene();
    s.frame(15_000);
    await s.answer();
    expect(s.heights).toEqual([15_000 - GROUND_M]);

    // Down to 1,500 m (From above) and along, a new place every frame for two seconds.
    for (let i = 0; i < 120; i++) {
      s.frame(1_500 + (i % 2));
      await s.answer();
    }
    const last = s.heights.at(-1)!;
    expect(last).toBeGreaterThanOrEqual(1_500 - GROUND_M);
    expect(last).toBeLessThanOrEqual(1_501 - GROUND_M);
    s.stop();
  });

  it("asks the terrain a couple of times a second at most, however fast the frames", async () => {
    const s = fakeScene();
    for (let i = 0; i < 120; i++) {
      s.frame(1_500 + i); // two seconds at 60 frames a second
      await s.answer();
    }
    expect(s.asked.length).toBeGreaterThanOrEqual(3);
    expect(s.asked.length).toBeLessThanOrEqual(5);
    s.stop();
  });

  it("asks one question at a time: a slow answer is not piled on", async () => {
    const s = fakeScene();
    for (let i = 0; i < 120; i++) s.frame(1_500 + i); // no answer comes back
    expect(s.asked).toEqual([1_500]);
    await s.answer();
    s.frame(2_000, 600);
    expect(s.asked).toEqual([1_500, 2_000]);
    s.stop();
  });

  it("is asked about the camera the frame was drawn from", async () => {
    const s = fakeScene();
    s.frame(777);
    expect(s.asked).toEqual([777]);
    s.stop();
  });

  it("is not asked again of a camera standing still", async () => {
    const s = fakeScene();
    s.frame(300);
    await s.answer();
    for (let i = 0; i < 120; i++) s.frame(300, 100);
    expect(s.asked).toEqual([300]);
    s.frame(250, 100);
    expect(s.asked).toEqual([300, 250]);
    s.stop();
  });

  it("drops an answer that comes back after watching stopped, and asks nothing more", async () => {
    const s = fakeScene();
    s.frame(300);
    s.stop();
    await s.answer();
    s.frame(250, 1_000);
    expect(s.heights).toEqual([]);
    expect(s.asked).toEqual([300]);
  });
});

// Seam: the camera + the ground's height under it -> the place in the middle of the map, which
// "Straight down" keeps in the middle. A real CesiumJS camera, with a stand-in for the scene it
// needs to exist. The trap (CLAUDE.md): sea level is 32.5 m BELOW the ellipsoid in New York, so a
// camera a few metres over a New York street is inside the ellipsoid, and asked where its line of
// sight meets the ellipsoid, CesiumJS answers with the far side of it: another continent.
import { Camera, Cartesian3, Cartographic, GeographicProjection, Math as CesiumMath, SceneMode } from "cesium";
import { describe, expect, it } from "vitest";
import { middleOfTheMap } from "../src/scene/map-middle";

const canvas = { clientWidth: 1080, clientHeight: 535 };

function cameraAt(lonDeg: number, latDeg: number, heightM: number, pitchDeg: number): Camera {
  const camera = new Camera({ canvas, drawingBufferWidth: canvas.clientWidth, drawingBufferHeight: canvas.clientHeight, mapProjection: new GeographicProjection(), mode: SceneMode.SCENE3D } as never);
  camera.setView({ destination: Cartesian3.fromDegrees(lonDeg, latDeg, heightM), orientation: { heading: CesiumMath.toRadians(40), pitch: CesiumMath.toRadians(pitchDeg), roll: 0 } });
  return camera;
}

describe("the place in the middle of the map", () => {
  it("is a few metres ahead on the road from the Ride's On the road camera in New York, not the far side of the world", () => {
    const camera = cameraAt(-74.05, 40.6, -20, -7); // 3 m over a street that is 23 m under the ellipsoid

    const middle = middleOfTheMap(camera, canvas, -23);

    expect(middle).toBeDefined();
    expect(Cartesian3.distance(camera.positionWC, middle!)).toBeLessThan(40); // 3 m up, looking 7° down: about 25 m
    expect(Cartographic.fromCartesian(middle!).height).toBeCloseTo(-23, 1); // on the ground, not on the ellipsoid
  });

  it("is on the ground in Berlin too, where the ground is 73 m above the ellipsoid: not 680 m on, through the ground", () => {
    const camera = cameraAt(13.4, 52.5, 76, -7);

    const middle = middleOfTheMap(camera, canvas, 73);

    expect(Cartesian3.distance(camera.positionWC, middle!)).toBeLessThan(40);
  });

  it("is straight under the camera when the camera looks at the sky and its line of sight meets no ground", () => {
    const camera = cameraAt(-74.05, 40.6, -20, 5);

    const middle = Cartographic.fromCartesian(middleOfTheMap(camera, canvas, -23)!);

    expect(CesiumMath.toDegrees(middle.longitude)).toBeCloseTo(-74.05, 6);
    expect(CesiumMath.toDegrees(middle.latitude)).toBeCloseTo(40.6, 6);
    expect(middle.height).toBeCloseTo(-23, 3);
  });

  it("is where it always was from above: a tilted view of the whole course meets the ground near where it meets the ellipsoid", () => {
    const camera = cameraAt(-74, 40.7, 30_000, -60);

    const onTheGround = middleOfTheMap(camera, canvas, -30)!;
    const onTheEllipsoid = middleOfTheMap(camera, canvas, 0)!;

    expect(Cartesian3.distance(onTheGround, onTheEllipsoid)).toBeLessThan(60);
  });
});

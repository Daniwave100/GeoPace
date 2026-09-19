// The runner, and the dot at the start and at the finish: plain HTML laid over the map, like the
// labels (map-labels.ts), and moved each frame to where their place on the course is on screen.
//
// They used to be points in the 3D scene. At road height the course line may show through what
// stands in front of it, and CesiumJS draws "shows through" by painting the line over everything
// nearer than it: a dot of ours included. With Hills on, the runner was a pale ghost under the
// band. Nothing in the scene can be painted over what isn't in the scene.
//
// A dot stands where the course line is drawn: on our own open terrain while the line is draped
// (never on photoreal imagery, which is for looking at only: PLAN.md D5), at the road's height,
// lifted with the line, while the line is (placement.ts).
import { Cartesian2, Cartesian3, Cartographic, SceneTransforms, type Viewer } from "cesium";
import { isOverTheHorizon } from "../core/horizon";
import type { RoadPosition } from "../core/scrub";
import { html } from "../dom";
import { type Placement, scenePosition } from "./placement";

type Place = Pick<RoadPosition, "lat" | "lon" | "ellipsoidHeightM">;

export interface MapDot {
  /** Which dot it is, so that showing it again moves it instead of making another. */
  id: string;
  /** The runner is the course's blue, ringed in white; an end is a small white dot ringed in black. */
  look: "runner" | "end";
  place: Place;
}

export interface MapDots {
  /** These dots and no others. `placement` is how the course line is drawn now: the dots stand where it is. */
  show(dots: MapDot[], placement: Placement): void;
}

/** Where a dot is in the scene. `terrainHeightM` is what our own open terrain says there, if it has loaded. */
export function dotPosition(place: Place, placement: Placement, terrainHeightM: number | undefined): Cartesian3 {
  return placement === "draped" ? Cartesian3.fromDegrees(place.lon, place.lat, terrainHeightM ?? 0) : scenePosition(place, placement);
}

export function createMapDots(viewer: Viewer, container: HTMLElement): MapDots {
  const nodes = new Map<string, HTMLElement>();
  let shown: MapDot[] = [];
  let placement: Placement = "draped";
  const onScreen = new Cartesian2();
  const where = new Cartographic();

  viewer.scene.postRender.addEventListener(() => {
    const eye = viewer.camera.positionWC;
    const radii = viewer.scene.globe.ellipsoid.radii;
    for (const dot of shown) {
      const node = nodes.get(dot.id);
      if (!node) continue;
      // The globe's own terrain, as far as it has loaded. It never answers for photoreal imagery.
      const terrainHeightM = placement === "draped" ? viewer.scene.globe.getHeight(Cartographic.fromDegrees(dot.place.lon, dot.place.lat, 0, where)) : undefined;
      const position = dotPosition(dot.place, placement, terrainHeightM);
      const at = !isOverTheHorizon(eye, position, radii) ? SceneTransforms.worldToWindowCoordinates(viewer.scene, position, onScreen) : undefined;
      node.hidden = !at;
      // The node's own size is taken off in the stylesheet, so this is the dot's middle.
      if (at) node.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    }
  });

  return {
    show(dots, drawnAs) {
      shown = dots;
      placement = drawnAs;
      for (const [id, node] of nodes) {
        if (dots.some((dot) => dot.id === id)) continue;
        node.remove();
        nodes.delete(id);
      }
      for (const dot of dots) {
        if (nodes.has(dot.id)) continue;
        const node = html("span", { class: dot.look === "runner" ? "map-dot map-dot-runner" : "map-dot map-dot-end", "aria-hidden": "true" });
        node.hidden = true; // until the next frame says where it goes
        nodes.set(dot.id, node);
        // The runner goes in last, so it lies over an end dot it is standing on.
        if (dot.look === "runner") container.append(node);
        else container.prepend(node);
      }
      viewer.scene.requestRender();
    },
  };
}

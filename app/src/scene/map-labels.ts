// Labels laid over the map: the poster's opaque blocks, not text painted into the 3D scene. They
// are ordinary HTML, so they get the poster's type and encodings, can be struck through, and the
// ones that do something are real buttons the keyboard can reach. Each frame they are moved to
// where their place on the course is on screen; where two would overprint, the more important
// one stays (core/declutter.ts) and the other comes back when the runner zooms in.
import { Cartesian2, Cartesian3, Cartographic, sampleTerrainMostDetailed, SceneTransforms, type Viewer } from "cesium";
import { keepLabels } from "../core/declutter";
import { isOverTheHorizon } from "../core/horizon";
import { html } from "../dom";

export interface MapLabel {
  lat: number;
  lon: number;
  text: string;
  /** How it is drawn: an encoding's class, or the plain place-name look. */
  className: string;
  priority: number;
  title?: string;
  /** Makes it a button. */
  onPick?: () => void;
}

export interface MapLabels {
  show(labels: MapLabel[]): void;
}

interface Placed {
  label: MapLabel;
  node: HTMLElement;
  position: Cartesian3;
  width: number;
  height: number;
}

/** How far above its place on the course a label sits, so it doesn't cover the line it names. */
const LIFT_PX = 12;

export function createMapLabels(viewer: Viewer, container: HTMLElement): MapLabels {
  let placed: Placed[] = [];
  let shown = 0;
  const onScreen = new Cartesian2();

  viewer.scene.postRender.addEventListener(() => {
    if (placed.length === 0) return;
    const eye = viewer.camera.positionWC;
    const radii = viewer.scene.globe.ellipsoid.radii;
    const view = { width: container.clientWidth, height: container.clientHeight };
    const boxes = placed.map((item) => {
      const at = !isOverTheHorizon(eye, item.position, radii) ? SceneTransforms.worldToWindowCoordinates(viewer.scene, item.position, onScreen) : undefined;
      if (!at) return null;
      const left = at.x - item.width / 2;
      const top = at.y - item.height - LIFT_PX;
      const inView = left + item.width > 0 && left < view.width && top + item.height > 0 && top < view.height;
      return inView ? { left, top, width: item.width, height: item.height, priority: item.label.priority } : null;
    });
    const candidates = boxes.flatMap((box, index) => (box ? [{ box, index }] : []));
    const stays = keepLabels(candidates.map(({ box }) => box));
    const visible = new Set(candidates.filter((_, i) => stays[i]).map(({ index }) => index));
    placed.forEach((item, index) => {
      const box = boxes[index];
      item.node.hidden = !visible.has(index); // hidden also takes a button out of the Tab order
      if (box && visible.has(index)) item.node.style.transform = `translate(${Math.round(box.left)}px, ${Math.round(box.top)}px)`;
    });
  });

  return {
    show(labels) {
      const mine = ++shown;
      placed = labels.map((label) => {
        const node = label.onPick ? html("button", { type: "button", class: `map-label ${label.className}`, title: label.title, text: label.text }) : html("span", { class: `map-label ${label.className}`, title: label.title, text: label.text });
        if (label.onPick) node.addEventListener("click", label.onPick);
        node.hidden = true; // until the next frame says where it goes
        return { label, node, position: Cartesian3.fromDegrees(label.lon, label.lat), width: 0, height: 0 };
      });
      container.replaceChildren(...placed.map((item) => item.node));
      for (const item of placed) {
        // Measured while hidden would be zero: show it off-screen for the one reading.
        item.node.hidden = false;
        item.width = item.node.offsetWidth;
        item.height = item.node.offsetHeight;
        item.node.hidden = true;
      }
      void liftOntoTheGround(viewer, placed, () => mine === shown);
    },
  };
}

/**
 * A label's place starts at height zero, which near the ground puts it tens of metres from the
 * road. The open terrain says how high the ground is there; never the photoreal imagery, which is
 * for looking at only (PLAN.md D5). If the terrain can't say, the labels stay where they are.
 */
async function liftOntoTheGround(viewer: Viewer, placed: Placed[], stillWanted: () => boolean): Promise<void> {
  if (placed.length === 0) return;
  try {
    const ground = await sampleTerrainMostDetailed(
      viewer.terrainProvider,
      placed.map((item) => Cartographic.fromDegrees(item.label.lon, item.label.lat)),
    );
    if (!stillWanted()) return;
    placed.forEach((item, i) => {
      if (Number.isFinite(ground[i].height)) item.position = Cartesian3.fromDegrees(item.label.lon, item.label.lat, ground[i].height);
    });
  } catch {
    // The terrain is best-effort (PLAN.md D16).
  }
}

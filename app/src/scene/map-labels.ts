// Labels laid over the map: the poster's opaque blocks, not text painted into the 3D scene. They
// are ordinary HTML, so they get the poster's type and encodings, can be struck through, and the
// ones that do something are real buttons the keyboard can reach. Each frame they are moved to
// where their place on the course is on screen; where two would overprint, the more important
// one stays (core/declutter.ts) and the other comes back when the runner zooms in.
//
// The map's own credits run along its bottom edge (OpenStreetMap's, and Google's in photoreal).
// No label is ever put there: attributions stay visible (CLAUDE.md).
import { Cartesian2, Cartesian3, Cartographic, sampleTerrainMostDetailed, SceneTransforms, type Viewer } from "cesium";
import { keepLabels } from "../core/declutter";
import { type Encoding, ENCODINGS } from "../core/encoding";
import { isOverTheHorizon } from "../core/horizon";
import { html } from "../dom";

export interface MapLabel {
  lat: number;
  lon: number;
  text: string;
  /** The kind of claim it makes, drawn as everywhere else; or "place" for the start and the finish, which are the course's own. */
  look: Encoding | "place";
  priority: number;
  /** More, for whoever asks: said by a tooltip, and read out with the label. */
  note?: string;
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
/** The strip along the bottom of the map that belongs to the map's own credits. */
const CREDITS_BAND_PX = 40;

export function createMapLabels(viewer: Viewer, container: HTMLElement): MapLabels {
  let placed: Placed[] = [];
  let shown = 0;
  const onScreen = new Cartesian2();
  // The ground's height at each place asked about so far, so switching units or a layer doesn't ask again.
  const groundHeights = new Map<string, number>();

  viewer.scene.postRender.addEventListener(() => {
    if (placed.length === 0) return;
    const eye = viewer.camera.positionWC;
    const radii = viewer.scene.globe.ellipsoid.radii;
    const view = { width: container.clientWidth, height: container.clientHeight - CREDITS_BAND_PX };
    const boxes = placed.map((item) => {
      const at = !isOverTheHorizon(eye, item.position, radii) ? SceneTransforms.worldToWindowCoordinates(viewer.scene, item.position, onScreen) : undefined;
      if (!at) return null;
      const left = at.x - item.width / 2;
      const top = at.y - item.height - LIFT_PX;
      // Wholly on the map, and wholly above the credits: a label is never half off an edge.
      const inView = left >= 0 && left + item.width <= view.width && top >= 0 && top + item.height <= view.height;
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

  const measure = () => {
    for (const item of placed) {
      // Measured while hidden would be zero: shown for the one reading, before the browser paints.
      const wasHidden = item.node.hidden;
      item.node.hidden = false;
      item.width = item.node.offsetWidth;
      item.height = item.node.offsetHeight;
      item.node.hidden = wasHidden;
    }
  };
  // The web font arrives after the first labels are made, and changes how wide each one is.
  void document.fonts?.ready.then(measure);

  return {
    show(labels) {
      const mine = ++shown;
      placed = labels.map((label) => {
        const node = labelNode(label);
        node.hidden = true; // until the next frame says where it goes
        const ground = groundHeights.get(placeKey(label)) ?? 0;
        return { label, node, position: Cartesian3.fromDegrees(label.lon, label.lat, ground), width: 0, height: 0 };
      });
      container.replaceChildren(...placed.map((item) => item.node));
      measure();
      void liftOntoTheGround(viewer, placed, groundHeights, () => mine === shown);
    },
  };
}

function labelNode(label: MapLabel): HTMLElement {
  const look = label.look === "place" ? undefined : ENCODINGS[label.look];
  const node = html(label.onPick ? "button" : "span", { class: `map-label ${look ? look.cssClass : "map-label-place"}`, title: label.note });
  if (node instanceof HTMLButtonElement) node.type = "button";
  // Not measured: struck through, with the words that say so left standing, as in the sentence.
  node.append(label.look === "not-measured" ? html("s", { text: label.text }) : label.text);
  if (look?.saidAfter) node.append(` ${look.saidAfter}`);
  if (label.note) node.append(html("span", { class: "visually-hidden", text: ` ${label.note}` }));
  if (label.onPick) node.addEventListener("click", label.onPick);
  return node;
}

function placeKey(label: Pick<MapLabel, "lat" | "lon">): string {
  return `${label.lat.toFixed(6)},${label.lon.toFixed(6)}`;
}

/**
 * A label's place starts at height zero, which near the ground puts it tens of metres from the
 * road. The open terrain says how high the ground is there; never the photoreal imagery, which is
 * for looking at only (PLAN.md D5). If the terrain can't say, the labels stay where they are.
 */
async function liftOntoTheGround(viewer: Viewer, placed: Placed[], known: Map<string, number>, stillWanted: () => boolean): Promise<void> {
  const unknown = placed.filter((item) => !known.has(placeKey(item.label)));
  if (unknown.length === 0) return;
  try {
    const ground = await sampleTerrainMostDetailed(
      viewer.terrainProvider,
      unknown.map((item) => Cartographic.fromDegrees(item.label.lon, item.label.lat)),
    );
    unknown.forEach((item, i) => {
      if (!Number.isFinite(ground[i].height)) return;
      known.set(placeKey(item.label), ground[i].height);
      if (stillWanted()) item.position = Cartesian3.fromDegrees(item.label.lon, item.label.lat, ground[i].height);
    });
  } catch {
    // The terrain is best-effort (PLAN.md D16).
  }
}

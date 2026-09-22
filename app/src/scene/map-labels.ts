// Labels laid over the map: the poster's opaque blocks, not text painted into the 3D scene. They
// are ordinary HTML, so they get the poster's type and encodings, can be struck through, and the
// ones that do something are real buttons the keyboard can reach. Each frame they are moved to
// where their place on the course is on screen; where two would overprint, the more important
// one stays (core/declutter.ts) and the other comes back when the runner zooms in.
//
// The map's own credits run along its bottom edge (OpenStreetMap's, and Google's in photoreal).
// No label is ever put there: attributions stay visible (CLAUDE.md).
//
// A label stands where the course line is drawn: on the open terrain's ground while the line is
// draped, at the road's own height while the line is (placement.ts). On a bridge the two are tens
// of metres apart, and a label at the wrong one slides off the line as the camera tilts.
import { Cartesian2, Cartesian3, Cartographic, sampleTerrainMostDetailed, SceneTransforms, type TerrainProvider, type Viewer } from "cesium";
import { keepLabels } from "../core/declutter";
import { type Encoding, ENCODINGS } from "../core/encoding";
import { isOverTheHorizon } from "../core/horizon";
import { html } from "../dom";
import type { Glyph } from "../core/serve-glyphs";
import { glyphNode } from "./glyph-node";
import { type Placement, scenePosition } from "./placement";

export interface MapLabel {
  lat: number;
  lon: number;
  /** The road's height above the ellipsoid there, from the Course Bundle: where the label stands when the course is drawn at road height. */
  ellipsoidHeightM: number;
  text: string;
  /** Marks drawn before the words: what an aid station hands out (core/serve-glyphs.ts). */
  glyphs?: Glyph[];
  /**
   * The kind of claim it makes, drawn as everywhere else; or one of the two looks that are not
   * claims at all: "place" for the start and the finish, which are the course's own, and "chip"
   * for a label that names a point on the course — an aid station (D62).
   */
  look: Encoding | "place" | "chip";
  priority: number;
  /** More, for whoever asks: said by a tooltip, and read out with the label. */
  note?: string;
  /** Makes it a button. */
  onPick?: () => void;
}

export interface MapLabels {
  /** `placement` is how the course line is drawn now: the labels stand where it is. */
  show(labels: MapLabel[], placement: Placement): void;
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

  // The ground can change under the labels: the open terrain arrives (the first labels are made
  // before there is a terrain to ask, and used to stay at height zero for good: 73 m under Berlin's
  // streets), or gives way to the plain ground (plain-ground.ts). What was known of it is forgotten,
  // and draped labels are lifted onto the new one.
  let draped = false;
  viewer.scene.globe.terrainProviderChanged.addEventListener(() => {
    groundHeights.clear();
    if (!draped) return;
    for (const item of placed) item.position = Cartesian3.fromDegrees(item.label.lon, item.label.lat, 0);
    const mine = shown;
    void liftOntoTheGround(viewer, placed, groundHeights, () => mine === shown);
  });

  return {
    show(labels, placement) {
      const mine = ++shown;
      draped = placement === "draped";
      placed = labels.map((label) => {
        const node = labelNode(label);
        node.hidden = true; // until the next frame says where it goes
        const ground = groundHeights.get(placeKey(label)) ?? 0;
        const position = placement === "draped" ? Cartesian3.fromDegrees(label.lon, label.lat, ground) : scenePosition(label, placement);
        return { label, node, position, width: 0, height: 0 };
      });
      container.replaceChildren(...placed.map((item) => item.node));
      measure();
      // At road height the Course Bundle has already said how high each label stands.
      if (placement === "draped") void liftOntoTheGround(viewer, placed, groundHeights, () => mine === shown);
    },
  };
}

function labelNode(label: MapLabel): HTMLElement {
  const look = label.look === "place" || label.look === "chip" ? undefined : ENCODINGS[label.look];
  const plain = label.look === "chip" ? "map-label-chip" : "map-label-place";
  const node = html(label.onPick ? "button" : "span", { class: `map-label ${look ? look.cssClass : plain}`, title: label.note });
  if (node instanceof HTMLButtonElement) node.type = "button";
  // The marks come first and the words after them, so a label still reads without the shapes.
  for (const glyph of label.glyphs ?? []) node.append(glyphNode(glyph, "map-label-glyph"));
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

/** What lifting needs of a label that has been placed: which label it is, and where it stands. */
type Liftable = Pick<Placed, "label" | "position">;

/**
 * A label's place starts at height zero, which near the ground puts it tens of metres from the
 * road. The open terrain says how high the ground is there; never the photoreal imagery, which is
 * for looking at only (PLAN.md D5). If the terrain can't say, the labels stay where they are.
 *
 * The ground can change while the answer is on its way: the open terrain gives way to the plain
 * ground when a top tile fails (plain-ground.ts). An answer from a terrain that has gone is about a
 * ground that is no longer drawn, and is dropped: taken, it left Berlin's labels 73 m up in the air
 * over flat ground, and was remembered. `sample` is CesiumJS's own lookup; a test holds its answer back.
 */
export async function liftOntoTheGround(
  viewer: { terrainProvider: TerrainProvider },
  placed: Liftable[],
  known: Map<string, number>,
  stillWanted: () => boolean,
  sample: (terrain: TerrainProvider, places: Cartographic[]) => Promise<Cartographic[]> = sampleTerrainMostDetailed,
): Promise<void> {
  const unknown = placed.filter((item) => !known.has(placeKey(item.label)));
  if (unknown.length === 0) return;
  const asked = viewer.terrainProvider;
  try {
    const ground = await sample(
      asked,
      unknown.map((item) => Cartographic.fromDegrees(item.label.lon, item.label.lat)),
    );
    if (viewer.terrainProvider !== asked) return;
    unknown.forEach((item, i) => {
      if (!Number.isFinite(ground[i].height)) return;
      known.set(placeKey(item.label), ground[i].height);
      if (stillWanted()) item.position = Cartesian3.fromDegrees(item.label.lon, item.label.lat, ground[i].height);
    });
  } catch {
    // The terrain is best-effort (PLAN.md D16).
  }
}

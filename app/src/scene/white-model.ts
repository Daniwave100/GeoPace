// The White model in the 3D scene: the city's real buildings along the course as plain white
// blocks, with the shadows the sun casts through them at the moment the runner reaches each
// kilometre (PLAN.md D30, §6 "Street model").
//
// The shadows are true, which is the whole point of the keyless look (D4): the geometry is ours,
// from each city's own open data, and the sun is computed from the race clock, so a shadow on
// screen is the shadow that will be there on race day. Photoreal's shadows were photographed
// whenever the plane flew and can only ever be decoration.
//
// Every height here is metres above the WGS84 ellipsoid, straight out of the White model's file
// (the pipeline has already added the geoid offset, PLAN.md D51). Nothing is read from, or rested
// on, Google's surface (D5): while photoreal has the ground's place, these blocks step aside
// entirely, because the city standing there is then Google's.
import { Cartesian3, Color, Material, MaterialAppearance, PolygonGeometry, PolygonHierarchy, Primitive, GeometryInstance, ShadowMode, type Viewer } from "cesium";
import type { WhiteModel } from "../bundle/white-model";
import type { Theme } from "../core/theme";
import { DEFAULT_WHITE_MODEL, SHADOW_QUALITY, type WhiteModelChoice } from "../core/white-model";

/**
 * How far below its measured ground each block is started.
 *
 * The blocks stand on the city's own survey; the keyless map's ground is worldwide open terrain,
 * good to a few metres and no more (PLAN.md §5). Where the two disagree by a metre a block would
 * hover over the map with daylight under it. Started well under the ground, it never can: the
 * skirt is buried, it is never seen, and the roof — which is what casts the shadow — is untouched.
 */
const SKIRT_M = 25;

/**
 * The blocks' one colour, in each theme. The poster's street model is white blocks with solid
 * shadows (PLAN.md §6); the sun does the rest, because a face turned away from it comes out
 * darker on its own, which is what makes a block read as a block.
 *
 * In the dark theme the map itself is dimmed (scene/globe.ts) so that the course is the brightest
 * thing on screen, and a white city would undo that: the blocks go to a grey that still reads as
 * the same model, and the shadows lighten so they are not black on black.
 */
const BLOCK_LOOK: Record<Theme, { face: string; shadowDarkness: number }> = {
  light: { face: "#f7f7f4", shadowDarkness: 0.28 },
  dark: { face: "#8e8e88", shadowDarkness: 0.5 },
};

export interface WhiteModelInScene {
  /** The buildings for the course that is showing, or null while it has none (or they haven't arrived). */
  show(model: WhiteModel | null): void;
  /** How much of it the computer is asked to draw, and which way up the theme is. */
  look(choice: WhiteModelChoice, theme: Theme): void;
  /** Photoreal has taken the ground's place, or given it back: the city there is Google's, so ours steps aside. */
  standAside(aside: boolean): void;
}

export function createWhiteModel(viewer: Viewer): WhiteModelInScene {
  const face = Material.fromType("Color", { color: Color.fromCssColorString(BLOCK_LOOK.light.face) });
  let blocks: Primitive | undefined;
  let drawn: WhiteModel | null = null; // the model `blocks` was built from
  let wanted: WhiteModel | null = null;
  let choice: WhiteModelChoice = DEFAULT_WHITE_MODEL;
  let theme: Theme = "light";
  let aside = false;
  let shadowMapSize = 0; // what the shadow map was last resized to; resizing throws its textures away

  function showBlocks(): void {
    const on = wanted !== null && choice.buildings === "on" && !aside;
    if (!on) {
      if (blocks) viewer.scene.primitives.remove(blocks); // remove() destroys it: the geometry is big
      blocks = undefined;
      drawn = null;
    } else if (drawn !== wanted) {
      if (blocks) viewer.scene.primitives.remove(blocks);
      blocks = viewer.scene.primitives.add(buildBlocks(wanted as WhiteModel, face));
      drawn = wanted;
    }
    showFace();
    showShadows();
  }

  /** The blocks' one colour, which follows the theme whether or not the shadows are on. */
  function showFace(): void {
    face.uniforms.color = Color.fromCssColorString(BLOCK_LOOK[theme].face);
  }

  function showShadows(): void {
    const scene = viewer.scene;
    const quality = choice.shadows === "off" ? null : SHADOW_QUALITY[choice.shadows];
    const on = blocks !== undefined && quality !== null;
    scene.shadowMap.enabled = on;
    // The ground catches the buildings' shadows; it casts none of its own, which would be the
    // whole globe drawn a second time for a hill neither city has.
    viewer.terrainShadows = on ? ShadowMode.RECEIVE_ONLY : ShadowMode.DISABLED;
    if (!on || !quality) return;
    if (shadowMapSize !== quality.size) {
      scene.shadowMap.size = quality.size;
      shadowMapSize = quality.size;
    }
    scene.shadowMap.softShadows = quality.soft;
    scene.shadowMap.maximumDistance = quality.withinM;
    scene.shadowMap.darkness = BLOCK_LOOK[theme].shadowDarkness;
  }

  return {
    show(model) {
      wanted = model;
      showBlocks();
    },
    look(nextChoice, nextTheme) {
      choice = nextChoice;
      theme = nextTheme;
      showBlocks();
    },
    standAside(next) {
      if (aside === next) return;
      aside = next;
      showBlocks();
    },
  };
}

/**
 * Every block as one lump of geometry. CesiumJS puts the outlines together off the main thread
 * (`asynchronous`), so the page keeps answering while a city's worth of them is built, and the
 * blocks appear when they are ready.
 */
function buildBlocks(model: WhiteModel, face: Material): Primitive {
  const { base_m, roof_m, ring } = model.buildings;
  const instances: GeometryInstance[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    instances.push(
      new GeometryInstance({
        geometry: new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(ring[i])),
          height: base_m[i] - SKIRT_M,
          extrudedHeight: roof_m[i],
          vertexFormat: MaterialAppearance.MaterialSupport.BASIC.vertexFormat,
          // The top is the roof the sun lands on; the bottom is buried under the skirt and is
          // never seen, so it is never built.
          closeTop: true,
          closeBottom: false,
        }),
      }),
    );
  }
  return new Primitive({
    geometryInstances: instances,
    appearance: new MaterialAppearance({ material: face, materialSupport: MaterialAppearance.MaterialSupport.BASIC, closed: true, translucent: false }),
    shadows: ShadowMode.ENABLED,
    asynchronous: true,
    releaseGeometryInstances: true, // the outlines are the app's biggest lump of data; only the mesh is kept
  });
}

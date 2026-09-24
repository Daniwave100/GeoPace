// The White model in the 3D scene: the city's real buildings along the course as plain white
// blocks, with the shadows the sun casts through them at the moment the runner reaches each
// kilometre (PLAN.md D30, §6 "Street model").
//
// Its trees stand beside them as crowns: a patch of leaves with a top and an underside, floating
// where the leaves are and nothing where the trunk is, which is what lets the low sun of both race
// mornings come in underneath them exactly as the shade table says it does. They are drawn in the
// poster's halftone (PLAN.md D28) — white, printed in dots — so a tree cannot be mistaken for a
// building, and the same halftone says the same thing on the strip, on the course line and in the
// sentence (core/encoding.ts).
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
import { heightAboveGround } from "./globe";
import type { Theme } from "../core/theme";
import { HALFTONE_PITCH_PX } from "../core/mark-look";
import { DEFAULT_WHITE_MODEL, SHADOWS, shadowDistanceM, type WhiteModelChoice } from "../core/white-model";

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
const BLOCK_LOOK: Record<Theme, { face: string; shadowDarkness: number; leafDot: string }> = {
  // A roof turned to the sun is the brightest thing on screen after the course, a shade over the
  // paper it stands on, so the blocks read against the ground without an outline round them.
  // `leafDot` is the ink of the halftone the crowns are printed in: the same face, dotted.
  light: { face: "#ffffff", shadowDarkness: 0.26, leafDot: "#9c9c95" },
  dark: { face: "#9c9c95", shadowDarkness: 0.45, leafDot: "#5a5a55" },
};

/**
 * The crowns' halftone, as a material of our own: the block's own face, printed in dots.
 *
 * Screen-space, which is what a halftone is — dots in the plane of the paper, the same size
 * wherever the thing they are printing happens to be. `dotPx` is one dot and its white together.
 */
const CROWN_MATERIAL = "GeoPaceCrown";
/** One dot and its white together: the one screen the course line's leafy rim is printed in too (core/mark-look.ts). */
const CROWN_DOT_PX = HALFTONE_PITCH_PX;
const CROWN_SOURCE = `
uniform vec4 faceColor;
uniform vec4 dotColor;
uniform float dotPx;

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec2 inCell = fract(gl_FragCoord.xy / (dotPx * czm_pixelRatio)) - 0.5;
    float inDot = 1.0 - smoothstep(0.22, 0.30, length(inCell));
    vec4 color = czm_gammaCorrect(mix(faceColor, dotColor, inDot));
    material.diffuse = color.rgb;
    material.alpha = 1.0;
    return material;
}
`;

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
  // Making one material of a new type is CesiumJS's public way of registering the type; the
  // crowns then ask for it by name. It needs a browser, which is why it is made here and not at
  // the top of the module.
  const leaves = new Material({
    fabric: {
      type: CROWN_MATERIAL,
      uniforms: { faceColor: Color.fromCssColorString(BLOCK_LOOK.light.face), dotColor: Color.fromCssColorString(BLOCK_LOOK.light.leafDot), dotPx: CROWN_DOT_PX },
      source: CROWN_SOURCE,
    },
  });
  let crowns: Primitive | undefined;
  let blocks: Primitive | undefined;
  let drawn: WhiteModel | null = null; // the model `blocks` was built from
  let wanted: WhiteModel | null = null;
  let choice: WhiteModelChoice = DEFAULT_WHITE_MODEL;
  let theme: Theme = "light";
  let aside = false;
  let shadowMapSize = 0; // what the shadow map was last resized to; resizing throws its textures away
  let shadowReachM = 0; // how far the shadows were last told to reach, so it is set only when it changes
  // The camera moves every frame of a Ride, so the reach is checked every frame; it is one
  // lookup of the ground under the camera, and the answer is stepped, so it rarely changes anything.
  viewer.scene.preRender.addEventListener(() => {
    if (viewer.scene.shadowMap.enabled) followTheCamera();
  });

  function showBlocks(): void {
    const on = wanted !== null && choice.buildings === "on" && !aside;
    if (!on) {
      if (blocks) viewer.scene.primitives.remove(blocks); // remove() destroys it: the geometry is big
      if (crowns) viewer.scene.primitives.remove(crowns);
      blocks = crowns = undefined;
      drawn = null;
    } else if (drawn !== wanted) {
      if (blocks) viewer.scene.primitives.remove(blocks);
      if (crowns) viewer.scene.primitives.remove(crowns);
      const model = wanted as WhiteModel;
      blocks = viewer.scene.primitives.add(buildBlocks(model, face));
      crowns = model.trees && model.trees.ring.length > 0 ? viewer.scene.primitives.add(buildCrowns(model, leaves)) : undefined;
      drawn = wanted;
    }
    showFace();
    showShadows();
  }

  /** The blocks' one colour and the crowns' two, which follow the theme whether or not the shadows are on. */
  function showFace(): void {
    face.uniforms.color = Color.fromCssColorString(BLOCK_LOOK[theme].face);
    leaves.uniforms.faceColor = Color.fromCssColorString(BLOCK_LOOK[theme].face);
    leaves.uniforms.dotColor = Color.fromCssColorString(BLOCK_LOOK[theme].leafDot);
  }

  function showShadows(): void {
    const scene = viewer.scene;
    const on = blocks !== undefined && choice.shadows === "on";
    scene.shadowMap.enabled = on;
    // The ground catches the buildings' shadows; it casts none of its own, which would be the
    // whole globe drawn a second time for a hill neither city has.
    viewer.terrainShadows = on ? ShadowMode.RECEIVE_ONLY : ShadowMode.DISABLED;
    if (!on) return;
    if (shadowMapSize !== SHADOWS.size) {
      scene.shadowMap.size = SHADOWS.size;
      shadowMapSize = SHADOWS.size;
    }
    scene.shadowMap.softShadows = SHADOWS.soft;
    scene.shadowMap.darkness = BLOCK_LOOK[theme].shadowDarkness;
    followTheCamera();
  }

  /**
   * How far the shadows reach, kept in step with how high the camera is (issue #39): the one
   * shadow map is spread over everything between the camera and this distance, so a distance that
   * stood still while the camera moved would be coarse on the road and short from the air.
   */
  function followTheCamera(): void {
    const wanted = shadowDistanceM(heightAboveGround(viewer));
    if (wanted === shadowReachM) return;
    shadowReachM = wanted;
    viewer.scene.shadowMap.maximumDistance = wanted;
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

/**
 * The crowns, as one more lump of geometry: a slab of leaves from the underside to the top, and
 * nothing at all beneath it. No skirt, unlike a block — the gap under a crown is the whole point,
 * and it is where the low sun of both race mornings gets through (PLAN.md D60).
 */
function buildCrowns(model: WhiteModel, leaves: Material): Primitive {
  const { underside_m, top_m, ring } = model.trees as NonNullable<WhiteModel["trees"]>;
  const instances: GeometryInstance[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    instances.push(
      new GeometryInstance({
        geometry: new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(ring[i])),
          height: underside_m[i],
          extrudedHeight: top_m[i],
          vertexFormat: MaterialAppearance.MaterialSupport.BASIC.vertexFormat,
          // Both faces: a runner under a tree is looking up at the underside of it.
          closeTop: true,
          closeBottom: true,
        }),
      }),
    );
  }
  return new Primitive({
    geometryInstances: instances,
    appearance: new MaterialAppearance({ material: leaves, materialSupport: MaterialAppearance.MaterialSupport.BASIC, closed: true, translucent: false }),
    shadows: ShadowMode.ENABLED,
    asynchronous: true,
    releaseGeometryInstances: true,
  });
}

// One line that paints the whole cross-section of the course along a stretch: the blue down the
// middle with its thin white edge and, where layers mark the stretch, their marks beside it — the
// rim hugging the blue (shade) and the band outside it (a hill), each with its dashes or dots and
// its hairline edge (core/mark-look.ts says what those are). Two slots, one line (PLAN.md D62).
//
// Why one line and not a wide mark with the blue line laid over it, which is how the draped map
// was first drawn: at the road's own height the line may show through whatever stands in front of
// it (scene/placement.ts), and CesiumJS draws "shows through" by painting a line over everything
// that is nearer than it. A mark under the blue would be painted over the blue. One line has
// nothing over it and nothing under it, and looks the same draped and at road height.
//
// At road height the same line also decides how strong it is where something stands in front of
// it. CesiumJS asks "is this hidden?" pixel by pixel, and that goes wrong for a line that is flat
// to the camera over a road that recedes: at a tilt the road itself is nearer than the lower half
// of a wide line, so that half came out faded and the other half solid (the owner's screenshots,
// 09-18). So the line asks once, at its own middle, for its whole width: how far clear of me is
// whatever is drawn there? The road, a parked lorry, a surface that disagrees with the survey by a
// metre: not behind anything. A tree, a tower, the deck above, a building: behind it, and fainter.
// It reads that from the depth of the scene CesiumJS has already drawn. That is knowing what is in
// front of our own line on screen, for drawing it; nothing is kept, worked out or placed from it
// (PLAN.md D5).
//
// It is a CesiumJS material of our own (a "Fabric" material: a few lines of shader), which the
// browser's graphics card compiles; so it is registered by the map when it starts, never in a test.
import { Color, Event, type JulianDate, Material, type MaterialProperty } from "cesium";
import { HALFTONE_PITCH_PX, type MarkLook, PLAIN, type RibbonLook, rimDotRadius, sameLook } from "../core/mark-look";

/** Two materials from one shader: draped is paint on the ground; at road height the line can be behind things. */
const TYPE_DRAPED = "GeoPaceCourseRibbon";
const TYPE_AT_ROAD_HEIGHT = "GeoPaceCourseRibbonAtRoadHeight";

/**
 * Nearer than this to the line, whatever is in front of it is the road it lies on (or a bump in it,
 * or the survey and the photograph disagreeing): the line is as strong as ever. Further than the
 * second, it is something standing over the road, and the line is as faint as it gets. Metres,
 * measured square to the surface in front. 🟡 Claude's numbers; nobody can judge them without imagery.
 */
const CLEAR_OF_THE_LINE_M = [1.0, 3.0];
/**
 * From far enough away that a pixel spans metres, "behind a tree" means nothing: the line is
 * simply drawn. Between these two sizes of a pixel, in metres, the fading is eased out.
 */
const TOO_FAR_TO_TELL_M_PER_PX = [2.0, 4.0];

/** The poster's blue, the same in both themes on the map: the map itself doesn't change with the theme. */
export const COURSE_BLUE = "#1546ff";
/** A thin white edge keeps the blue readable on any ground: a pale map, dark imagery, water. */
export const COURSE_EDGE = "#ffffff";
/** The plain course: 4 px of blue with 1 px of white each side, as the owner approved it (PLAN.md D32). */
export const COURSE_WIDTH_PX = 6;
const COURSE_EDGE_PX = 1;
/** One dash and one gap, in pixels on screen: dashes stay the same size at any zoom. */
const DASH_AND_GAP_PX = 14;

/**
 * Pixels are measured outwards from the middle of the line, stripe by stripe: the blue, its white
 * edge, the rim and its hairline, the band with its dashes and its inset, and the outer hairline.
 * A stripe that isn't there has no width and the colour of the one after it, so it paints nothing.
 * Every colour is mixed into the next over one pixel, so no edge is jagged.
 */
const SOURCE = `
uniform vec4 coreColor;
uniform vec4 coreEdgeColor;
uniform float coreEndPx;
uniform float coreEdgeEndPx;
uniform vec4 rimColor;
uniform vec4 rimDotColor;
uniform float rimDotRadius;
uniform float halftonePitchPx;
uniform float rimEndPx;
uniform vec4 rimEdgeColor;
uniform float rimEdgeEndPx;
uniform vec4 bandColor;
uniform vec4 dashColor;
uniform float dashShare;
uniform float dashEndPx;
uniform vec4 edgeColor;
uniform float edgePx;
uniform float dashAndGapPx;
#ifdef AT_ROAD_HEIGHT
uniform float behindStrength;
#endif

in float v_width;
in float v_polylineAngle;

mat2 rotate(float rad) {
    float c = cos(rad);
    float s = sin(rad);
    return mat2(c, s, -s, c);
}

#ifdef AT_ROAD_HEIGHT
// How far from the camera the scene already drawn is at a pixel, in metres along the view.
float sceneDistanceM(vec2 pixel) {
    float depth = czm_unpackDepth(texture(czm_globeDepthTexture, pixel / czm_viewport.zw));
    if (depth <= 0.0 || depth >= 1.0) {
        return 1.0e10; // nothing drawn there: sky. (CesiumJS packs "as far as can be" as 0, and reads it so itself.)
    }
    vec4 eye = czm_windowToEyeCoordinates(pixel, depth);
    return -eye.z / eye.w;
}

// Of the slopes either side of a pixel, the gentler: a building's edge on one side doesn't count.
float gentler(float before, float after) {
    return abs(before) < abs(after) ? before : after;
}

// 0 where nothing stands in front of the line, 1 where something clearly does, judged at the
// middle of the line so that the whole width gets one answer.
float behindSomething(vec2 st) {
    // The middle of the line on screen: st.t runs 0 to 1 across the width, so its slope on screen
    // points across the line and says how many pixels wide it is.
    vec2 across = vec2(dFdx(st.t), dFdy(st.t));
    vec2 middle = gl_FragCoord.xy - across * ((st.t - 0.5) / max(dot(across, across), 1.0e-8));

    float lineM = 1.0 / gl_FragCoord.w;
    float pixelM = czm_metersPerPixel(vec4(0.0, 0.0, -lineM, 1.0));
    float sceneM = sceneDistanceM(middle);
    float inFrontM = lineM - sceneM;

    // "In front along the view" is not "clear of the line": looking along a road, a surface one
    // metre above the line is many metres nearer. How fast the scene recedes from pixel to pixel
    // gives its slope to the view, and with it the distance square to the surface.
    float recedesX = gentler(sceneM - sceneDistanceM(middle - vec2(1.0, 0.0)), sceneDistanceM(middle + vec2(1.0, 0.0)) - sceneM);
    float recedesY = gentler(sceneM - sceneDistanceM(middle - vec2(0.0, 1.0)), sceneDistanceM(middle + vec2(0.0, 1.0)) - sceneM);
    float recedesM = length(vec2(recedesX, recedesY));
    float clearM = inFrontM * pixelM / sqrt(pixelM * pixelM + recedesM * recedesM);

    float behind = smoothstep(CLEAR_FROM_M, CLEAR_TO_M, clearM);
    return behind * (1.0 - smoothstep(TOO_FAR_FROM_M, TOO_FAR_TO_M, pixelM));
}
#endif

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    float fromMiddlePx = abs(materialInput.st.t - 0.5) * v_width;

    // The band's dashes are counted along the line on screen, the way CesiumJS's own dashed line does it.
    vec2 alongLine = rotate(v_polylineAngle) * gl_FragCoord.xy;
    float along = fract(alongLine.x / (dashAndGapPx * czm_pixelRatio));
    vec4 beside = mix(bandColor, vec4(dashColor.rgb, 1.0), step(along, dashShare) * dashColor.a);
    // The rim's halftone is a screen fixed to the paper — the crowns' own (scene/white-model.ts) —
    // not counted along the line: the draped line's angle is recomputed at every 10 m segment, so
    // anything counted along it restarts its phase three times a pixel at the whole-course zoom,
    // which is static (core/mark-look.ts). A solid rim has a radius of 0 and no dots.
    vec2 inCell = fract(gl_FragCoord.xy / (halftonePitchPx * czm_pixelRatio)) - 0.5;
    float inDot = (1.0 - smoothstep(rimDotRadius - 0.04, rimDotRadius + 0.04, length(inCell))) * step(0.001, rimDotRadius);
    vec4 rimBeside = mix(rimColor, vec4(rimDotColor.rgb, 1.0), inDot * rimDotColor.a);

    vec4 color = coreColor;
    color = mix(color, coreEdgeColor, smoothstep(coreEndPx - 0.5, coreEndPx + 0.5, fromMiddlePx));
    color = mix(color, rimBeside, smoothstep(coreEdgeEndPx - 0.5, coreEdgeEndPx + 0.5, fromMiddlePx));
    color = mix(color, rimEdgeColor, smoothstep(rimEndPx - 0.5, rimEndPx + 0.5, fromMiddlePx));
    color = mix(color, beside, smoothstep(rimEdgeEndPx - 0.5, rimEdgeEndPx + 0.5, fromMiddlePx));
    color = mix(color, bandColor, smoothstep(dashEndPx - 0.5, dashEndPx + 0.5, fromMiddlePx));
    float edgeStartPx = 0.5 * v_width - edgePx;
    color = mix(color, edgeColor, smoothstep(edgeStartPx - 0.5, edgeStartPx + 0.5, fromMiddlePx));

    color = czm_gammaCorrect(color);
    material.diffuse = color.rgb;
    material.alpha = color.a;
#ifdef AT_ROAD_HEIGHT
    material.alpha *= mix(1.0, behindStrength, behindSomething(materialInput.st));
#endif
    return material;
}
`;

const AT_ROAD_HEIGHT_DEFINES = `
#define AT_ROAD_HEIGHT
#define CLEAR_FROM_M ${CLEAR_OF_THE_LINE_M[0].toFixed(1)}
#define CLEAR_TO_M ${CLEAR_OF_THE_LINE_M[1].toFixed(1)}
#define TOO_FAR_FROM_M ${TOO_FAR_TO_TELL_M_PER_PX[0].toFixed(1)}
#define TOO_FAR_TO_M ${TOO_FAR_TO_TELL_M_PER_PX[1].toFixed(1)}
`;

/** Tell CesiumJS about the material. Needs a browser (CesiumJS builds materials with a canvas at hand), so the map calls it once as it starts. */
export function registerCourseRibbon(): void {
  // Making one material of a new type is CesiumJS's public way of registering the type; every
  // stretch of the course then asks for it by name.
  new Material({ fabric: { type: TYPE_DRAPED, uniforms: uniformsFor(PLAIN, null), source: SOURCE } });
  new Material({ fabric: { type: TYPE_AT_ROAD_HEIGHT, uniforms: uniformsFor(PLAIN, 1), source: AT_ROAD_HEIGHT_DEFINES + SOURCE } });
}

/** Each side of the line, stripe by stripe: where every boundary falls, in pixels from the middle. */
function boundaries(look: RibbonLook) {
  const coreEndPx = COURSE_WIDTH_PX / 2 - COURSE_EDGE_PX;
  const coreEdgeEndPx = COURSE_WIDTH_PX / 2;
  const rimEndPx = coreEdgeEndPx + (look.rim?.widthPx ?? 0);
  const rimEdgeEndPx = rimEndPx + (look.rim?.edgePx ?? 0);
  const dashEndPx = rimEdgeEndPx + (look.band ? look.band.widthPx - (look.band.gap === null ? 0 : look.band.dashInsetPx) : 0);
  const bandEndPx = rimEdgeEndPx + (look.band?.widthPx ?? 0);
  const edgePx = look.band?.edgePx ?? 0;
  return { coreEndPx, coreEdgeEndPx, rimEndPx, rimEdgeEndPx, dashEndPx, bandEndPx, edgePx, halfPx: bandEndPx + edgePx };
}

/** How wide the line for a stretch is: the plain course, or the course with its marks beside it. */
export function ribbonWidthPx(look: RibbonLook | null): number {
  return 2 * boundaries(look ?? PLAIN).halfPx;
}

/**
 * What CesiumJS's entities take as a line's material. `look` is how the layers' marks on this
 * stretch are drawn, both slots, or null for the plain course. `behindStrength` is for a line at
 * road height: how strong it still is where something stands in front of it, from 0 (hidden) to
 * 1 (as if nothing were there). null for a draped line, which is paint on the ground and behind nothing.
 */
export class CourseRibbonProperty implements MaterialProperty {
  readonly isConstant = true;
  readonly definitionChanged = new Event();
  readonly look: RibbonLook;

  constructor(look: RibbonLook | null, readonly behindStrength: number | null) {
    this.look = look ?? PLAIN;
  }

  getType(_time?: JulianDate): string {
    return this.behindStrength === null ? TYPE_DRAPED : TYPE_AT_ROAD_HEIGHT;
  }

  getValue(_time?: JulianDate, result: Record<string, unknown> = {}): Record<string, unknown> {
    return Object.assign(result, uniformsFor(this.look, this.behindStrength));
  }

  /** CesiumJS draws lines whose materials are equal in one go, so this is worth getting right: ten shades of hill, not 327 lines. */
  equals(other?: unknown): boolean {
    return other instanceof CourseRibbonProperty && other.behindStrength === this.behindStrength && sameLook(other.look.band, this.look.band) && sameLook(other.look.rim, this.look.rim);
  }
}

/** A solid stripe is its colour throughout, with no dashes at all; a dashed one is the colour between the dashes, and the dashes are drawn over it. */
function stripeColors(look: MarkLook): { fill: Color; dash: Color; dashShare: number } {
  const dashed = look.gap !== null;
  return { fill: Color.fromCssColorString(look.gap ?? look.color), dash: dashed ? Color.fromCssColorString(look.color) : Color.TRANSPARENT, dashShare: dashed ? look.dashShare : 0 };
}

function uniformsFor(look: RibbonLook, behindStrength: number | null): Record<string, unknown> {
  const px = boundaries(look);
  const edge = Color.fromCssColorString(COURSE_EDGE);
  // Each stripe that isn't there takes the colour of the next, so it paints nothing where it has
  // no width — and the plain course ends in its own white edge.
  const band = look.band ? stripeColors(look.band) : { fill: edge, dash: Color.TRANSPARENT, dashShare: 0 };
  const bandEdge = look.band ? Color.fromCssColorString(look.band.edge) : band.fill;
  const rim = look.rim ? stripeColors(look.rim) : { fill: band.fill, dash: band.dash, dashShare: 0 };
  const rimEdge = look.rim ? Color.fromCssColorString(look.rim.edge) : band.fill;
  return {
    coreColor: Color.fromCssColorString(COURSE_BLUE),
    coreEdgeColor: edge,
    coreEndPx: px.coreEndPx,
    coreEdgeEndPx: px.coreEdgeEndPx,
    rimColor: rim.fill,
    rimDotColor: rim.dash,
    // For the rim, `dashShare` is the paper's share of the area under the halftone screen.
    rimDotRadius: rim.dashShare > 0 ? rimDotRadius(rim.dashShare) : 0,
    halftonePitchPx: HALFTONE_PITCH_PX,
    rimEndPx: px.rimEndPx,
    rimEdgeColor: rimEdge,
    rimEdgeEndPx: px.rimEdgeEndPx,
    bandColor: band.fill,
    dashColor: band.dash,
    dashShare: band.dashShare,
    dashEndPx: px.dashEndPx,
    edgeColor: bandEdge,
    edgePx: px.edgePx,
    dashAndGapPx: DASH_AND_GAP_PX,
    ...(behindStrength === null ? {} : { behindStrength }),
  };
}

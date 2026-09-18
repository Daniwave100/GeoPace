// One line that paints the whole cross-section of the course along a stretch: the blue down the
// middle with its thin white edge and, where a layer marks the stretch, the mark's band beside it,
// its dashes, and its hairline edge (core/mark-look.ts says what those are).
//
// Why one line and not a wide mark with the blue line laid over it, which is how the draped map
// was first drawn: at the road's own height the line may show through whatever stands in front of
// it (scene/placement.ts), and CesiumJS draws "shows through" by painting a line over everything
// that is nearer than it. A mark under the blue would be painted over the blue. One line has
// nothing over it and nothing under it, and looks the same draped and at road height.
//
// It is a CesiumJS material of our own (a "Fabric" material: a few lines of shader), which the
// browser's graphics card compiles; so it is registered by the map when it starts, never in a test.
import { Color, Event, type JulianDate, Material, type MaterialProperty } from "cesium";
import type { MarkLook } from "../core/mark-look";

const TYPE = "GeoPaceCourseRibbon";

/** The poster's blue, the same in both themes on the map: the map itself doesn't change with the theme. */
export const COURSE_BLUE = "#1546ff";
/** A thin white edge keeps the blue readable on any ground: a pale map, dark imagery, water. */
const COURSE_EDGE = "#ffffff";
/** The plain course: 4 px of blue with 1 px of white each side, as the owner approved it (PLAN.md D32). */
export const COURSE_WIDTH_PX = 6;
const COURSE_EDGE_PX = 1;
/** One dash and one gap, in pixels on screen: dashes stay the same size at any zoom. */
const DASH_AND_GAP_PX = 14;

/** Pixels are measured outwards from the middle of the line. Every colour is mixed into the next over one pixel, so no edge is jagged. */
const SOURCE = `
uniform vec4 coreColor;
uniform vec4 coreEdgeColor;
uniform float coreEndPx;
uniform float coreEdgeEndPx;
uniform vec4 bandColor;
uniform vec4 dashColor;
uniform float dashEndPx;
uniform vec4 edgeColor;
uniform float edgePx;
uniform float dashAndGapPx;
uniform float strength;

in float v_width;
in float v_polylineAngle;

mat2 rotate(float rad) {
    float c = cos(rad);
    float s = sin(rad);
    return mat2(c, s, -s, c);
}

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    float fromMiddlePx = abs(materialInput.st.t - 0.5) * v_width;

    // Dashes are counted along the line on screen, the way CesiumJS's own dashed line does it.
    vec2 alongLine = rotate(v_polylineAngle) * gl_FragCoord.xy;
    float inDash = step(fract(alongLine.x / (dashAndGapPx * czm_pixelRatio)), 0.5) * dashColor.a;
    vec4 beside = mix(bandColor, vec4(dashColor.rgb, 1.0), inDash);

    vec4 color = coreColor;
    color = mix(color, coreEdgeColor, smoothstep(coreEndPx - 0.5, coreEndPx + 0.5, fromMiddlePx));
    color = mix(color, beside, smoothstep(coreEdgeEndPx - 0.5, coreEdgeEndPx + 0.5, fromMiddlePx));
    color = mix(color, bandColor, smoothstep(dashEndPx - 0.5, dashEndPx + 0.5, fromMiddlePx));
    float edgeStartPx = 0.5 * v_width - edgePx;
    color = mix(color, edgeColor, smoothstep(edgeStartPx - 0.5, edgeStartPx + 0.5, fromMiddlePx));

    color = czm_gammaCorrect(color);
    material.diffuse = color.rgb;
    material.alpha = color.a * strength;
    return material;
}
`;

/** Tell CesiumJS about the material. Needs a browser (CesiumJS builds materials with a canvas at hand), so the map calls it once as it starts. */
export function registerCourseRibbon(): void {
  // Making one material of a new type is CesiumJS's public way of registering the type; every
  // stretch of the course then asks for it by name.
  new Material({ fabric: { type: TYPE, uniforms: uniformsFor(null, 1), source: SOURCE } });
}

/** How wide the line for a stretch is: the plain course, or as wide as the layer's mark. */
export function ribbonWidthPx(mark: MarkLook | null): number {
  return mark ? mark.widthPx : COURSE_WIDTH_PX;
}

/**
 * What CesiumJS's entities take as a line's material. `strength` is 1 for the line as it is, less
 * for what is left of it where something stands in front (placement.ts).
 */
export class CourseRibbonProperty implements MaterialProperty {
  readonly isConstant = true;
  readonly definitionChanged = new Event();

  constructor(
    readonly mark: MarkLook | null,
    readonly strength: number,
  ) {}

  getType(_time?: JulianDate): string {
    return TYPE;
  }

  getValue(_time?: JulianDate, result: Record<string, unknown> = {}): Record<string, unknown> {
    return Object.assign(result, uniformsFor(this.mark, this.strength));
  }

  /** CesiumJS draws lines whose materials are equal in one go, so this is worth getting right: ten shades of hill, not 327 lines. */
  equals(other?: unknown): boolean {
    return other instanceof CourseRibbonProperty && other.strength === this.strength && JSON.stringify(other.mark) === JSON.stringify(this.mark);
  }
}

function uniformsFor(mark: MarkLook | null, strength: number): Record<string, unknown> {
  const core = {
    coreColor: Color.fromCssColorString(COURSE_BLUE),
    coreEdgeColor: Color.fromCssColorString(COURSE_EDGE),
    coreEndPx: COURSE_WIDTH_PX / 2 - COURSE_EDGE_PX,
    coreEdgeEndPx: COURSE_WIDTH_PX / 2,
    dashAndGapPx: DASH_AND_GAP_PX,
    strength,
  };
  // The plain course: nothing beside the white edge, so "beside" is more of the white edge.
  if (!mark) return { ...core, bandColor: core.coreEdgeColor, dashColor: Color.TRANSPARENT, dashEndPx: COURSE_WIDTH_PX / 2, edgeColor: core.coreEdgeColor, edgePx: 0 };
  // A mark's edge is `edgePx` in all, half on each side, as CesiumJS's own outlined line counts it.
  const edgePx = mark.edgePx / 2;
  const dashed = mark.gap !== null;
  return {
    ...core,
    // A solid mark is its colour right up to the edge. A dashed one is a band in the colour
    // between the dashes, with the dashes stopping short of the edge by the rim (mark-look.ts).
    bandColor: Color.fromCssColorString(dashed ? (mark.gap as string) : mark.color),
    dashColor: dashed ? Color.fromCssColorString(mark.color) : Color.TRANSPARENT,
    dashEndPx: mark.widthPx / 2 - edgePx - (dashed ? mark.rimPx : 0),
    edgeColor: Color.fromCssColorString(mark.edge),
    edgePx,
  };
}

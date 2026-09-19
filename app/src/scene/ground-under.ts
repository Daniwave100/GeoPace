// How high the ground is under a place on the map, for the map's own moves: how big a zoom or a
// pan step is, how far off "Where I am" stands, and where "Straight down" finds the middle of the
// map. Always from our own data, never from photoreal imagery (PLAN.md D5).
//
// On the keyless map that is our open terrain, as far as the globe has loaded it. While photoreal
// imagery has the plain ground's place the globe is hidden, and a hidden globe loads nothing more,
// yet still answers, from whatever it has: over a course it never drew that is its top tile, whose
// flat triangles sag two kilometres under the curved surface. Then the ground is the road's own
// height from the Course Bundle, where the runner is: right on the road, and within some tens of
// metres anywhere else on either course, which is all a step's size or a tilted view needs.
import type { Cartographic } from "cesium";

/** As much of CesiumJS's globe as this touches. */
export interface GroundOfTheMap {
  show: boolean;
  getHeight(place: Cartographic): number | undefined;
}

/** Metres above the ellipsoid. `roadWhenHidden` is the Course Bundle's height of the road where the runner is, if a course is on screen. */
export function groundUnderM(globe: GroundOfTheMap, place: Cartographic, roadWhenHidden: (() => number | undefined) | undefined): number {
  if (!globe.show) return roadWhenHidden?.() ?? 0;
  return globe.getHeight(place) ?? 0;
}

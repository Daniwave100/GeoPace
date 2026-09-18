// How long a shadow is, and which way it points.
//
// Shadows are the hero of analysis mode (PLAN.md D15), so they are computed, never art-directed.
// The geometry is the simple case — flat ground, parallel sunlight — which is all a massing model
// of a few city blocks needs.
import type { SunPosition } from "./solar";

/**
 * Past about 1.4° of altitude a shadow runs off any drawing surface, so it is capped. Long is
 * long; the exact number stops mattering long before the sun reaches the horizon.
 */
const MAX_LENGTH_PER_METER = 40;

export interface ShadowCast {
  /** Whether the sun is up at all. When false nothing is lit and nothing casts. */
  isLit: boolean;
  /** Metres of shadow per metre of height. 1 when the sun is 45° up. */
  lengthPerMeter: number;
  /** Where the shadow points, degrees clockwise from true north — directly away from the sun. */
  bearingDeg: number;
}

export function shadowCast(sun: SunPosition): ShadowCast {
  const bearingDeg = (sun.azimuthDeg + 180) % 360;
  if (sun.altitudeDeg <= 0) return { isLit: false, lengthPerMeter: 0, bearingDeg };
  const length = 1 / Math.tan(sun.altitudeDeg * (Math.PI / 180));
  return { isLit: true, lengthPerMeter: Math.min(length, MAX_LENGTH_PER_METER), bearingDeg };
}

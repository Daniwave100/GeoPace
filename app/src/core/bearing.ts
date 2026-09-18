// Compass directions, from the runner's point of view.
//
// Everything in GeoPace that points somewhere is a bearing in degrees clockwise from true north:
// the course line's heading, the sun's azimuth, a wind direction. What a runner experiences is
// the *difference* between their heading and one of those — and the two conventions below point
// opposite ways, so each gets its own named function rather than a raw subtraction at the call
// site.

/** Which way something lies relative to where you are running. */
export type Side = "ahead" | "behind" | "left" | "right";

const CROSSWIND_ARC_DEG = 45;
const AHEAD_ARC_DEG = 45;

/**
 * The turn from `headingDeg` to `bearingDeg`, taken the short way round: -180…+180, where
 * positive is clockwise, i.e. to the runner's right.
 */
export function relativeBearing(headingDeg: number, bearingDeg: number): number {
  return ((((bearingDeg - headingDeg) % 360) + 540) % 360) - 180;
}

/** A direction as the runner experiences it: metres to their right, metres straight ahead. */
export interface LocalVector {
  right: number;
  ahead: number;
}

/**
 * A compass bearing, re-expressed in the runner's own frame. This is how a world direction — the
 * sun, a shadow, the wind — gets drawn into a view that always faces the way the runner is going.
 */
export function localVector(headingDeg: number, bearingDeg: number): LocalVector {
  const turn = relativeBearing(headingDeg, bearingDeg) * (Math.PI / 180);
  return { right: Math.sin(turn), ahead: Math.cos(turn) };
}

export interface WindOnRunner {
  /** Where the wind comes from, relative to the runner: 0 is straight in the face, ±180 behind. */
  angleDeg: number;
  /** How much of the wind is against the runner: +1 a pure headwind, -1 a pure tailwind. */
  headwindFraction: number;
  description: "headwind" | "tailwind" | "crosswind";
  /** The side a crosswind arrives from; "none" when it is square on the nose or the back. */
  side: "left" | "right" | "none";
}

/**
 * What a wind does to a runner. `windFromDeg` is the meteorological direction — the degrees the
 * wind blows **from** — so a wind from the north meets a runner heading north head on.
 */
export function windOnRunner(headingDeg: number, windFromDeg: number): WindOnRunner {
  const angleDeg = relativeBearing(headingDeg, windFromDeg);
  const away = Math.abs(angleDeg);
  return {
    angleDeg,
    // The wind's own direction of travel is the reverse of where it comes from, so a wind *from*
    // dead ahead opposes the runner completely.
    headwindFraction: Math.cos(angleDeg * (Math.PI / 180)),
    description: away < CROSSWIND_ARC_DEG ? "headwind" : away > 180 - CROSSWIND_ARC_DEG ? "tailwind" : "crosswind",
    side: away < CROSSWIND_ARC_DEG || away > 180 - CROSSWIND_ARC_DEG ? "none" : angleDeg > 0 ? "right" : "left",
  };
}

export interface SunOnRunner {
  /** Where the sun is, relative to the runner: 0 straight ahead, +90 over the right shoulder. */
  angleDeg: number;
  side: Side;
}

/**
 * Which shoulder the sun is over. `sunAzimuthDeg` is the direction the sun **is in** (see
 * `solar.ts`), the opposite convention to a wind direction.
 */
export function sunOnRunner(headingDeg: number, sunAzimuthDeg: number): SunOnRunner {
  const angleDeg = relativeBearing(headingDeg, sunAzimuthDeg);
  const away = Math.abs(angleDeg);
  return {
    angleDeg,
    side: away <= AHEAD_ARC_DEG ? "ahead" : away >= 180 - AHEAD_ARC_DEG ? "behind" : angleDeg > 0 ? "right" : "left",
  };
}

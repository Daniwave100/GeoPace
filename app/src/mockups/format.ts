// Turning numbers into the words a runner would use. Shared by all three directions, because the
// phrasing is not what is being chosen between — the typography and the layout are.
import { formatElapsed } from "../core/race-clock";
import type { Exposure, Readout } from "./story";

export { formatElapsed, formatPace } from "../core/race-clock";
export { compass, raceDate } from "../core/words";

/** An em dash, for a number that genuinely isn't known. Never a zero, never a guess. */
export const NOT_KNOWN = "—";

export function km(value: number): string {
  return value.toFixed(2);
}

export function metres(value: number): string {
  return `${value.toFixed(0)} m`;
}

export function grade(percent: number): string {
  return `${percent >= 0 ? "+" : "−"}${Math.abs(percent).toFixed(1)}%`;
}

/** Minetti's energy cost relative to flat: 1.08 means eight percent more work than flat ground. */
export function difficulty(value: number | null): string {
  return value === null ? NOT_KNOWN : `${value.toFixed(2)}×`;
}

export function difficultyWords(value: number | null): string {
  if (value === null) return "outside the model's range";
  const percent = Math.round((value - 1) * 100);
  if (percent === 0) return "flat-equivalent effort";
  return `${Math.abs(percent)}% ${percent > 0 ? "more" : "less"} energy than flat`;
}

/** Sun exposure is always a range: the spread between the two ends is the trees (PLAN.md D7). */
export function exposure(value: Exposure | null): string {
  return value === null ? "sun is down" : `${value.lowPercent}–${value.highPercent}%`;
}

export function sunWords(readout: Readout): string {
  if (!readout.sun.isUp) return "below the horizon";
  const where = readout.sun.side === "ahead" ? "in your eyes" : readout.sun.side === "behind" ? "behind you" : `over your ${readout.sun.side} shoulder`;
  return `${readout.sun.altitudeDeg.toFixed(0)}° up, ${where}`;
}

export function windWords(readout: Readout): string {
  const { description, side, speedMs, fromDeg } = readout.wind;
  const from = `from ${Math.round(fromDeg)}°`;
  const detail = description === "crosswind" ? `${description} on your ${side}` : description;
  return `${speedMs.toFixed(1)} m/s ${detail}, ${from}`;
}

export function clockAndElapsed(readout: Readout): string {
  return `${readout.clock} · ${formatElapsed(readout.elapsedSeconds)} elapsed`;
}

/**
 * A landmark name short enough to set along a strip: the bracketed aside goes, and a very long
 * name is cut at a word. Whoever uses this keeps the full name somewhere reachable.
 */
export function shortName(name: string, maxLength = 24): string {
  const plain = name.replace(/\s*\(.*\)$/, "");
  if (plain.length <= maxLength) return plain;
  const cut = plain.slice(0, maxLength);
  // Only drop the last word if the cut landed in the middle of it.
  const whole = /\s/.test(plain[maxLength]) ? cut : cut.replace(/\s+\S*$/, "");
  return `${whole.trimEnd()}…`;
}

/** "in 3.96 km", "0.64 km back", or "here": where something is, from the runner's position. */
export function distanceWords(offsetKm: number): string {
  if (Math.abs(offsetKm) < 0.05) return "here";
  return offsetKm > 0 ? `in ${km(offsetKm)} km` : `${km(-offsetKm)} km back`;
}

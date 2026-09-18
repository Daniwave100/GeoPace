// Seam: scrubbing input -> a km on the course; a km -> the place on the road the marker goes.
import { describe, expect, it } from "vitest";
import type { CourseLine } from "../src/bundle/types";
import { kmAfterKey, kmAtFraction, positionAtKm, type ScrubKey } from "../src/core/scrub";

describe("scrubbing with the keyboard", () => {
  const LENGTH = 42.2;
  const press = (key: string, modifiers: Partial<ScrubKey> = {}): ScrubKey => ({ key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...modifiers });

  it("steps 100 m with the arrows, and a whole km with Shift or Page Up/Down", () => {
    expect(kmAfterKey(press("ArrowRight"), 10, LENGTH)).toBeCloseTo(10.1, 9);
    expect(kmAfterKey(press("ArrowLeft"), 10, LENGTH)).toBeCloseTo(9.9, 9);
    expect(kmAfterKey(press("ArrowUp"), 10, LENGTH)).toBeCloseTo(10.1, 9);
    expect(kmAfterKey(press("ArrowDown"), 10, LENGTH)).toBeCloseTo(9.9, 9);
    expect(kmAfterKey(press("ArrowRight", { shiftKey: true }), 10, LENGTH)).toBe(11);
    expect(kmAfterKey(press("PageUp"), 10, LENGTH)).toBe(11);
    expect(kmAfterKey(press("PageDown"), 10, LENGTH)).toBe(9);
  });

  it("lands on round numbers, so a runner can stop on km 30 after clicking somewhere near it", () => {
    // A click leaves the runner at 29.6437. The next steps are the next marks, not 29.6437 + a step.
    expect(kmAfterKey(press("PageUp"), 29.6437, LENGTH)).toBe(30);
    expect(kmAfterKey(press("PageDown"), 29.6437, LENGTH)).toBe(29);
    expect(kmAfterKey(press("ArrowRight"), 29.6437, LENGTH)).toBeCloseTo(29.7, 9);
    expect(kmAfterKey(press("ArrowLeft"), 29.6437, LENGTH)).toBeCloseTo(29.6, 9);
    // Already on a mark: a full step, even when floating point has left the km a hair off it.
    expect(kmAfterKey(press("ArrowRight"), 0.1 + 0.2, LENGTH)).toBeCloseTo(0.4, 9);
    expect(kmAfterKey(press("ArrowLeft"), 0.1 + 0.2, LENGTH)).toBeCloseTo(0.2, 9);
  });

  it("jumps to the start and the finish with Home and End", () => {
    expect(kmAfterKey(press("Home"), 10, LENGTH)).toBe(0);
    expect(kmAfterKey(press("End"), 10, LENGTH)).toBe(LENGTH);
  });

  it("stops at the ends of the course", () => {
    expect(kmAfterKey(press("ArrowLeft", { shiftKey: true }), 0.4, LENGTH)).toBe(0);
    expect(kmAfterKey(press("PageUp"), 42, LENGTH)).toBe(LENGTH);
    expect(kmAfterKey(press("ArrowRight"), LENGTH, LENGTH)).toBe(LENGTH);
  });

  it("leaves every other key alone, so Tab and shortcuts still work", () => {
    expect(kmAfterKey(press("Tab"), 10, LENGTH)).toBeNull();
    expect(kmAfterKey(press("a"), 10, LENGTH)).toBeNull();
  });

  it("leaves the browser's own shortcuts alone: Alt or Cmd + Left is Back, not a step", () => {
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      expect(kmAfterKey(press("ArrowLeft", { [modifier]: true }), 10, LENGTH), modifier).toBeNull();
      expect(kmAfterKey(press("Home", { [modifier]: true }), 10, LENGTH), modifier).toBeNull();
    }
  });
});

describe("scrubbing with the pointer", () => {
  it("maps how far along the strip the pointer is onto the course, and not beyond it", () => {
    expect(kmAtFraction(0.5, 42.2)).toBeCloseTo(21.1, 9);
    expect(kmAtFraction(-0.2, 42.2)).toBe(0);
    expect(kmAtFraction(1.3, 42.2)).toBe(42.2);
  });
});

describe("the place on the road at a km", () => {
  // Three samples, 10 m apart, heading north then turning east.
  const line = {
    km: [0, 0.01, 0.02],
    lat: [52.5, 52.50009, 52.50009],
    lon: [13.4, 13.4, 13.40015],
    bearing_deg: [0, 0, 90],
  } as CourseLine;

  it("is the sample itself at a sampled km", () => {
    expect(positionAtKm(line, 0.01)).toEqual({ lat: 52.50009, lon: 13.4, bearingDeg: 0 });
  });

  it("is on the straight line between the two samples around it", () => {
    const between = positionAtKm(line, 0.015);

    expect(between.lat).toBeCloseTo(52.50009, 9);
    expect(between.lon).toBeCloseTo(13.400075, 9);
    // Heading is the stretch being run, not a blend: halfway round a corner isn't "north-east".
    expect(between.bearingDeg).toBe(0);
  });

  it("stays on the course before the start and past the finish", () => {
    expect(positionAtKm(line, -1)).toEqual({ lat: 52.5, lon: 13.4, bearingDeg: 0 });
    expect(positionAtKm(line, 5)).toEqual({ lat: 52.50009, lon: 13.40015, bearingDeg: 90 });
  });
});

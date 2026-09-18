// Seam: scrubbing input -> a km on the course; a km -> the place on the road the marker goes.
import { describe, expect, it } from "vitest";
import type { CourseLine } from "../src/bundle/types";
import { kmAfterKey, kmAtFraction, positionAtKm } from "../src/core/scrub";

describe("scrubbing with the keyboard", () => {
  const LENGTH = 42.2;

  it("steps 100 m with the arrows, and a whole km with Shift or Page Up/Down", () => {
    expect(kmAfterKey({ key: "ArrowRight", shiftKey: false }, 10, LENGTH)).toBeCloseTo(10.1, 9);
    expect(kmAfterKey({ key: "ArrowLeft", shiftKey: false }, 10, LENGTH)).toBeCloseTo(9.9, 9);
    expect(kmAfterKey({ key: "ArrowUp", shiftKey: false }, 10, LENGTH)).toBeCloseTo(10.1, 9);
    expect(kmAfterKey({ key: "ArrowDown", shiftKey: false }, 10, LENGTH)).toBeCloseTo(9.9, 9);
    expect(kmAfterKey({ key: "ArrowRight", shiftKey: true }, 10, LENGTH)).toBe(11);
    expect(kmAfterKey({ key: "PageUp", shiftKey: false }, 10, LENGTH)).toBe(11);
    expect(kmAfterKey({ key: "PageDown", shiftKey: false }, 10, LENGTH)).toBe(9);
  });

  it("jumps to the start and the finish with Home and End", () => {
    expect(kmAfterKey({ key: "Home", shiftKey: false }, 10, LENGTH)).toBe(0);
    expect(kmAfterKey({ key: "End", shiftKey: false }, 10, LENGTH)).toBe(LENGTH);
  });

  it("stops at the ends of the course", () => {
    expect(kmAfterKey({ key: "ArrowLeft", shiftKey: true }, 0.4, LENGTH)).toBe(0);
    expect(kmAfterKey({ key: "PageUp", shiftKey: false }, 42, LENGTH)).toBe(LENGTH);
  });

  it("leaves every other key alone, so Tab and shortcuts still work", () => {
    expect(kmAfterKey({ key: "Tab", shiftKey: false }, 10, LENGTH)).toBeNull();
    expect(kmAfterKey({ key: "a", shiftKey: false }, 10, LENGTH)).toBeNull();
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
    elevation_m: [30, 31, 35],
    bearing_deg: [0, 0, 90],
  } as CourseLine;

  it("is the sample itself at a sampled km", () => {
    expect(positionAtKm(line, 0.01)).toEqual({ lat: 52.50009, lon: 13.4, elevationM: 31, bearingDeg: 0 });
  });

  it("is on the straight line between the two samples around it", () => {
    const between = positionAtKm(line, 0.015);

    expect(between.lat).toBeCloseTo(52.50009, 9);
    expect(between.lon).toBeCloseTo(13.400075, 9);
    expect(between.elevationM).toBeCloseTo(33, 9);
    // Heading is the stretch being run, not a blend: halfway round a corner isn't "north-east".
    expect(between.bearingDeg).toBe(0);
  });

  it("stays on the course before the start and past the finish", () => {
    expect(positionAtKm(line, -1)).toEqual({ lat: 52.5, lon: 13.4, elevationM: 30, bearingDeg: 0 });
    expect(positionAtKm(line, 5)).toEqual({ lat: 52.50009, lon: 13.40015, elevationM: 35, bearingDeg: 90 });
  });
});

// Seam: the map's ground + a place -> how high the ground is there, for the map's own moves
// (zoom and pan steps, "Where I am", "Straight down"). The trap: while photoreal imagery has the
// plain ground's place, CesiumJS's globe is hidden, and a hidden globe loads nothing more but still
// answers, from whatever it has. Over a course it never drew, that is its top tile, whose flat
// triangles sag two kilometres under the curved surface: "Straight down" flew the map 18 km away.
import { Cartographic } from "cesium";
import { describe, expect, it } from "vitest";
import { groundUnderM } from "../src/scene/ground-under";

const berlin = Cartographic.fromDegrees(13.4, 52.5, 76);

describe("the ground under a place on the map", () => {
  it("is what our own open terrain says, while the plain ground is what is on screen", () => {
    const globe = { show: true, getHeight: () => 73.2 };

    expect(groundUnderM(globe, berlin, () => 70)).toBe(73.2);
  });

  it("is the road's own height, from the Course Bundle, while photoreal has hidden the plain ground: never the hidden globe's answer", () => {
    const hidden = { show: false, getHeight: () => -2020 }; // what it said of Berlin after a switch of course in photoreal

    expect(groundUnderM(hidden, berlin, () => 73)).toBe(73);
  });

  it("is the ellipsoid where nobody can say: the terrain hasn't arrived, or there is no course on screen yet", () => {
    expect(groundUnderM({ show: true, getHeight: () => undefined }, berlin, () => 73)).toBe(0);
    expect(groundUnderM({ show: false, getHeight: () => -2020 }, berlin, () => undefined)).toBe(0);
    expect(groundUnderM({ show: false, getHeight: () => -2020 }, berlin, undefined)).toBe(0);
  });
});

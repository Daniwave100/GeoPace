// Seam: an edition's wave start + a goal time -> what the clock says at any km of the course.
//
// The expectations are wall-clock facts anyone can check: Berlin in late September runs on CEST
// (UTC+2); New York on 2026-11-01 has already put its clocks back to EST (UTC-5) by the time the
// race starts. Getting that hour wrong would move every sun position and every shadow.
import { describe, expect, it } from "vitest";
import { formatElapsed, formatPace, raceClock } from "../src/core/race-clock";

const BERLIN_2026 = {
  date: "2026-09-27",
  timezone: "Europe/Berlin",
  waveStartLocal: "09:15",
  goalFinishSeconds: 4 * 3600,
  lineLengthM: 42284.7,
  certifiedDistanceM: 42195,
};

const NYC_2026 = {
  date: "2026-11-01",
  timezone: "America/New_York",
  waveStartLocal: "10:40",
  goalFinishSeconds: 4 * 3600,
  lineLengthM: 42688.2,
  certifiedDistanceM: 42195,
};

describe("race clock", () => {
  it("starts the wave at the right instant, including the morning the clocks go back", () => {
    // Berlin in September is on summer time, UTC+2.
    expect(raceClock(BERLIN_2026).startInstant.toISOString()).toBe("2026-09-27T07:15:00.000Z");

    // US daylight saving ends at 02:00 on Sunday 2026-11-01, hours before the wave goes off, so
    // 10:40 in New York is EST (UTC-5) — not the EDT (UTC-4) a naive conversion would pick.
    expect(raceClock(NYC_2026).startInstant.toISOString()).toBe("2026-11-01T15:40:00.000Z");
  });

  it("quotes the pace a runner recognises, not the one the course line implies", () => {
    // Four hours over the certified 42.195 km is the familiar 5:41/km, even though the NYC line
    // is half a kilometre longer than certified.
    expect(formatPace(raceClock(NYC_2026).goalPaceSecondsPerKm)).toBe("5:41");
  });

  it("reads the clock at any km, and scrubbing back gives the same km", () => {
    const clock = raceClock(NYC_2026);
    const halfway = clock.lineLengthKm / 2;

    expect(formatElapsed(clock.elapsedSecondsAtKm(halfway))).toBe("2:00:00");
    expect(clock.localClockAtKm(halfway)).toBe("12:40"); // 10:40 + two hours
    expect(clock.zoneLabelAtKm(halfway)).toBe("EST");
    expect(clock.localClockAtKm(clock.lineLengthKm)).toBe("14:40"); // the goal, at the finish line

    expect(clock.kmAtElapsedSeconds(clock.elapsedSecondsAtKm(31.4))).toBeCloseTo(31.4, 6);
  });

  it("keeps elapsed time honest through the hour the clocks repeat", () => {
    // Hypothetical wave, chosen to run straight through the 02:00 EDT -> 01:00 EST switch.
    const clock = raceClock({ ...NYC_2026, waveStartLocal: "01:30", goalFinishSeconds: 2 * 3600 });
    const anHourIn = clock.lineLengthKm / 2;

    expect(clock.zoneLabelAtKm(0)).toBe("EDT");
    expect(formatElapsed(clock.elapsedSecondsAtKm(anHourIn))).toBe("1:00:00");
    // An hour of running later, the wall clock reads the same as it did at the start...
    expect(clock.localClockAtKm(anHourIn)).toBe("01:30");
    // ...because the zone changed underneath the runner. Elapsed time never went backwards.
    expect(clock.zoneLabelAtKm(anHourIn)).toBe("EST");
  });
});

// Seam: a course's Stops + the Ride's controls + frames of time -> where the runner is and whether
// the Ride is playing (issue #8). The Ride is driven here exactly as the app drives it, with the
// browser's animation frames replaced by a clock the test turns by hand.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { createRide, type Frames, type Ride, type RideCourse, rideSpeedKmPerS } from "../src/core/ride";
import { rideCourseFor } from "../src/core/ride-view";
import { stopsFor } from "../src/core/stops";

/** The course exactly as the app hands it to the Ride: its Stops, and its turns. */
const courseFor = (id: string): RideCourse => {
  const bundle = parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${id}/course-bundle.json`, import.meta.url), "utf8")), id);
  return rideCourseFor({ line: bundle.measured.course_line, stops: stopsFor(bundle) });
};
const nyc = courseFor("nyc");
const berlin = courseFor("berlin");

/** The browser's animation frames, with the clock in the test's hands: sixty frames to the second. */
function fakeFrames() {
  let nowMs = 0;
  let waiting: ((nowMs: number) => void) | null = null;
  const frames: Frames = {
    request(callback) {
      waiting = callback;
      return 1;
    },
    cancel() {
      waiting = null;
    },
  };
  return {
    frames,
    /** Let `seconds` go by with only `perSecond` frames in each. */
    runAtFramesPerSecond(seconds: number, perSecond: number) {
      for (let frame = 0; frame < Math.round(seconds * perSecond); frame += 1) {
        nowMs += 1000 / perSecond;
        const callback = waiting;
        waiting = null;
        callback?.(nowMs);
      }
    },
    run(seconds: number) {
      for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
        nowMs += 1000 / 60;
        const callback = waiting;
        waiting = null;
        callback?.(nowMs);
      }
    },
  };
}

function rideOn(course: RideCourse, options: { reducedMotion?: boolean } = {}) {
  const clock = fakeFrames();
  const moves: number[] = [];
  let changes = 0;
  const ride: Ride = createRide({ course, frames: clock.frames, reducedMotion: () => options.reducedMotion ?? false, onMove: (km) => moves.push(km), onChange: () => (changes += 1) });
  /** Seconds of riding until the Ride stops of its own accord. */
  const secondsUntilItStops = (): number => {
    let seconds = 0;
    while (ride.playing && seconds < 3600) {
      clock.run(1);
      seconds += 1;
    }
    return seconds;
  };
  return { ride, moves, run: clock.run, secondsUntilItStops, changes: () => changes };
}

describe("the Ride's time-lapse", () => {
  it("is slower near a Stop than between Stops, on both courses and from both cameras", () => {
    for (const camera of ["from-above", "on-the-road"] as const) {
      // Open road with no Stop within 3 km: Brooklyn's Fourth Avenue, and Berlin between the Victory Column and Strausberger Platz.
      const betweenStops = [rideSpeedKmPerS(nyc, 6, camera), rideSpeedKmPerS(berlin, 6, camera)];
      for (const course of [nyc, berlin]) {
        for (const stop of course.stops) {
          expect(rideSpeedKmPerS(course, stop.km, camera), `${camera} at km ${stop.km}`).toBeLessThan(Math.min(...betweenStops) / 3);
        }
      }
    }
  });
});

describe("the Ride through a sharp turn", () => {
  it("eases off so the view never whips round, and is never slower for it than at a Stop", () => {
    const openRoad = { lengthKm: 40, stops: [{ km: 0 }, { km: 40 }] };
    // Two right-angled corners 100 m apart swing the On the road view 900 degrees for every km of road.
    const throughTheCorners = { ...openRoad, swingDegPerKm: () => 900 };
    const round = { ...openRoad, swingDegPerKm: () => 1_000_000 };

    const cruise = rideSpeedKmPerS(openRoad, 20, "on-the-road");
    const eased = rideSpeedKmPerS(throughTheCorners, 20, "on-the-road");

    expect(eased).toBeLessThan(cruise / 2);
    expect(eased * 900).toBeLessThanOrEqual(45.001); // degrees a second
    expect(rideSpeedKmPerS(round, 20, "on-the-road")).toBe(rideSpeedKmPerS(openRoad, 0, "on-the-road"));
  });
});

describe("Ride the course", () => {
  it("plays from the start to the finish and stops there, in a couple of minutes from above", () => {
    for (const course of [nyc, berlin]) {
      const { ride, moves, secondsUntilItStops } = rideOn(course);

      ride.playPause();
      expect(ride.playing).toBe(true);
      const seconds = secondsUntilItStops();

      expect(ride.km).toBe(course.lengthKm);
      expect(ride.playing).toBe(false);
      expect(seconds).toBeGreaterThan(90);
      expect(seconds).toBeLessThan(210);
      // Every frame moved the runner on, and never backwards.
      expect(moves.length).toBeGreaterThan(90 * 60 - 60);
      expect(moves.every((km, i) => i === 0 || km > moves[i - 1])).toBe(true);
    }
  });

  it("pauses where it is, and resumes from there", () => {
    const { ride, run } = rideOn(nyc);
    ride.playPause();
    run(10);

    ride.playPause();
    const pausedAt = ride.km;
    run(10);

    expect(ride.playing).toBe(false);
    expect(pausedAt).toBeGreaterThan(0.5);
    expect(ride.km).toBe(pausedAt);

    ride.playPause();
    run(1);
    expect(ride.km).toBeGreaterThan(pausedAt);
  });

  it("starts again from the start when played at the finish", () => {
    const { ride, run, secondsUntilItStops } = rideOn(berlin);
    ride.playPause();
    secondsUntilItStops();

    ride.playPause();
    run(1);

    expect(ride.playing).toBe(true);
    expect(ride.km).toBeLessThan(1);
  });
});

describe("Back and Ride to the next stop", () => {
  it("rides to the next Stop and pauses on arrival, exactly on it", () => {
    const { ride, secondsUntilItStops } = rideOn(nyc);

    ride.rideToNextStop();
    expect(ride.playing).toBe(true);
    const seconds = secondsUntilItStops();

    expect(ride.km).toBe(0.9); // the Verrazzano-Narrows Bridge
    expect(ride.playing).toBe(false);
    expect(seconds).toBeLessThan(15);

    ride.rideToNextStop();
    secondsUntilItStops();
    expect(ride.km).toBe(12.1); // the Barclays Center
  });

  it("goes back to the Stop just passed, from a Stop to the one before it, and pauses there", () => {
    const { ride, run } = rideOn(berlin);
    ride.seek(13);
    ride.playPause();
    run(0.5);

    ride.back();
    expect(ride.km).toBe(12); // Strausberger Platz
    expect(ride.playing).toBe(false);

    ride.back();
    expect(ride.km).toBe(0.7); // the Victory Column
    ride.back();
    ride.back();
    expect(ride.km).toBe(0); // the start, and no further
  });

  it("reaches the finish and pauses, though New York's Finish is listed 2 m past the end of its course line", () => {
    const { ride, secondsUntilItStops } = rideOn(nyc);
    ride.seek(42.3); // past Columbus Circle, the last Stop before the Finish

    ride.rideToNextStop();
    const seconds = secondsUntilItStops();

    expect(seconds).toBeLessThan(60);
    expect(ride.km).toBe(nyc.lengthKm);
    expect(ride.playing).toBe(false);
  });

  it("has nowhere to ride to from the finish", () => {
    const { ride } = rideOn(berlin);
    ride.seek(berlin.lengthKm);

    ride.rideToNextStop();

    expect(ride.playing).toBe(false);
    expect(ride.km).toBe(berlin.lengthKm);
  });

  it("rides straight through the Stops again once Play is pressed", () => {
    const { ride, secondsUntilItStops } = rideOn(berlin);
    ride.rideToNextStop();
    ride.playPause(); // pause on the way to the Victory Column
    ride.playPause(); // and play: no longer only to the next Stop

    secondsUntilItStops();

    expect(ride.km).toBe(berlin.lengthKm);
  });
});

describe("scrubbing during the Ride", () => {
  it("moves the Ride: it carries on from wherever the runner was put", () => {
    const { ride, run } = rideOn(nyc);
    ride.playPause();
    run(2);

    ride.seek(30);
    run(1);

    expect(ride.playing).toBe(true);
    expect(ride.km).toBeGreaterThan(30);
    expect(ride.km).toBeLessThan(31);
  });

  it("past the Stop it was riding to, rides to the next one after that", () => {
    const { ride, secondsUntilItStops } = rideOn(nyc);
    ride.rideToNextStop(); // to the Verrazzano-Narrows Bridge, km 0.9

    ride.seek(5);
    secondsUntilItStops();

    expect(ride.km).toBe(12.1); // the Barclays Center
  });

  it("waits while the runner holds the strip, so the cursor doesn't run out from under the pointer", () => {
    const { ride, run } = rideOn(nyc);
    ride.playPause();

    ride.hold(true);
    ride.seek(20);
    run(5);
    expect(ride.km).toBe(20);
    expect(ride.playing).toBe(true);

    ride.hold(false);
    run(1);
    expect(ride.km).toBeGreaterThan(20);
    expect(ride.km).toBeLessThan(21); // and no leap for the time it was held
  });
});

describe("with reduced motion asked for", () => {
  it("steps from Stop to Stop with nothing in between, giving each a few seconds", () => {
    const { ride, moves, secondsUntilItStops } = rideOn(berlin, { reducedMotion: true });

    ride.playPause();
    const seconds = secondsUntilItStops();

    // Every place the runner was put is a Stop: the thirteen after the start, in order, once each.
    expect(moves).toEqual(berlin.stops.slice(1).map((stop) => stop.km));
    expect(ride.km).toBe(42.28); // the Finish, 5 m short of the end of the course line: near enough to be the end
    expect(seconds / moves.length).toBeGreaterThanOrEqual(3);
    expect(seconds / moves.length).toBeLessThanOrEqual(6);
  });

  it("goes to the next Stop as soon as Play is pressed, rather than seeming to do nothing", () => {
    const { ride, moves, run } = rideOn(berlin, { reducedMotion: true });

    ride.playPause();
    run(0.1);

    expect(moves).toEqual([0.7]); // the Victory Column
    expect(ride.playing).toBe(true);
  });

  it("gives the start its few seconds too, when played again from the finish", () => {
    const { ride, moves, run } = rideOn(berlin, { reducedMotion: true });
    ride.seek(berlin.lengthKm);

    ride.playPause();
    run(2);

    expect(moves).toEqual([0]);
  });

  it("gives a Stop its seconds by the clock, however slowly the frames come", () => {
    const slow = fakeFrames();
    const moves: number[] = [];
    const ride = createRide({ course: berlin, frames: slow.frames, reducedMotion: () => true, onMove: (km) => moves.push(km), onChange: () => undefined });
    ride.playPause();

    slow.runAtFramesPerSecond(9, 2); // a weak GPU: two frames a second, for nine seconds

    expect(moves).toEqual([0.7, 12, 14.4]); // at once, then after 4 s and after 8 s
  });

  it("makes Ride to the next stop a single step", () => {
    const { ride, moves } = rideOn(nyc, { reducedMotion: true });

    ride.rideToNextStop();

    expect(moves).toEqual([0.9]);
    expect(ride.playing).toBe(false);
    expect(ride.on).toBe(true);
  });
});

describe("the Ride's two cameras", () => {
  it("make On the road a gentler time-lapse than From above: slower at every Stop and on every open road, and several times as long over the whole course", () => {
    for (const course of [nyc, berlin]) {
      // The pace itself, turns aside: through a sharp turn each camera eases off by its own amount.
      const turnsAside = { lengthKm: course.lengthKm, stops: course.stops };
      for (let km = 0; km <= course.lengthKm; km += 0.05) {
        expect(rideSpeedKmPerS(turnsAside, km, "on-the-road"), `km ${km.toFixed(2)}`).toBeLessThan(rideSpeedKmPerS(turnsAside, km, "from-above"));
      }

      const onTheRoad = rideOn(course);
      onTheRoad.ride.useCamera("on-the-road");
      onTheRoad.ride.playPause();
      const fromAbove = rideOn(course);
      fromAbove.ride.playPause();
      expect(onTheRoad.secondsUntilItStops()).toBeGreaterThan(3 * fromAbove.secondsUntilItStops());
    }
  });

  it("can be switched in the middle of the Ride without stopping it", () => {
    const { ride, run } = rideOn(nyc);
    expect(ride.camera).toBe("from-above");
    ride.seek(5);
    ride.playPause();
    run(1);
    const fromAbove = ride.km - 5;

    ride.useCamera("on-the-road");
    const switchedAt = ride.km;
    run(1);

    expect(ride.camera).toBe("on-the-road");
    expect(ride.playing).toBe(true);
    expect(ride.km - switchedAt).toBeGreaterThan(0);
    expect(ride.km - switchedAt).toBeLessThan(fromAbove / 2);
  });
});

describe("the Ride as a mode of the screen", () => {
  it("is off until the runner rides, stays on while paused, and is off again once left", () => {
    const { ride, run, changes } = rideOn(nyc);
    expect(ride.on).toBe(false);

    ride.playPause();
    expect(ride.on).toBe(true);
    ride.playPause();
    expect(ride.on).toBe(true);
    expect(ride.playing).toBe(false);

    ride.playPause();
    ride.leave();
    const leftAt = ride.km;
    run(2);

    expect(ride.on).toBe(false);
    expect(ride.playing).toBe(false);
    expect(ride.km).toBe(leftAt);
    expect(changes()).toBeGreaterThanOrEqual(4); // the controls were told each time
  });

  it("is not started by scrubbing: Explore stays Explore", () => {
    const { ride } = rideOn(nyc);

    ride.seek(10);

    expect(ride.on).toBe(false);
  });
});

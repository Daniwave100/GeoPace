// Seam: a course's Stops + the Ride's controls + frames of time -> where the runner is and whether
// the Ride is playing (issue #8). The Ride is driven here exactly as the app drives it, with the
// browser's animation frames replaced by a clock the test turns by hand.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { createRide, cruising, type Frames, type Ride, type RideCourse, rideSpeedKmPerS } from "../src/core/ride";
import { rideCourseFor } from "../src/core/ride-view";
import { stopsFor } from "../src/core/stops";

/** The course exactly as the app hands it to the Ride: its Stops, and its turns. */
const courseFor = (id: string): RideCourse => {
  const bundle = parseCourseBundle(JSON.parse(readFileSync(new URL(`../../data/derived/${id}/course-bundle.json`, import.meta.url), "utf8")), id);
  return rideCourseFor({ line: bundle.measured.course_line, stops: stopsFor(bundle), notMeasured: bundle.measured.elevation_not_measured });
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
  /** Let `seconds` go by with only `perSecond` frames in each. */
  const runAtFramesPerSecond = (seconds: number, perSecond: number) => {
    for (let frame = 0; frame < Math.round(seconds * perSecond); frame += 1) {
      nowMs += 1000 / perSecond;
      const callback = waiting;
      waiting = null;
      callback?.(nowMs);
    }
  };
  return { frames, runAtFramesPerSecond, run: (seconds: number) => runAtFramesPerSecond(seconds, 60) };
}

function rideOn(course: RideCourse, options: { reducedMotion?: boolean } = {}) {
  const clock = fakeFrames();
  const moves: number[] = [];
  let changes = 0;
  // The runner's system setting, which can change while the app is open: a test can flip it mid-Ride.
  const motion = { reduced: options.reducedMotion ?? false };
  const ride: Ride = createRide({ course, frames: clock.frames, reducedMotion: () => motion.reduced, onMove: (km) => moves.push(km), onChange: () => (changes += 1) });
  /** Seconds of riding until the Ride stops of its own accord. A Ride that never does is a failure, not a long Ride. */
  const secondsUntilItStops = (): number => {
    let seconds = 0;
    while (ride.playing) {
      if (seconds >= 3600) throw new Error(`The Ride was still playing after an hour, at km ${ride.km}`);
      clock.run(1);
      seconds += 1;
    }
    return seconds;
  };
  return { ride, moves, motion, run: clock.run, runAtFramesPerSecond: clock.runAtFramesPerSecond, secondsUntilItStops, changes: () => changes };
}

describe("the Ride's time-lapse", () => {
  it("is slower at a Stop than anywhere between Stops, on both courses and from both cameras, every corner included", () => {
    for (const camera of ["from-above", "on-the-road"] as const) {
      for (const course of [nyc, berlin]) {
        const atAStop = Math.max(...course.stops.map((stop) => rideSpeedKmPerS(course, stop.km, camera)));
        let placesBetweenStops = 0;
        for (let km = 0; km <= course.lengthKm; km += 0.01) {
          if (course.stops.some((stop) => km > stop.km - 0.5 && km < (stop.toKm ?? stop.km) + 0.5)) continue; // near a Stop
          placesBetweenStops += 1;
          // The Ride eases off through a sharp turn, but never to a Stop's crawl: a street corner is not a Stop.
          expect(rideSpeedKmPerS(course, km, camera), `${camera}, km ${km.toFixed(2)}`).toBeGreaterThan(atAStop);
        }
        expect(placesBetweenStops).toBeGreaterThan(1500); // most of the course is between Stops
        // And on the open road it is several times as quick: Brooklyn's Fourth Avenue; Berlin between the Victory Column and Strausberger Platz.
        expect(rideSpeedKmPerS(course, 6, camera)).toBeGreaterThan(atAStop * 3);
      }
    }
  });

  it("never changes pace in a step: from one metre of either course to the next, how far into its cruise the Ride is barely moves", () => {
    // The trap: a rule that holds the Ride back through a climb and lets go of it all at once at the
    // top. From above takes its height from the same number, so the camera jumped 900 m in one frame.
    for (const camera of ["from-above", "on-the-road"] as const) {
      for (const course of [nyc, berlin]) {
        let last = cruising(course, 0, camera);
        for (let m = 1; m <= course.lengthKm * 1000; m += 1) {
          const now = cruising(course, m / 1000, camera);
          expect(Math.abs(now - last), `${camera}, km ${(m / 1000).toFixed(3)}`).toBeLessThan(0.02);
          last = now;
        }
      }
    }
  });

  it("slows into a corner the way a vehicle does, and picks up again the same way: never a hard brake from one frame to the next", () => {
    // The trap: a speed that is simply "what this place allows" drops from 120 to 25 m/s in a sixth
    // of a second at every street corner. The Ride sees the corner coming.
    for (const camera of ["from-above", "on-the-road"] as const) {
      for (const course of [nyc, berlin]) {
        let km = 0;
        let worst = { ratio: 1, km: 0 };
        while (km < course.lengthKm) {
          const now = rideSpeedKmPerS(course, km, camera);
          const next = Math.min(km + now / 60, course.lengthKm); // a frame later, sixty to the second
          const ratio = Math.max(rideSpeedKmPerS(course, next, camera) / now, now / rideSpeedKmPerS(course, next, camera));
          if (ratio > worst.ratio) worst = { ratio, km };
          km = next === km ? course.lengthKm : next;
        }
        expect(worst.ratio, `${camera}, km ${worst.km.toFixed(3)}`).toBeLessThan(1.25);
      }
    }
  });

  it("stays slow through the whole of a stretch that is a Stop: up the Queensboro Bridge's climb, not only at its foot", () => {
    const climb = nyc.stops.find((stop) => Math.abs(stop.km - 23.53) < 0.01);
    expect(climb?.toKm).toBeCloseTo(24.81, 2);
    for (const camera of ["from-above", "on-the-road"] as const) {
      const openRoad = rideSpeedKmPerS({ lengthKm: nyc.lengthKm, stops: nyc.stops }, 6, camera);
      for (const km of [23.9, 24.2, 24.6]) {
        const upTheClimb = rideSpeedKmPerS({ lengthKm: nyc.lengthKm, stops: nyc.stops }, km, camera);
        expect(upTheClimb, `${camera}, km ${km}`).toBeLessThan(openRoad / 2);
        expect(upTheClimb, `${camera}, km ${km}`).toBeGreaterThan(rideSpeedKmPerS(nyc, 23.53, camera)); // slow, not the crawl of arriving
      }
    }
  });
});

describe("the Ride through a sharp turn", () => {
  it("eases off so the view never whips round, and however sharp the turn keeps moving", () => {
    const openRoad = { lengthKm: 40, stops: [{ km: 0 }, { km: 40 }] };
    // A right-angled corner swings the On the road view a quarter turn in 50 m of road: 1800 degrees for every km.
    const throughTheCorners = { ...openRoad, swingDegPerKm: () => 1800 };
    const round = { ...openRoad, swingDegPerKm: () => 1_000_000 };

    const cruise = rideSpeedKmPerS(openRoad, 20, "on-the-road");
    const eased = rideSpeedKmPerS(throughTheCorners, 20, "on-the-road");

    expect(eased).toBeLessThan(cruise / 2);
    expect(eased * 1800).toBeLessThanOrEqual(60.001); // degrees a second: a quarter turn in a second and a half
    // However sharp, between Stops it keeps moving quicker than it does at a Stop: a street corner is not a Stop.
    expect(rideSpeedKmPerS(round, 20, "on-the-road")).toBeGreaterThan(rideSpeedKmPerS(openRoad, 0, "on-the-road"));
    expect(rideSpeedKmPerS(round, 20, "on-the-road")).toBeLessThan(eased);
    // Right at a Stop it may slow as far as the pace of the run itself, and no further.
    expect(rideSpeedKmPerS(round, 0, "on-the-road")).toBeCloseTo(0.003, 6);
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

  it("pauses when asked to, and asked again stays paused: a hand on the map never starts a Ride", () => {
    const { ride, run } = rideOn(nyc);

    ride.pause();
    expect(ride.playing).toBe(false);
    expect(ride.on).toBe(false);

    ride.playPause();
    run(1);
    ride.pause();
    ride.pause();
    expect(ride.playing).toBe(false);
  });

  it("moves the runner no further in a late frame than a tenth of a second would: a tab left in the background doesn't leap", () => {
    const { ride, run, runAtFramesPerSecond } = rideOn(nyc);
    ride.scrubbedTo(5); // open road: the cruise
    ride.playPause();
    run(0.5);
    const before = ride.km;

    runAtFramesPerSecond(30, 1 / 30); // one frame, thirty seconds late

    expect(ride.km - before).toBeGreaterThan(0);
    expect(ride.km - before).toBeLessThan(0.1); // not the 16 km that thirty seconds at the cruise would be
  });

  it("starts again from the start when played on the Finish, which in Berlin is listed 5 m short of the end of the line", () => {
    const { ride, run } = rideOn(berlin);
    ride.scrubbedTo(42.28);

    ride.playPause();
    run(1);

    expect(ride.playing).toBe(true);
    expect(ride.km).toBeLessThan(1);
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
    ride.scrubbedTo(13);
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
    ride.scrubbedTo(42.3); // past Columbus Circle, the last Stop before the Finish

    ride.rideToNextStop();
    const seconds = secondsUntilItStops();

    expect(seconds).toBeLessThan(60);
    expect(ride.km).toBe(nyc.lengthKm);
    expect(ride.playing).toBe(false);
  });

  it("pressed while the Ride is playing straight through, still pauses at the next Stop", () => {
    const { ride, run, secondsUntilItStops } = rideOn(nyc);
    ride.playPause();
    run(1);

    ride.rideToNextStop();
    secondsUntilItStops();

    expect(ride.km).toBe(0.9);
  });

  it("has nowhere to go back to from the start, and so does nothing: a Back that is greyed out doesn't quietly pause the Ride", () => {
    const { ride, run } = rideOn(nyc);
    ride.playPause();
    run(0.1); // 8 m on: still on the Start, with no Stop behind it

    ride.back();

    expect(ride.playing).toBe(true);
  });

  it("has nowhere to ride to from the finish", () => {
    const { ride } = rideOn(berlin);
    ride.scrubbedTo(berlin.lengthKm);

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

    ride.scrubbedTo(30);
    run(1);

    expect(ride.playing).toBe(true);
    expect(ride.km).toBeGreaterThan(30);
    expect(ride.km).toBeLessThan(31);
  });

  it("past the Stop it was riding to, rides to the next one after that", () => {
    const { ride, secondsUntilItStops } = rideOn(nyc);
    ride.rideToNextStop(); // to the Verrazzano-Narrows Bridge, km 0.9

    ride.scrubbedTo(5);
    secondsUntilItStops();

    expect(ride.km).toBe(12.1); // the Barclays Center
  });

  it("back behind an earlier Stop, rides to that one: never through a Stop it was asked to pause at", () => {
    const { ride, run, secondsUntilItStops } = rideOn(nyc);
    ride.scrubbedTo(5);
    ride.rideToNextStop(); // to the Barclays Center, km 12.1
    run(1);

    ride.scrubbedTo(0.3);
    secondsUntilItStops();

    expect(ride.km).toBe(0.9); // the Verrazzano-Narrows Bridge, the next Stop from where the runner was put
  });

  it("wiggled round the Stop it was riding to, in one drag, still pauses at the next Stop from where it is let go", () => {
    const { ride, secondsUntilItStops } = rideOn(nyc);
    ride.scrubbedTo(11.5);
    ride.rideToNextStop();

    ride.hold(true);
    ride.scrubbedTo(12.2);
    ride.scrubbedTo(11.9);
    ride.hold(false);
    secondsUntilItStops();

    expect(ride.km).toBe(12.1); // the Barclays Center, not the climb after it
  });

  it("dragged to the finish and back in one hold, carries on from where it is let go: the Ride doesn't end under the pointer", () => {
    for (const reducedMotion of [false, true]) {
      const { ride, run } = rideOn(nyc, { reducedMotion });
      ride.playPause();
      run(2);

      ride.hold(true);
      ride.scrubbedTo(nyc.lengthKm);
      run(0.5);
      expect(ride.playing, `reduced motion: ${reducedMotion}`).toBe(true);
      ride.scrubbedTo(30);
      ride.hold(false);
      run(0.5);

      expect(ride.playing, `reduced motion: ${reducedMotion}`).toBe(true);
      expect(ride.km).toBeGreaterThanOrEqual(30);
    }
  });

  it("waits while the runner holds the strip, so the cursor doesn't run out from under the pointer", () => {
    const { ride, run } = rideOn(nyc);
    ride.playPause();
    run(1); // the Ride is under way when the runner takes the strip

    ride.hold(true);
    ride.scrubbedTo(20);
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
    ride.scrubbedTo(berlin.lengthKm);

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

  it("switched on in the middle of a Ride to the next stop, still pauses at that Stop", () => {
    const { ride, motion, run, secondsUntilItStops } = rideOn(nyc);
    ride.scrubbedTo(5);
    ride.rideToNextStop(); // to the Barclays Center, km 12.1
    run(2);

    motion.reduced = true;
    secondsUntilItStops();

    expect(ride.km).toBe(12.1);
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
      const secondsOnTheRoad = onTheRoad.secondsUntilItStops();

      expect(onTheRoad.ride.km).toBe(course.lengthKm);
      expect(onTheRoad.ride.playing).toBe(false);
      expect(secondsOnTheRoad).toBeGreaterThan(3 * fromAbove.secondsUntilItStops());
      expect(secondsOnTheRoad).toBeLessThan(15 * 60); // gentler, not endless
    }
  });

  it("can be switched in the middle of the Ride without stopping it", () => {
    const { ride, run } = rideOn(nyc);
    expect(ride.camera).toBe("from-above");
    ride.scrubbedTo(5);
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

  it("tells the controls whenever what they show changes, with no frame running to do it for them", () => {
    const paused = rideOn(nyc);
    paused.ride.playPause();
    paused.ride.playPause();
    const before = paused.changes();

    paused.ride.useCamera("on-the-road");
    expect(paused.changes()).toBe(before + 1);
    paused.ride.useCamera("on-the-road"); // the same again is no news
    expect(paused.changes()).toBe(before + 1);
    paused.ride.leave(); // Back to the map from a paused Ride: the ordinary way out
    expect(paused.changes()).toBe(before + 2);

    const stepping = rideOn(nyc, { reducedMotion: true });
    stepping.ride.rideToNextStop(); // one step, which also turns the Ride on
    expect(stepping.changes()).toBeGreaterThanOrEqual(1);
  });

  it("stops where it is when left: the runner isn't sent back to the start", () => {
    const { ride, run } = rideOn(nyc);
    ride.scrubbedTo(20);
    ride.playPause();
    run(1);

    ride.leave();

    expect(ride.km).toBeGreaterThan(20);
  });

  it("says of every move whether it rode there or jumped there, so the camera knows whether to follow or to glide", () => {
    const clock = fakeFrames();
    const hows: string[] = [];
    const motion = { reduced: false };
    const ride = createRide({ course: berlin, frames: clock.frames, reducedMotion: () => motion.reduced, onMove: (_km, how) => hows.push(how), onChange: () => undefined });

    ride.scrubbedTo(13);
    ride.playPause();
    clock.run(0.1);
    expect(new Set(hows)).toEqual(new Set(["riding"])); // frame after frame

    hows.length = 0;
    ride.back(); // to Strausberger Platz
    expect(hows).toEqual(["jump"]);

    hows.length = 0;
    motion.reduced = true;
    ride.rideToNextStop(); // one step, to Moritzplatz
    expect(hows).toEqual(["jump"]);

    hows.length = 0;
    motion.reduced = false;
    ride.scrubbedTo(berlin.lengthKm);
    ride.playPause(); // played at the finish: back to the start
    expect(hows).toEqual(["jump"]);
  });

  it("is not started by scrubbing: Explore stays Explore", () => {
    const { ride } = rideOn(nyc);

    ride.scrubbedTo(10);

    expect(ride.on).toBe(false);
  });
});

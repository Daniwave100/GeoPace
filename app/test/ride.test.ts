// Seam: a course's Stops + the Ride's controls + frames of time -> where the runner is and whether
// the Ride is playing (issue #8). The Ride is driven here exactly as the app drives it, with the
// browser's animation frames replaced by a clock the test turns by hand.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCourseBundle } from "../src/bundle/loader";
import { createRide, type Frames, type Ride, RIDE_CAMERAS, RIDE_SPEEDS, type RideCourse, cruiseKmPerS } from "../src/core/ride";
import { rideCourseFor } from "../src/core/ride-view";
import { stopsFor } from "../src/core/stops";

/** The course exactly as the app hands it to the Ride: its length and its Stops. */
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
  it("keeps one pace from the start to the finish on either camera: it slows for no Stop, no climb and no turn", () => {
    // From above since the owner rode it (issue #24): "I don't like how it slows down on the turns
    // slash stops… Just keep one smooth pace throughout." On the road since 09-24: "in turns,
    // especially in new york, it takes forever and slows down which is weird." It used to slow to
    // 12 m/s at every Stop and to as little as a tenth of its pace through a corner.
    for (const camera of RIDE_CAMERAS) {
      for (const course of [nyc, berlin]) {
        const { ride, moves, secondsUntilItStops } = rideOn(course);
        ride.useCamera(camera);
        ride.playPause();
        secondsUntilItStops();
        const steps = moves.slice(1).map((km, i) => km - moves[i]);
        // Every frame covers the same ground, until the last two seconds, where it comes to rest at the finish.
        const perFrame = cruiseKmPerS(camera) / 60;
        const beforeTheFinish = steps.slice(0, -120);
        expect(beforeTheFinish.length, `${camera}, ${course.lengthKm} km`).toBeGreaterThan(80 * 60 - 180);
        beforeTheFinish.forEach((step, i) => expect(step, `${camera}, frame ${i}, km ${moves[i + 1].toFixed(3)}`).toBeCloseTo(perFrame, 9));
      }
    }
  });

  it("from above, takes the open road at under half a kilometre a second: the owner's pick, a little slower than it was first built", () => {
    // Issue #24, after riding both courses: "slow down how fast it's going. Not too much, but just a
    // little bit." It was 550 m of course a second. Still quick enough that the course is a few minutes.
    expect(cruiseKmPerS("from-above")).toBeLessThan(0.5);
    expect(cruiseKmPerS("from-above")).toBeGreaterThan(0.4);
  });

  it("on the road, rides at the pace it used to keep only on the open road: 120 m a second, the whole course in about six minutes", () => {
    // The owner, 09-24: "the speed its at can be the basis". It used to take ten to twelve minutes,
    // almost half of it braking into corners and crawling past Stops.
    expect(cruiseKmPerS("on-the-road")).toBeCloseTo(0.12, 9);
    for (const course of [nyc, berlin]) {
      const { ride, secondsUntilItStops } = rideOn(course);
      ride.useCamera("on-the-road");
      ride.playPause();
      const seconds = secondsUntilItStops();
      expect(seconds).toBeGreaterThan(5 * 60);
      expect(seconds).toBeLessThan(7 * 60);
    }
  });
});

describe("Ride the course", () => {
  it("plays from the start to the finish and stops there, in about a minute and a half from above", () => {
    for (const course of [nyc, berlin]) {
      const { ride, moves, secondsUntilItStops } = rideOn(course);

      ride.playPause();
      expect(ride.playing).toBe(true);
      const seconds = secondsUntilItStops();

      expect(ride.km).toBe(course.lengthKm);
      expect(ride.playing).toBe(false);
      expect(seconds).toBeGreaterThan(80);
      expect(seconds).toBeLessThan(120);
      // Every frame moved the runner on, and never backwards.
      expect(moves.length).toBeGreaterThan(80 * 60 - 60);
      expect(moves.every((km, i) => i === 0 || km > moves[i - 1])).toBe(true);
    }
  });

  it("comes to rest where it stops, at the next Stop it was asked to ride to and at the finish: a second of braking, not a dead stop from full pace", () => {
    // The trap: at one pace the Ride arrives at 450 m a second, and a Ride that simply ends there
    // stops the camera dead. It sheds its speed over the last of the road instead, and still lands exactly on the Stop.
    for (const arrive of ["at the next Stop", "at the finish"] as const) {
      const { ride, moves, secondsUntilItStops } = rideOn(nyc);
      if (arrive === "at the next Stop") {
        ride.scrubbedTo(5);
        ride.rideToNextStop(); // to the Barclays Center, km 12.1
      } else {
        ride.scrubbedTo(nyc.lengthKm - 3);
        ride.playPause();
      }
      secondsUntilItStops();

      expect(ride.km, arrive).toBe(arrive === "at the next Stop" ? 12.1 : nyc.lengthKm);
      const steps = moves.slice(1).map((km, i) => km - moves[i]);
      const atFullPace = Math.max(...steps);
      // The last frame hardly moves, half a second out it is already well off its pace, and it only ever slows on the way in.
      expect(steps[steps.length - 1], arrive).toBeLessThan(atFullPace / 10);
      expect(steps[steps.length - 30], arrive).toBeLessThan(atFullPace * 0.6);
      const theWayIn = steps.slice(-60);
      expect(theWayIn.every((step, i) => i === 0 || step <= theWayIn[i - 1] + 1e-12), arrive).toBe(true);
      // And it is no crawl: from full pace to rest in about a second.
      expect(steps.filter((step) => step < atFullPace * 0.99).length, arrive).toBeLessThan(120);
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
    run(0.03); // two frames, 8 m on at one pace from above: still on the Start, with no Stop behind it

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
  it("make On the road a gentler time-lapse than From above: several times as long over the whole course", () => {
    expect(cruiseKmPerS("on-the-road")).toBeLessThan(cruiseKmPerS("from-above") / 3);
    for (const course of [nyc, berlin]) {
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

// Issue #28: in the Ride the camera always follows the runner, either as the Ride's own camera or
// as the runner's own to turn. This is the second of those as far as the Ride itself knows it: a
// hand on the map in the Ride, and the way back. What the camera then does is in scene/ride-camera.ts.
describe("free look", () => {
  it("is not on until a hand is on the map, and a hand in Explore doesn't start it", () => {
    const { ride } = rideOn(nyc);

    ride.lookAround(); // Explore: the map is the map, and there is no runner to turn round
    expect(ride.freeLook).toBe(false);

    ride.playPause();
    ride.lookAround();
    expect(ride.freeLook).toBe(true);
  });

  it("leaves the Ride playing, at the pace of the camera it was entered from", () => {
    const { ride, run } = rideOn(nyc);
    ride.useCamera("on-the-road");
    ride.playPause();
    run(1);
    const before = ride.km;

    ride.lookAround();
    run(1);

    expect(ride.playing).toBe(true);
    expect(ride.camera).toBe("on-the-road"); // the time-lapse is the one it was entered from
    expect(ride.km - before).toBeCloseTo(cruiseKmPerS("on-the-road"), 2);
  });

  it("is given back to the Ride by choosing a camera, the one the Ride is already on included", () => {
    const { ride, changes } = rideOn(nyc);
    ride.playPause();
    ride.lookAround();
    const told = changes();

    // The player shows free look as a third choice beside the two cameras, so the way back is
    // choosing one of them; the one already chosen is the commonest press of the two.
    ride.useCamera("from-above");

    expect(ride.freeLook).toBe(false);
    expect(ride.camera).toBe("from-above");
    expect(changes()).toBe(told + 1); // the player has to hear about it: its choice has moved
  });

  it("tells the controls when it comes and when it goes, and says nothing when a hand is on the map again", () => {
    const { ride, changes } = rideOn(nyc);
    ride.playPause();
    const told = changes();

    ride.lookAround();
    expect(changes()).toBe(told + 1);
    ride.lookAround(); // the runner drags again, and again: the camera is already theirs
    ride.lookAround();
    expect(changes()).toBe(told + 1);

    ride.useCamera("on-the-road");
    expect(changes()).toBe(told + 2);
  });

  it("stays through a pause, a scrub, Back and a Ride to the next stop: the camera goes on following the runner", () => {
    const { ride, run } = rideOn(nyc);
    ride.playPause();
    run(2);
    ride.lookAround();

    ride.playPause(); // paused, a hand on the map is still free look: one rule
    expect(ride.freeLook).toBe(true);
    ride.scrubbedTo(20);
    expect(ride.freeLook).toBe(true);
    ride.back();
    expect(ride.freeLook).toBe(true);
    ride.rideToNextStop();
    run(1);
    expect(ride.freeLook).toBe(true);
  });

  it("is handed back by the map's own buttons without changing which camera the Ride is on", () => {
    const { ride, changes } = rideOn(nyc);
    ride.useCamera("on-the-road");
    ride.playPause();
    ride.lookAround();
    const told = changes();

    ride.handTheCameraBack(); // Whole course, Where I am, zoom, Straight down, the arrow keys

    expect(ride.freeLook).toBe(false);
    expect(ride.camera).toBe("on-the-road");
    expect(changes()).toBe(told + 1);
    ride.handTheCameraBack(); // and again: the camera is the Ride's already, and the player has nothing to hear
    expect(changes()).toBe(told + 1);
  });

  it("is over when the runner leaves the Ride: the next Ride starts on the Ride's own camera", () => {
    const { ride } = rideOn(nyc);
    ride.playPause();
    ride.lookAround();

    ride.leave();

    expect(ride.freeLook).toBe(false);
    ride.playPause();
    expect(ride.freeLook).toBe(false);
  });
});

// The owner, 09-24: "straight down and tilted camera modes are broken. When I click straight down,
// it doesnt follow the person/dot. It stays in place." The map's Straight down used to take the
// map from the Ride, like its other buttons: the Ride paused and the camera was let go where it
// was. In the Ride it is now a way of following the runner, and the Ride plays on (PLAN.md D67).
describe("straight down in the Ride", () => {
  it("is off until it is asked for, and asked for in Explore does nothing: there the button is the map's own", () => {
    const { ride, changes } = rideOn(nyc);
    expect(ride.straightDown).toBe(false);

    ride.lookStraightDown(true);

    expect(ride.straightDown).toBe(false);
    expect(changes()).toBe(0);
  });

  it("comes and goes in the middle of the Ride without pausing it, and tells the controls each time", () => {
    const { ride, run, changes } = rideOn(nyc);
    ride.playPause();
    run(1);
    const told = changes();

    ride.lookStraightDown(true);
    run(1);
    expect(ride.straightDown).toBe(true);
    expect(ride.playing).toBe(true);
    expect(changes()).toBe(told + 1);
    ride.lookStraightDown(true); // pressed again it is already there: nothing new to tell
    expect(changes()).toBe(told + 1);

    ride.lookStraightDown(false); // Tilted
    expect(ride.straightDown).toBe(false);
    expect(ride.playing).toBe(true);
    expect(changes()).toBe(told + 2);
  });

  it("keeps the pace of the camera the Ride is on", () => {
    const { ride, run } = rideOn(nyc);
    ride.useCamera("on-the-road");
    ride.scrubbedTo(5);
    ride.playPause();
    ride.lookStraightDown(true);
    run(1);
    const before = ride.km;
    run(1);

    expect(ride.camera).toBe("on-the-road");
    expect(ride.km - before).toBeCloseTo(cruiseKmPerS("on-the-road"), 6);
  });

  it("is left for the tilted view by choosing a camera, the one the Ride is already on included", () => {
    for (const camera of RIDE_CAMERAS) {
      const { ride } = rideOn(nyc);
      ride.playPause();
      ride.lookStraightDown(true);

      ride.useCamera(camera);

      expect(ride.straightDown).toBe(false);
      expect(ride.camera).toBe(camera);
    }
  });

  it("takes the camera back from free look, and free look entered while straight down goes back to it", () => {
    const { ride } = rideOn(nyc);
    ride.playPause();
    ride.lookAround();

    ride.lookStraightDown(true);
    expect(ride.freeLook).toBe(false);
    expect(ride.straightDown).toBe(true);

    ride.lookAround();
    ride.handTheCameraBack();
    expect(ride.straightDown).toBe(true);
  });

  it("is over when the runner leaves the Ride: the next Ride starts tilted", () => {
    const { ride } = rideOn(nyc);
    ride.playPause();
    ride.lookStraightDown(true);

    ride.leave();

    expect(ride.straightDown).toBe(false);
    ride.playPause();
    expect(ride.straightDown).toBe(false);
  });
});

// The owner, 09-24: "a slider to increase how fast it plays. Right now the speed its at can be the
// basis but i should be able to slow it down or speed it up." (PLAN.md D67)
describe("the Ride's speed", () => {
  it("is the time-lapse's own pace until the runner asks otherwise: 1×", () => {
    expect(rideOn(nyc).ride.speed).toBe(1);
    expect(RIDE_SPEEDS).toContain(1);
  });

  it("covers twice the ground in a second at 2×, and half at ½×, on either camera", () => {
    for (const camera of RIDE_CAMERAS) {
      for (const times of [2, 0.5]) {
        const { ride, run } = rideOn(nyc);
        ride.useCamera(camera);
        ride.useSpeed(times);
        ride.scrubbedTo(5);
        ride.playPause();
        run(1);
        const before = ride.km;
        run(1);

        expect(ride.km - before, `${camera} at ${times}×`).toBeCloseTo(cruiseKmPerS(camera) * times, 6);
      }
    }
  });

  it("rides the whole course in half the time at 2×, and still comes to rest on the finish", () => {
    const atOne = rideOn(berlin);
    atOne.ride.playPause();
    const secondsAtOne = atOne.secondsUntilItStops();
    const atTwo = rideOn(berlin);
    atTwo.ride.useSpeed(2);
    atTwo.ride.playPause();
    const secondsAtTwo = atTwo.secondsUntilItStops();

    expect(atTwo.ride.km).toBe(berlin.lengthKm);
    expect(Math.abs(secondsAtTwo - secondsAtOne / 2)).toBeLessThanOrEqual(1);
  });

  it("changes in the middle of the Ride without pausing it, and tells the controls when it changes", () => {
    const { ride, run, changes } = rideOn(nyc);
    ride.playPause();
    run(1);
    const told = changes();

    ride.useSpeed(3);
    expect(ride.speed).toBe(3);
    expect(ride.playing).toBe(true);
    expect(changes()).toBe(told + 1);
    ride.useSpeed(3); // the same again: nothing new to tell
    expect(changes()).toBe(told + 1);
  });

  it("keeps to the speeds the player offers, the nearest of them: never slower than ¼×, never faster than 4×", () => {
    const { ride } = rideOn(nyc);
    ride.useSpeed(100);
    expect(ride.speed).toBe(4);
    ride.useSpeed(0);
    expect(ride.speed).toBe(0.25);
    ride.useSpeed(1.2); // between two steps: the slider has no place to show it
    expect(ride.speed).toBe(1);
    expect(RIDE_SPEEDS[0]).toBe(0.25);
    expect(RIDE_SPEEDS[RIDE_SPEEDS.length - 1]).toBe(4);
  });

  it("stays through a switch of camera, a pause, Back and leaving the Ride: it is the runner's choice", () => {
    const { ride } = rideOn(nyc);
    ride.useSpeed(2);
    ride.playPause();
    ride.useCamera("on-the-road");
    ride.pause();
    ride.scrubbedTo(20);
    ride.back();
    ride.leave();
    ride.playPause();

    expect(ride.speed).toBe(2);
  });

  it("with reduced motion, gives each Stop its few seconds divided by the speed", () => {
    const { ride, moves, run } = rideOn(berlin, { reducedMotion: true });
    ride.useSpeed(2);
    ride.playPause();
    run(0.1); // at once at the first Stop after the start
    expect(moves).toHaveLength(1);

    run(1.7); // at 1× it stands four seconds at each Stop; at 2×, two
    expect(moves).toHaveLength(1);
    run(0.4);
    expect(moves).toHaveLength(2);
  });
});

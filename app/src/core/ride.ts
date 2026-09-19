// The Ride (PLAN.md D34, issue #8): the runner carried along the course as a time-lapse, quick
// between Stops and slow through them, so the whole course takes a couple of minutes and there is
// time to read at the places that matter. Pure logic, no drawing and no 3D: where the runner is
// and whether the Ride is playing. The strip, the readout, the sentence and the camera are moved
// by whoever listens, through the same scrubbing that a hand on the strip does.
import { clamp } from "./series";
import { ON_THE_STOP_KM, stopsAround } from "./stops";

/** The Ride's two cameras (PLAN.md D33). */
export type RideCamera = "from-above" | "on-the-road";

/** As much of a course as the Ride needs: how long it is, where its Stops are, and where it turns. */
export interface RideCourse {
  lengthKm: number;
  /** In course order (core/stops.ts). */
  stops: { km: number }[];
  /**
   * How far a camera's view swings round for the course that goes by at `km`, in degrees per km
   * (core/ride-view.ts). Left out, the Ride takes every turn at full speed.
   */
  swingDegPerKm?(km: number, camera: RideCamera): number;
}

interface Pace {
  /** Between Stops: how much course goes by in a second. */
  cruiseKmPerS: number;
  /** At a Stop, and this close to one. */
  slowKmPerS: number;
  slowWithinKm: number;
  /** The distance over which the Ride picks its speed back up, and sheds it again before the next Stop. */
  easeOverKm: number;
  /** The fastest the view may swing round, degrees a second: through a sharp turn the Ride eases off to keep to it. */
  mostSwingDegPerS: number;
  /** However sharp the turn, the Ride keeps moving at least this fast: a view that must turn right round would otherwise stand still. */
  slowestThroughATurnKmPerS: number;
}

/**
 * How fast each camera's time-lapse goes. From above the whole course is a couple of minutes:
 * half a kilometre of road a second reads well from the air. On the road the same speed would be a blur,
 * so the time-lapse is gentler (PLAN.md D33, §6 "The ride"), and slows to a fast run at a Stop.
 */
const PACE: Record<RideCamera, Pace> = {
  "from-above": { cruiseKmPerS: 0.55, slowKmPerS: 0.08, slowWithinKm: 0.12, easeOverKm: 0.5, mostSwingDegPerS: 20, slowestThroughATurnKmPerS: 0.08 },
  // On the road the camera looks at the runner from 25 m behind, so a street corner swings the view
  // a quarter turn in those 25 m: the Ride takes it as a vehicle would, in about two seconds. Round
  // the sharpest turn of all (New York's, back on itself at Columbus Circle) it is down to 3 m/s for
  // a moment, which is the pace of the run itself: the time-lapse is never slower than the race.
  "on-the-road": { cruiseKmPerS: 0.12, slowKmPerS: 0.015, slowWithinKm: 0.04, easeOverKm: 0.3, mostSwingDegPerS: 45, slowestThroughATurnKmPerS: 0.003 },
};

/**
 * How far into its cruise the Ride is at `km`: 0 at a Stop and close to one, 1 on the open road
 * between Stops, easing between the two with no sudden change at either end, which a moving
 * camera would show as a jolt. The camera uses it too: From above comes down for a closer look
 * exactly as the Ride slows (core/ride-view.ts).
 */
export function cruising(course: RideCourse, km: number, camera: RideCamera): number {
  const pace = PACE[camera];
  const toNearestStop = Math.min(...course.stops.map((stop) => Math.abs(stop.km - km)));
  const away = clamp((toNearestStop - pace.slowWithinKm) / pace.easeOverKm, 0, 1);
  return away * away * (3 - 2 * away); // smoothstep
}

/**
 * How much course goes by in a second of the Ride at `km`: slow at a Stop, easing up to the cruise
 * away from one, and easing off through a turn sharp enough to whip the view round (at a
 * time-lapse's speed a city block's corner is one; New York's Bronx mile is five in a row).
 */
export function rideSpeedKmPerS(course: RideCourse, km: number, camera: RideCamera): number {
  const pace = PACE[camera];
  const paced = pace.slowKmPerS + (pace.cruiseKmPerS - pace.slowKmPerS) * cruising(course, km, camera);
  const swing = course.swingDegPerKm?.(km, camera) ?? 0;
  return swing > 0 ? Math.min(paced, Math.max(pace.mostSwingDegPerS / swing, pace.slowestThroughATurnKmPerS)) : paced;
}

export type HowItMoved = "riding" | "jump";

/** The browser's animation frames, or a test's stand-in for them. */
export interface Frames {
  /** Ask for `callback` to be called once, before the next repaint, with the time in milliseconds. */
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
}

export interface RideOptions {
  course: RideCourse;
  frames: Frames;
  /** Asked again at every step: a runner can ask their system for reduced motion while the app is open. */
  reducedMotion(): boolean;
  /**
   * The Ride has moved the runner to `km`: "riding", it rode there, a frame's worth further on;
   * "jump", it is somewhere else at once (Back, a step from Stop to Stop with reduced motion, the
   * start again after the finish). Whoever moves a camera follows the one and glides to the other.
   */
  onMove(km: number, how: HowItMoved): void;
  /** Something the Ride's controls show has changed: whether it is on, whether it is playing, the camera. */
  onChange(): void;
}

export interface Ride {
  /** Whether the screen is in the Ride: from the first Play until the runner leaves it. Paused is still on. */
  readonly on: boolean;
  readonly playing: boolean;
  /** Where the runner is: km from the start. */
  readonly km: number;
  readonly camera: RideCamera;
  /** Play, or pause: what the button and the space bar do. Played, the Ride goes straight through to the finish. */
  playPause(): void;
  /** Pause, if it is playing: what a hand on the map does. */
  pause(): void;
  /** Ride to the next Stop and pause on arriving. */
  rideToNextStop(): void;
  /** Go back to the Stop just passed (from a Stop, to the one before it) and pause there. */
  back(): void;
  /** The runner was moved by hand, by scrubbing: the Ride carries on from there. */
  seek(km: number): void;
  /** The runner has taken hold of the strip, or let it go: while they hold it, the Ride waits where they put it. */
  hold(held: boolean): void;
  /** Switch cameras, in the middle of the Ride or not. The time-lapse follows: gentler On the road. */
  useCamera(camera: RideCamera): void;
  /** Back to Explore: the Ride stops where it is. */
  leave(): void;
}

/** With reduced motion asked for, how long the Ride gives each Stop before it steps to the next: time to read the sentence. */
const SECONDS_AT_EACH_STOP = 4;

/** A frame that arrives late (the tab was in the background) moves the runner no further than this much time would. */
const LONGEST_FRAME_SECONDS = 0.1;

export function createRide(options: RideOptions): Ride {
  const { course, frames } = options;
  let km = 0;
  let on = false;
  let playing = false;
  let camera: RideCamera = "from-above";
  /** Where a Ride to the next stop ends; null while riding straight through. */
  let untilKm: number | null = null;
  let held = false;
  /** With reduced motion: how long the Ride has stood where it is. */
  let stoodSeconds = 0;
  let lastFrameMs: number | null = null;
  let waitingFor: number | null = null;

  const onFrame = (nowMs: number) => {
    waitingFor = null;
    if (!playing) return;
    const sinceLastFrame = lastFrameMs === null ? 0 : (nowMs - lastFrameMs) / 1000;
    const seconds = Math.min(sinceLastFrame, LONGEST_FRAME_SECONDS);
    lastFrameMs = nowMs;
    if (held) {
      // The runner has the strip: the Ride waits wherever they put it, the finish included, and the
      // time that goes by is not ridden afterwards. It doesn't end under their pointer.
      waitingFor = frames.request(onFrame);
      return;
    }
    if (options.reducedMotion()) {
      // No continuous movement: the Ride stands at a Stop, then is at the next one. Standing is
      // timed by the clock, not by capped frames: on a slow machine four seconds are still four.
      stoodSeconds += sinceLastFrame;
      const arrived = stoodSeconds >= SECONDS_AT_EACH_STOP;
      if (arrived) stepToNextStop();
      // A Ride to the next stop ends at that Stop, however it got there: reduced motion can be
      // asked for in the middle of one.
      if (atTheFinish() || (arrived && untilKm !== null)) setPlaying(false);
      else waitingFor = frames.request(onFrame);
      return;
    }
    // A finish listed a hair past the end of the course line is still reached.
    const endKm = Math.min(untilKm ?? course.lengthKm, course.lengthKm);
    if (seconds > 0) moveTo(Math.min(km + rideSpeedKmPerS(course, km, camera) * seconds, endKm), "riding");
    if (km >= endKm) setPlaying(false);
    else waitingFor = frames.request(onFrame);
  };

  const moveTo = (next: number, how: HowItMoved) => {
    km = clamp(next, 0, course.lengthKm);
    stoodSeconds = 0;
    options.onMove(km, how);
  };

  /** On the last of the course: a Finish listed a few metres short of the end of the line is the end. */
  const atTheFinish = () => course.lengthKm - km <= ON_THE_STOP_KM;

  const stepToNextStop = () => {
    const next = stopsAround(course.stops, km).next;
    moveTo(next === null ? course.lengthKm : course.stops[next].km, "jump");
  };

  const setPlaying = (next: boolean) => {
    if (playing === next) return;
    playing = next;
    if (playing) on = true;
    if (!playing) untilKm = null;
    // With reduced motion, Play goes to the next Stop at once: standing still first would look like nothing had happened.
    stoodSeconds = SECONDS_AT_EACH_STOP;
    lastFrameMs = null;
    if (waitingFor !== null) frames.cancel(waitingFor);
    waitingFor = playing ? frames.request(onFrame) : null;
    options.onChange();
  };

  return {
    get on() {
      return on;
    },
    get playing() {
      return playing;
    },
    get km() {
      return km;
    },
    get camera() {
      return camera;
    },
    playPause() {
      // Played at the finish, it is the whole course again: there is nowhere further to ride.
      const fromTheStart = !playing && atTheFinish();
      setPlaying(!playing);
      if (fromTheStart) moveTo(0, "jump");
    },
    pause() {
      setPlaying(false);
    },
    rideToNextStop() {
      const next = stopsAround(course.stops, km).next;
      if (next === null) return;
      if (options.reducedMotion()) {
        setPlaying(false);
        stepToNextStop();
        if (!on) {
          on = true;
          options.onChange();
        }
        return;
      }
      untilKm = course.stops[next].km;
      setPlaying(true);
    },
    back() {
      setPlaying(false);
      const back = stopsAround(course.stops, km).back;
      if (back !== null) moveTo(course.stops[back].km, "jump");
    },
    seek(next) {
      km = clamp(next, 0, course.lengthKm);
      stoodSeconds = 0;
      // A Ride to the next stop rides to the next Stop from wherever the runner is put: past the one
      // it was aiming for, or back behind an earlier one, it never goes through a Stop without pausing.
      if (untilKm !== null) {
        const following = stopsAround(course.stops, km).next;
        untilKm = following === null ? course.lengthKm : course.stops[following].km;
      }
    },
    hold(next) {
      held = next;
    },
    useCamera(next) {
      if (camera === next) return;
      camera = next;
      options.onChange();
    },
    leave() {
      if (!on) return;
      on = false;
      if (playing) setPlaying(false);
      else options.onChange();
    },
  };
}

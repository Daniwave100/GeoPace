// The Ride (PLAN.md D34, issue #8): the runner carried along the course as a time-lapse, so the
// whole course takes a minute or two from above, at one pace, and some ten minutes on the road,
// where it is quick between Stops and slow through them (D53). Pure logic, no drawing and no 3D: where the runner is
// and whether the Ride is playing. The strip, the readout, the sentence and the camera are moved
// by whoever listens, through the same scrubbing that a hand on the strip does.
import { clamp } from "./series";
import { ON_THE_STOP_KM, stopsAround } from "./stops";

/** The Ride's two cameras (PLAN.md D33). */
export const RIDE_CAMERAS = ["from-above", "on-the-road"] as const;
export type RideCamera = (typeof RIDE_CAMERAS)[number];

/** As much of a course as the Ride needs: how long it is, where its Stops are, and where it turns. */
export interface RideCourse {
  lengthKm: number;
  /** In course order (core/stops.ts). A stretch that is a Stop has an end as well as a beginning. */
  stops: { km: number; toKm?: number }[];
  /**
   * How far a camera's view swings round for the course that goes by at `km`, in degrees per km
   * (core/ride-view.ts). Left out, the Ride takes every turn at full speed.
   */
  swingDegPerKm?(km: number, camera: RideCamera): number;
}

/** One camera's time-lapse. Speeds are km of course a second, since positions along a course are km: 0.45 is 450 m of road a second. */
interface TimeLapse {
  /** The cruise: how much course goes by in a second on the open road. */
  cruiseKmPerS: number;
  /** What the Ride eases off for, and how far. Left out, it keeps its cruise from the start to the finish: one pace. */
  easesOff?: EasesOff;
  /**
   * How hard the Ride brakes, km/s per second: for what is coming, picking up again the same way,
   * and to come to rest where it stops. The speed a place allows can drop to a fifth within a few
   * metres at a street corner; the Ride sees it coming and sheds speed at this rate, as a vehicle
   * would, instead of all at once.
   */
  brakingKmPerS2: number;
}

/** A time-lapse that slows for Stops, and through turns sharp enough to whip the view round. */
interface EasesOff {
  /** At a Stop, and this close to one: the slowest the Ride ever goes. */
  slowKmPerS: number;
  slowWithinKm: number;
  /** The distance over which the Ride picks its speed back up, and sheds it again before the next Stop. */
  easeOverKm: number;
  /** The fastest the view may swing round, degrees a second: through a sharp turn the Ride eases off to keep to it. */
  mostSwingDegPerS: number;
  /**
   * However sharp the turn, the Ride keeps moving at least this fast. Quicker than at a Stop: the
   * Ride is slower at a Stop than anywhere between Stops (issue #8), and a street corner is not a Stop.
   */
  slowestThroughATurnKmPerS: number;
}

/** About 5:30 a kilometre: the time-lapse is never slower than the race it is a time-lapse of. */
const THE_PACE_OF_THE_RUN_KM_PER_S = 0.003;

/**
 * Through a stretch that is a Stop (a climb), past the slow of arriving at its foot, the Ride gets
 * no nearer its cruise than this: slow all the way up, so the hill is seen, without crawling for a
 * kilometre.
 */
const MOST_CRUISE_THROUGH_A_STRETCH = 0.3;

/**
 * How fast each camera's time-lapse goes.
 *
 * From above it is one pace from the start to the finish, 450 m of road a second, and the whole
 * course is about a minute and a half. First built at 550, slowing to 80 at every Stop, staying
 * slow up each big climb and easing off through sharp turns; the owner, after riding both courses
 * (issue #24), asked for it "a little bit" slower, and then: "I don't like how it slows down on the
 * turns slash stops… Just keep one smooth pace throughout." So from above a Stop is a place the
 * Ride names, and can ride to or go back to, and no longer one it slows for; and what keeps the
 * view from whipping round where the course doubles back is no longer the Ride easing off but the
 * camera's own facing, which turns no faster than it may (core/ride-view.ts; D53 has the numbers).
 *
 * On the road the same speed would be a blur, so the time-lapse is gentler (PLAN.md D33, §6 "The
 * ride"), and slows to a fast run at a Stop. There the camera looks at the runner from 25 m behind,
 * so a street corner swings the view a quarter turn in those 25 m: the Ride takes it as a vehicle
 * would, in a second and a half, at some 13 m/s. A Stop is slower still: 12 m/s for the 60 m
 * around it, five seconds to read it by.
 */
const TIME_LAPSE: Record<RideCamera, TimeLapse> = {
  "from-above": { cruiseKmPerS: 0.45, brakingKmPerS2: 0.4 },
  "on-the-road": {
    cruiseKmPerS: 0.12,
    easesOff: { slowKmPerS: 0.012, slowWithinKm: 0.03, easeOverKm: 0.25, mostSwingDegPerS: 60, slowestThroughATurnKmPerS: 0.0125 },
    brakingKmPerS2: 0.06,
  },
};

/**
 * How far into its cruise the Ride is at `km`: 0 at a Stop and close to one, 1 on the open road
 * between Stops, easing between the two with no sudden change at either end, which a moving
 * camera would show as a jolt.
 */
export function cruising(course: RideCourse, km: number, camera: RideCamera): number {
  const lapse = TIME_LAPSE[camera].easesOff;
  if (!lapse) return 1; // one pace: at its cruise everywhere
  let most = 1;
  let toNearestStop = Number.POSITIVE_INFINITY;
  for (const stop of course.stops) {
    // Through a stretch the Ride is held back all the way up, and past its top it is let go of
    // gradually, over the same distance it eases away from a Stop: never all at once.
    if (stop.toKm !== undefined && km > stop.km) {
      const past = clamp((km - stop.toKm) / lapse.easeOverKm, 0, 1);
      most = Math.min(most, MOST_CRUISE_THROUGH_A_STRETCH + (1 - MOST_CRUISE_THROUGH_A_STRETCH) * past * past * (3 - 2 * past));
    }
    toNearestStop = Math.min(toNearestStop, Math.abs(stop.km - km));
  }
  const away = clamp((toNearestStop - lapse.slowWithinKm) / lapse.easeOverKm, 0, 1);
  return Math.min(away * away * (3 - 2 * away), most); // smoothstep
}

/**
 * How much course goes by in a second of the Ride at `km`: slow at a Stop, easing up to the cruise
 * away from one, easing off through a turn sharp enough to whip the view round (at a time-lapse's
 * speed a city block's corner is one; New York's Bronx mile is five in a row), and braking for
 * whatever is coming rather than on top of it. Still a plain function of where the runner is: the
 * same km always gives the same speed, however the Ride got there.
 */
export function rideSpeedKmPerS(course: RideCourse, km: number, camera: RideCamera): number {
  const speeds = speedsAlong(course, camera);
  const at = clamp(km / SPEEDS_EVERY_KM, 0, speeds.length - 1);
  const before = Math.floor(at);
  const after = Math.min(before + 1, speeds.length - 1);
  return speeds[before] + (speeds[after] - speeds[before]) * (at - before);
}

/** The Ride's speed is worked out every metre of the course, once for each course and camera: the Ride asks on every frame. */
const SPEEDS_EVERY_KM = 0.001;
const SPEEDS = new WeakMap<RideCourse, Partial<Record<RideCamera, Float64Array>>>();

function speedsAlong(course: RideCourse, camera: RideCamera): Float64Array {
  const forThisCourse = SPEEDS.get(course) ?? {};
  SPEEDS.set(course, forThisCourse);
  let speeds = forThisCourse[camera];
  if (!speeds) {
    const braking = TIME_LAPSE[camera].brakingKmPerS2;
    speeds = Float64Array.from({ length: Math.ceil(course.lengthKm / SPEEDS_EVERY_KM) + 1 }, (_, i) => speedThePlaceAllowsKmPerS(course, Math.min(i * SPEEDS_EVERY_KM, course.lengthKm), camera));
    // No quicker at any place than it could have got to from the place before, nor than it can
    // shed before the place after: one pass along the course and one pass back (v² = u² + 2as).
    // Only ever slower than the place allows, so what the place was slowed for still holds.
    const reachedFrom = (speed: number) => Math.sqrt(speed * speed + 2 * braking * SPEEDS_EVERY_KM);
    for (let i = 1; i < speeds.length; i += 1) speeds[i] = Math.min(speeds[i], reachedFrom(speeds[i - 1]));
    for (let i = speeds.length - 2; i >= 0; i -= 1) speeds[i] = Math.min(speeds[i], reachedFrom(speeds[i + 1]));
    forThisCourse[camera] = speeds;
  }
  return speeds;
}

/** The most the Ride may do at `km` for what is there: how near a Stop it is, and how sharply the view is swinging. */
function speedThePlaceAllowsKmPerS(course: RideCourse, km: number, camera: RideCamera): number {
  const { cruiseKmPerS, easesOff: lapse } = TIME_LAPSE[camera];
  if (!lapse) return cruiseKmPerS; // one pace, whatever is here
  const intoItsCruise = cruising(course, km, camera);
  const paced = lapse.slowKmPerS + (cruiseKmPerS - lapse.slowKmPerS) * intoItsCruise;
  const swing = course.swingDegPerKm?.(km, camera) ?? 0;
  if (swing === 0) return paced;
  // Between Stops a turn never slows the Ride to a Stop's crawl. Near a Stop it may, and right at
  // one it may go slower still, down to the pace of the run itself: New York turns back on itself
  // round Columbus Circle, which is a Stop, and at a Stop's 12 m/s the view would whip round there.
  const slowest = THE_PACE_OF_THE_RUN_KM_PER_S + (lapse.slowestThroughATurnKmPerS - THE_PACE_OF_THE_RUN_KM_PER_S) * intoItsCruise;
  return Math.min(paced, Math.max(lapse.mostSwingDegPerS / swing, slowest));
}

/**
 * Coming to rest: the most the Ride may do with `toGoKm` left before where it stops (the finish, or
 * the Stop it was asked to ride to), shedding its speed at its braking rate (v² = 2as) rather than
 * stopping dead from its cruise, which from above is 450 m a second. Never so slow that it doesn't
 * arrive. It is the one thing about the Ride's speed that is not a plain function of the place:
 * it depends on where the runner asked it to stop.
 */
function speedToComeToRestKmPerS(toGoKm: number, camera: RideCamera): number {
  return Math.max(Math.sqrt(2 * TIME_LAPSE[camera].brakingKmPerS2 * Math.max(toGoKm, 0)), THE_PACE_OF_THE_RUN_KM_PER_S);
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
  scrubbedTo(km: number): void;
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
    const speed = Math.min(rideSpeedKmPerS(course, km, camera), speedToComeToRestKmPerS(endKm - km, camera));
    if (seconds > 0) moveTo(Math.min(km + speed * seconds, endKm), "riding");
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
      const back = stopsAround(course.stops, km).back;
      if (back === null) return; // on the first Stop there is nowhere to go back to, and nothing happens: the Ride isn't paused for it
      setPlaying(false);
      moveTo(course.stops[back].km, "jump");
    },
    scrubbedTo(next) {
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

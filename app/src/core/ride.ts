// The Ride (PLAN.md D34, issue #8): the runner carried along the course as a time-lapse, quick
// between Stops and slow through them, so the whole course takes a couple of minutes and there is
// time to read at the places that matter. Pure logic, no drawing and no 3D: where the runner is
// and whether the Ride is playing. The strip, the readout, the sentence and the camera are moved
// by whoever listens, through the same scrubbing that a hand on the strip does.
import { clamp } from "./series";
import { ON_THE_STOP_KM, stopsAround } from "./stops";

/** The Ride's two cameras (PLAN.md D33). */
export type RideCamera = "from-above" | "on-the-road";

/** As much of a course as the Ride needs: how long it is, and where its Stops are. */
export interface RideCourse {
  lengthKm: number;
  /** In course order (core/stops.ts). */
  stops: { km: number }[];
}

interface Pace {
  /** Between Stops: how much course goes by in a second. */
  cruiseKmPerS: number;
  /** At a Stop, and this close to one. */
  slowKmPerS: number;
  slowWithinKm: number;
  /** The distance over which the Ride picks its speed back up, and sheds it again before the next Stop. */
  easeOverKm: number;
}

/**
 * How fast each camera's time-lapse goes. From above the whole course is a couple of minutes:
 * half a kilometre of road a second reads well from the air. On the road the same speed would be a blur,
 * so the time-lapse is gentler (PLAN.md D33, §6 "The ride"), and slows to a fast run at a Stop.
 */
const PACE: Record<RideCamera, Pace> = {
  "from-above": { cruiseKmPerS: 0.55, slowKmPerS: 0.08, slowWithinKm: 0.12, easeOverKm: 0.5 },
  "on-the-road": { cruiseKmPerS: 0.12, slowKmPerS: 0.015, slowWithinKm: 0.04, easeOverKm: 0.3 },
};

/** How much course goes by in a second of the Ride at `km`: slow at a Stop, easing up to the cruise away from one. */
export function rideSpeedKmPerS(course: RideCourse, km: number, camera: RideCamera): number {
  const pace = PACE[camera];
  const toNearestStop = Math.min(...course.stops.map((stop) => Math.abs(stop.km - km)));
  const away = clamp((toNearestStop - pace.slowWithinKm) / pace.easeOverKm, 0, 1);
  // Smoothstep: no sudden change of speed at either end of the ease, which a moving camera would show as a jolt.
  return pace.slowKmPerS + (pace.cruiseKmPerS - pace.slowKmPerS) * away * away * (3 - 2 * away);
}

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
  /** The Ride has moved the runner to `km`. */
  onMove(km: number): void;
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
    // Time that went by while the strip was held is not ridden afterwards.
    const seconds = lastFrameMs === null || held ? 0 : Math.min((nowMs - lastFrameMs) / 1000, LONGEST_FRAME_SECONDS);
    lastFrameMs = nowMs;
    if (options.reducedMotion()) {
      // No continuous movement: the Ride stands at a Stop, then is at the next one.
      stoodSeconds += seconds;
      if (stoodSeconds >= SECONDS_AT_EACH_STOP) stepToNextStop();
      if (atTheFinish()) setPlaying(false);
      else waitingFor = frames.request(onFrame);
      return;
    }
    // A finish listed a hair past the end of the course line is still reached.
    const endKm = Math.min(untilKm ?? course.lengthKm, course.lengthKm);
    if (seconds > 0) moveTo(Math.min(km + rideSpeedKmPerS(course, km, camera) * seconds, endKm));
    if (km >= endKm) setPlaying(false);
    else waitingFor = frames.request(onFrame);
  };

  const moveTo = (next: number) => {
    km = clamp(next, 0, course.lengthKm);
    stoodSeconds = 0;
    options.onMove(km);
  };

  /** On the last of the course: a Finish listed a few metres short of the end of the line is the end. */
  const atTheFinish = () => course.lengthKm - km <= ON_THE_STOP_KM;

  const stepToNextStop = () => {
    const next = stopsAround(course.stops, km).next;
    moveTo(next === null ? course.lengthKm : course.stops[next].km);
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
      if (fromTheStart) moveTo(0);
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
      if (back !== null) moveTo(course.stops[back].km);
    },
    seek(next) {
      km = clamp(next, 0, course.lengthKm);
      stoodSeconds = 0;
      // Put past the Stop it was riding to, it rides to the next one from where it is now.
      if (untilKm !== null && km >= untilKm) {
        const following = stopsAround(course.stops, km).next;
        untilKm = following === null ? null : course.stops[following].km;
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

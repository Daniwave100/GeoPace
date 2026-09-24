// The Ride (PLAN.md D34, issue #8): the runner carried along the course as a time-lapse, so the
// whole course takes a minute and a half from above and some six minutes on the road, each at one
// pace from the start to the finish (D53, D67). Pure logic, no drawing and no 3D: where the runner
// is and whether the Ride is playing. The strip, the readout, the sentence and the camera are moved
// by whoever listens, through the same scrubbing that a hand on the strip does.
import { clamp } from "./series";
import { ON_THE_STOP_KM, stopsAround } from "./stops";

/** The Ride's two cameras (PLAN.md D33). */
export const RIDE_CAMERAS = ["from-above", "on-the-road"] as const;
export type RideCamera = (typeof RIDE_CAMERAS)[number];

/** As much of a course as the Ride needs: how long it is, and where its Stops are. */
export interface RideCourse {
  lengthKm: number;
  /** In course order (core/stops.ts). A stretch that is a Stop has an end as well as a beginning. */
  stops: { km: number; toKm?: number }[];
}

/** One camera's time-lapse. Speeds are km of course a second, since positions along a course are km: 0.45 is 450 m of road a second. */
interface TimeLapse {
  /** How much course goes by in a second, from the start to the finish. */
  cruiseKmPerS: number;
  /**
   * How hard the Ride brakes to come to rest where it stops (the finish, or the Stop it was asked
   * to ride to), km/s per second: it sheds its speed over the last of the road, as a vehicle
   * would, instead of stopping dead.
   */
  brakingKmPerS2: number;
}

/**
 * How many times its own pace the runner may have the time-lapse play (PLAN.md D67). The owner,
 * 09-24: "a slider to increase how fast it plays. Right now the speed its at can be the basis but
 * i should be able to slow it down or speed it up." 1 is the pace as built; the rest are the steps
 * a video player offers, and on to 4×, at which the course on the road is a minute and a half.
 */
export const RIDE_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** About 5:30 a kilometre: the time-lapse is never slower than the race it is a time-lapse of. */
const THE_PACE_OF_THE_RUN_KM_PER_S = 0.003;

/**
 * How fast each camera's time-lapse goes: one pace each, from the start to the finish.
 *
 * From above it is 450 m of road a second, and the whole course is about a minute and a half.
 * First built at 550, slowing to 80 at every Stop, staying slow up each big climb and easing off
 * through sharp turns; the owner, after riding both courses (issue #24), asked for it "a little
 * bit" slower, and then: "I don't like how it slows down on the turns slash stops… Just keep one
 * smooth pace throughout."
 *
 * On the road the same speed would be a blur, so the time-lapse is gentler (PLAN.md D33, §6 "The
 * ride"): 120 m a second, some six minutes for the course. It used to go that fast only on the
 * open road, and brake to 12 m/s at every Stop and to as little as a tenth of its pace through a
 * corner, to keep the view from whipping round; the owner, 09-24: "in turns, especially in new
 * york, it takes forever and slows down which is weird." So On the road keeps one pace too (D67).
 *
 * On neither is a Stop a place the Ride slows for: it is a place the Ride names, and can ride to
 * or go back to. What keeps the view from whipping round is the camera's own facing, which turns
 * no faster than it may (core/ride-view.ts).
 */
const TIME_LAPSE: Record<RideCamera, TimeLapse> = {
  "from-above": { cruiseKmPerS: 0.45, brakingKmPerS2: 0.4 },
  "on-the-road": { cruiseKmPerS: 0.12, brakingKmPerS2: 0.06 },
};

/** How much course goes by in a second of the Ride on a camera: the same everywhere on the course. */
export function rideSpeedKmPerS(camera: RideCamera): number {
  return TIME_LAPSE[camera].cruiseKmPerS;
}

/**
 * Coming to rest: the most the Ride may do with `toGoKm` left before where it stops (the finish, or
 * the Stop it was asked to ride to), shedding its speed at its braking rate (v² = 2as) rather than
 * stopping dead from its cruise, which from above is 450 m a second. Never so slow that it doesn't
 * arrive. It depends on where the runner asked it to stop.
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
  /**
   * Whether the camera is the runner's to turn rather than the Ride's (PLAN.md D54): a hand on the
   * map turns it round the runner, and the Ride plays on. The camera above is still the one whose
   * time-lapse the Ride keeps, and the one it goes back to.
   */
  readonly freeLook: boolean;
  /**
   * Whether the Ride's camera looks straight down on the runner, north up, like a paper map,
   * rather than tilted (PLAN.md D67). It follows the runner either way, at the pace of the camera
   * the Ride is on.
   */
  readonly straightDown: boolean;
  /**
   * How many times its own pace the time-lapse plays, on either camera: 1 until the runner picks
   * another (`RIDE_SPEEDS`). The runner's choice: it stays through a switch of camera and after the Ride is left.
   */
  readonly speed: number;
  /** Play, or pause: what the button and the space bar do. Played, the Ride goes straight through to the finish. */
  playPause(): void;
  /** Pause, if it is playing: what the map's own buttons and keys do, and the plan and the photoreal panel opening over it. */
  pause(): void;
  /** Ride to the next Stop and pause on arriving. */
  rideToNextStop(): void;
  /** Go back to the Stop just passed (from a Stop, to the one before it) and pause there. */
  back(): void;
  /** The runner was moved by hand, by scrubbing: the Ride carries on from there. */
  scrubbedTo(km: number): void;
  /** The runner has taken hold of the strip, or let it go: while they hold it, the Ride waits where they put it. */
  hold(held: boolean): void;
  /**
   * A hand on the map during the Ride: the camera is the runner's to turn from now on, tied to the
   * runner wherever they go, and the Ride plays on. The only way in, and the player has no control
   * of its own for it (issue #32). In Explore it does nothing: there, the map is the map.
   */
  lookAround(): void;
  /** Out of free look: the camera is the Ride's own again, the one it already had. What the map's own buttons do before they take it. */
  handTheCameraBack(): void;
  /**
   * The map's Straight down and Tilted, in the Ride: the camera goes on following the runner, from
   * straight above or tilted, and the Ride plays on. Out of free look too: it is a way of looking
   * the runner chose. In Explore it does nothing: there, the button is the map's own.
   */
  lookStraightDown(straightDown: boolean): void;
  /** Switch cameras, in the middle of the Ride or not, and hand the camera back if it was the runner's, tilted. The time-lapse follows: gentler On the road. */
  useCamera(camera: RideCamera): void;
  /** Play faster or slower, from ¼× to 4× (`RIDE_SPEEDS`), in the middle of the Ride or not. It doesn't pause the Ride. */
  useSpeed(times: number): void;
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
  let freeLook = false;
  let straightDown = false;
  let speed = 1;
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
      // timed by the clock, not by capped frames: on a slow machine four seconds are still four. At
      // 2× they are two: the speed is the runner's to pick, reduced motion or not.
      stoodSeconds += sinceLastFrame * speed;
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
    // At any speed the runner picks, the whole Ride plays that many times faster, the braking to
    // rest included: it brakes over the same last stretch of road, in less time.
    const kmPerS = speed * Math.min(rideSpeedKmPerS(camera), speedToComeToRestKmPerS(endKm - km, camera));
    if (seconds > 0) moveTo(Math.min(km + kmPerS * seconds, endKm), "riding");
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
    get freeLook() {
      return freeLook;
    },
    get straightDown() {
      return straightDown;
    },
    get speed() {
      return speed;
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
    lookAround() {
      if (!on || freeLook) return; // dragged again and again, the camera is already the runner's: nothing begins afresh
      freeLook = true;
      options.onChange();
    },
    handTheCameraBack() {
      if (!freeLook) return;
      freeLook = false;
      options.onChange();
    },
    lookStraightDown(next) {
      if (!on || (straightDown === next && !freeLook)) return;
      straightDown = next;
      freeLook = false;
      options.onChange();
    },
    useCamera(next) {
      // Out of free look, or straight down, the camera the Ride is already on is news even though
      // it is the same camera: the player's own way back is "Go back to cinematic", and this is the same landing.
      if (camera === next && !freeLook && !straightDown) return;
      camera = next;
      freeLook = false;
      straightDown = false;
      options.onChange();
    },
    useSpeed(times) {
      const next = clamp(times, RIDE_SPEEDS[0], RIDE_SPEEDS[RIDE_SPEEDS.length - 1]);
      if (next === speed) return;
      speed = next;
      options.onChange();
    },
    leave() {
      if (!on) return;
      on = false;
      freeLook = false; // the camera is the map's own again, and the next Ride begins on the Ride's, tilted
      straightDown = false;
      if (playing) setPlaying(false);
      else options.onChange();
    },
  };
}

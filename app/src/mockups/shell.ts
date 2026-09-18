// What the three mockups share: loading a real course, holding one scrub position, and putting a
// deliberately plain review bar above whatever the design does.
//
// The bar is neutral on purpose. Each direction owns every pixel below it — including its own
// footer and attributions, because how a design treats a credit line is part of what is being
// judged (PLAN.md §9: attributions stay visible and are never restyled away).
import { BundleError, loadCourseBundle } from "../bundle/loader";
import { clamp } from "../core/series";
import { type CourseStory, buildStory } from "./story";
import { html } from "./svg";
import "./chrome.css";

export const MOCKUPS = [
  { id: "roadbook", letter: "A", name: "Roadbook", href: "/mockups/roadbook.html" },
  { id: "poster", letter: "B", name: "Race poster", href: "/mockups/poster.html" },
  { id: "instrument", letter: "C", name: "Field instrument", href: "/mockups/instrument.html" },
] as const;

export const COURSE_CHOICES = [
  { id: "nyc", label: "New York City" },
  { id: "berlin", label: "Berlin" },
] as const;

const GOAL_CHOICES = ["3:00", "3:30", "4:00", "4:30", "5:00"];
const DEFAULT_GOAL = "4:00";
/** Far enough in that the course has some shape to it, and the sun has moved. */
const DEFAULT_SCRUB_FRACTION = 0.58;

export interface ScrubTrack {
  /** "horizontal" reads left-to-right; "vertical" reads top-to-bottom. */
  axis: "horizontal" | "vertical";
  /** Fraction 0…1 along the track -> km on the course line. */
  toKm(fraction: number): number;
  /** Padding inside the element that isn't part of the track, in px. */
  inset?: { start: number; end: number };
}

export interface MockupContext {
  story: CourseStory;
  /** Where the runner is now, in km along the course line. */
  km: number;
  scrubTo(km: number): void;
  /** Run `listener` whenever the scrub position changes. */
  onScrub(listener: () => void): void;
  /** Make an element draggable and keyboard-operable as a position along the course. */
  scrubbable(element: HTMLElement | SVGElement, track: ScrubTrack): void;
  /** Total course length in km — the scrub range. */
  lengthKm: number;
}

export interface MockupDesign {
  id: (typeof MOCKUPS)[number]["id"];
  /** Builds the whole page below the review bar. Called once per course change. */
  mount(container: HTMLElement, context: MockupContext): void;
}

export function startMockup(design: MockupDesign): void {
  const chrome = document.getElementById("chrome");
  const stage = document.getElementById("stage");
  if (!chrome || !stage) throw new Error("The mockup page needs #chrome and #stage.");

  const params = new URLSearchParams(window.location.search);
  const courseId = COURSE_CHOICES.some((course) => course.id === params.get("course")) ? (params.get("course") as string) : COURSE_CHOICES[0].id;
  const goal = GOAL_CHOICES.includes(params.get("goal") ?? "") ? (params.get("goal") as string) : DEFAULT_GOAL;

  chrome.append(reviewBar(design.id, courseId, goal));
  // Designs that pin something under the bar need to know how tall it is; it wraps when narrow.
  const publishHeight = () => document.documentElement.style.setProperty("--review-bar-height", `${chrome.offsetHeight}px`);
  new ResizeObserver(publishHeight).observe(chrome);
  publishHeight();
  void show(design, stage, courseId, goal, params.get("km"));
}

async function show(design: MockupDesign, stage: HTMLElement, courseId: string, goal: string, askedKm: string | null): Promise<void> {
  let story: CourseStory;
  try {
    story = buildStory(await loadCourseBundle(courseId), { goalFinishSeconds: parseGoal(goal) });
  } catch (error) {
    stage.append(
      html(
        "pre",
        { class: "mockup-error", role: "alert" },
        error instanceof BundleError ? error.message : `Something went wrong loading the course: ${String(error)}`,
      ),
    );
    return;
  }

  document.title = `${story.course.name} · GeoPace ${design.id} mockup`;
  const asked = Number(askedKm);
  const start = Number.isFinite(asked) && askedKm !== null ? asked : story.lengthKm * DEFAULT_SCRUB_FRACTION;
  design.mount(stage, createContext(story, start));
}

function createContext(story: CourseStory, startKm: number): MockupContext {
  const listeners: (() => void)[] = [];
  const context: MockupContext = {
    story,
    km: clamp(startKm, 0, story.lengthKm),
    lengthKm: story.lengthKm,
    onScrub: (listener) => listeners.push(listener),
    scrubTo(km) {
      const next = clamp(km, 0, story.lengthKm);
      if (Math.abs(next - context.km) < 1e-9) return;
      context.km = next;
      for (const listener of listeners) listener();
    },
    scrubbable(element, track) {
      makeScrubbable(element, track, context);
    },
  };
  return context;
}

/**
 * Dragging, clicking and the keyboard all move the same position. The keyboard case matters: the
 * km strip is the app's main control, and a control you can only reach with a mouse is a control
 * half the runners can't use.
 */
function makeScrubbable(element: HTMLElement | SVGElement, track: ScrubTrack, context: MockupContext): void {
  const inset = track.inset ?? { start: 0, end: 0 };

  const kmFromEvent = (event: PointerEvent): number => {
    const box = element.getBoundingClientRect();
    const along = track.axis === "horizontal" ? event.clientX - box.left : event.clientY - box.top;
    const span = (track.axis === "horizontal" ? box.width : box.height) - inset.start - inset.end;
    return track.toKm(span > 0 ? clamp((along - inset.start) / span, 0, 1) : 0);
  };

  element.addEventListener("pointerdown", (event) => {
    const pointer = event as PointerEvent;
    element.setPointerCapture(pointer.pointerId);
    context.scrubTo(kmFromEvent(pointer));
    event.preventDefault();
  });
  element.addEventListener("pointermove", (event) => {
    const pointer = event as PointerEvent;
    if (element.hasPointerCapture(pointer.pointerId)) context.scrubTo(kmFromEvent(pointer));
  });
  element.addEventListener("pointerup", (event) => element.releasePointerCapture((event as PointerEvent).pointerId));

  element.setAttribute("tabindex", "0");
  element.setAttribute("role", "slider");
  element.setAttribute("aria-label", "Position along the course, in kilometres");
  element.setAttribute("aria-valuemin", "0");
  element.setAttribute("aria-valuemax", context.lengthKm.toFixed(2));

  element.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    const fine = (event as KeyboardEvent).shiftKey ? 0.01 : 0.1;
    const step: Record<string, number> = {
      ArrowRight: fine,
      ArrowUp: fine,
      ArrowLeft: -fine,
      ArrowDown: -fine,
      PageUp: 1,
      PageDown: -1,
    };
    if (key in step) context.scrubTo(context.km + step[key]);
    else if (key === "Home") context.scrubTo(0);
    else if (key === "End") context.scrubTo(context.lengthKm);
    else return;
    event.preventDefault();
  });

  const describe = () => {
    element.setAttribute("aria-valuenow", context.km.toFixed(2));
    element.setAttribute("aria-valuetext", `${context.km.toFixed(2)} kilometres, ${context.story.at(context.km).clock}`);
  };
  context.onScrub(describe);
  describe();
}

function reviewBar(current: string, courseId: string, goal: string): HTMLElement {
  const bar = html("div", { class: "review-bar" });
  bar.append(html("span", { class: "review-bar__title", text: "GeoPace · design mockups" }));

  const picks = html("nav", { class: "review-bar__picks", "aria-label": "Design directions" });
  for (const mockup of MOCKUPS) {
    const href = `${mockup.href}?course=${courseId}&goal=${encodeURIComponent(goal)}`;
    const item =
      mockup.id === current
        ? html("span", { class: "review-bar__pick review-bar__pick--current", "aria-current": "page" })
        : html("a", { class: "review-bar__pick", href });
    item.append(html("b", { text: mockup.letter }), ` ${mockup.name}`);
    picks.append(item);
  }
  bar.append(picks);

  bar.append(
    chooser("course", "Course", COURSE_CHOICES.map((course) => [course.id, course.label]), courseId),
    chooser("goal", "Goal", GOAL_CHOICES.map((value) => [value, value]), goal),
    html("span", { class: "review-bar__sample", title: "Several layers are placeholders until their pipelines exist", text: "contains sample data" }),
  );
  return bar;
}

/** A select that just reloads the page with a different query string — no state to keep in sync. */
function chooser(param: string, label: string, options: [string, string][], selected: string): HTMLElement {
  const select = html("select", { class: "review-bar__select", "aria-label": label });
  for (const [value, text] of options) {
    const option = html("option", { value, text });
    if (value === selected) option.selected = true;
    select.append(option);
  }
  select.addEventListener("change", () => {
    const params = new URLSearchParams(window.location.search);
    params.set(param, select.value);
    params.delete("km");
    window.location.search = params.toString();
  });
  return html("label", { class: "review-bar__field" }, html("span", { text: label }), select);
}

function parseGoal(goal: string): number {
  const [hours, minutes] = goal.split(":").map(Number);
  return hours * 3600 + minutes * 60;
}

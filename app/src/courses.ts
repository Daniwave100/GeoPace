// The courses the app can show. Each one's data is a committed Course Bundle in data/derived/<id>/.
// Which course is on screen lives in the page's URL (?course=nyc), so a view can be linked and shared.

export interface Course {
  id: string;
  label: string;
}

export const COURSES: Course[] = [
  { id: "berlin", label: "Berlin" },
  { id: "nyc", label: "New York City" },
];

export const DEFAULT_COURSE_ID = COURSES[0].id;

/** The course named in the URL; failing that the one the runner planned last; failing that the default. */
export function courseFromUrl(search: string, plannedLast: string | null = null): string {
  const known = (id: string | null): id is string => COURSES.some((course) => course.id === id);
  const asked = new URLSearchParams(search).get("course");
  if (known(asked)) return asked;
  return known(plannedLast) ? plannedLast : DEFAULT_COURSE_ID;
}

export function urlForCourse(courseId: string): string {
  return `?course=${courseId}`;
}

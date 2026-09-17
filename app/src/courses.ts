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

export function courseFromUrl(search: string): string {
  const asked = new URLSearchParams(search).get("course");
  return COURSES.some((course) => course.id === asked) ? (asked as string) : DEFAULT_COURSE_ID;
}

export function urlForCourse(courseId: string): string {
  return `?course=${courseId}`;
}

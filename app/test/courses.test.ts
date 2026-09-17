// Seam: the course picker's choice (which course the app shows) comes from the page's URL.
import { describe, expect, it } from "vitest";
import { COURSES, DEFAULT_COURSE_ID, courseFromUrl, urlForCourse } from "../src/courses";

describe("course picker", () => {
  it("offers both v1 courses, each with a name a runner would recognize", () => {
    expect(COURSES.map((course) => course.id)).toEqual(["berlin", "nyc"]);
    expect(COURSES.map((course) => course.label)).toEqual(["Berlin", "New York City"]);
  });

  it("shows the course named in the URL", () => {
    expect(courseFromUrl("?course=nyc")).toBe("nyc");
    expect(courseFromUrl("?course=berlin")).toBe("berlin");
  });

  it("falls back to the default course when the URL says nothing useful", () => {
    expect(courseFromUrl("")).toBe(DEFAULT_COURSE_ID);
    expect(courseFromUrl("?course=paris")).toBe(DEFAULT_COURSE_ID);
    expect(courseFromUrl("?course=")).toBe(DEFAULT_COURSE_ID);
  });

  it("makes a shareable link for a course", () => {
    expect(urlForCourse("nyc")).toBe("?course=nyc");
  });
});

"""Hand-maintained course facts: every fact about the world carries a source URL and accessed date."""

from pathlib import Path

import pytest

from geopace.course_facts import CourseFactsInvalid, load_course_facts, parse_course_facts

COURSES = Path(__file__).parents[2] / "data" / "courses"


def test_berlin_facts_load_and_every_fact_is_sourced():
    facts = load_course_facts(COURSES / "berlin" / "course.yaml")

    assert facts.timezone == "Europe/Berlin"
    assert facts.certified_distance_m == 42195
    assert [l.km for l in facts.landmarks] == sorted(l.km for l in facts.landmarks)


def test_a_landmark_without_a_source_is_rejected(synthetic_facts):
    del synthetic_facts["landmarks"][0]["source"]

    with pytest.raises(CourseFactsInvalid, match=r"landmarks\[0\] \(Turnaround\).*source"):
        parse_course_facts(synthetic_facts)


def test_a_fact_without_an_accessed_date_is_rejected(synthetic_facts):
    del synthetic_facts["certified_distance"]["accessed"]

    with pytest.raises(CourseFactsInvalid, match=r"certified_distance.*accessed"):
        parse_course_facts(synthetic_facts)


def test_a_source_that_is_not_a_url_is_rejected(synthetic_facts):
    synthetic_facts["start"]["source"] = "the race website"

    with pytest.raises(CourseFactsInvalid, match=r"start.*URL"):
        parse_course_facts(synthetic_facts)


def test_a_naive_or_unknown_timezone_is_rejected(synthetic_facts):
    synthetic_facts["timezone"] = "CEST"

    with pytest.raises(CourseFactsInvalid, match=r"IANA"):
        parse_course_facts(synthetic_facts)

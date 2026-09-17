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


def test_a_route_can_be_waypoints_traced_on_streets_instead_of_a_course_file(synthetic_facts):
    del synthetic_facts["route"]["url"]
    synthetic_facts["route"]["waypoints"] = [
        {"at": "Start line", "lat": 52.5, "lon": 13.4},
        {"at": "Upper deck of the bridge", "lat": 52.51, "lon": 13.4, "way": 12345},
    ]

    facts = parse_course_facts(synthetic_facts)

    assert facts.route_url is None
    assert [(w.label, w.way) for w in facts.route_waypoints] == [("Start line", None), ("Upper deck of the bridge", 12345)]


def test_a_route_needs_a_course_file_or_waypoints(synthetic_facts):
    del synthetic_facts["route"]["url"]

    with pytest.raises(CourseFactsInvalid, match=r"route needs either a course file `url` or `waypoints`"):
        parse_course_facts(synthetic_facts)


def test_nyc_facts_load_with_sourced_waypoints_bridges_and_landmarks():
    facts = load_course_facts(COURSES / "nyc" / "course.yaml")

    assert facts.timezone == "America/New_York"
    assert facts.certified_distance_m == 42195
    assert [l.km for l in facts.landmarks] == sorted(l.km for l in facts.landmarks)
    # The five bridges the course is famous for, on the deck the runners use.
    named = {bridge.name.split(" (")[0] for bridge in facts.bridges}
    assert {"Verrazzano-Narrows Bridge", "Pulaski Bridge", "Ed Koch Queensboro Bridge", "Willis Avenue Bridge", "Madison Avenue Bridge"} <= named
    decks = {bridge.name.split(" (")[0]: bridge.deck for bridge in facts.bridges}
    assert decks["Verrazzano-Narrows Bridge"] == "upper" and decks["Ed Koch Queensboro Bridge"] == "lower"
    assert facts.route_url is None and len(facts.route_waypoints) > 20

"""Seam 1: inputs -> Course Bundle. The bundle always satisfies the shared schema."""

import json
from pathlib import Path

import jsonschema
import numpy as np
import pytest

from geopace.bundle import BundleInvalid, build_course_bundle, validate_bundle, write_bundle
from geopace.course_facts import parse_course_facts
from geopace.edition_facts import parse_edition_facts

from conftest import meters_north_of, straight_north_route, parsed_synthetic_editions, synthetic_elevation

SCHEMA = json.loads((Path(__file__).parents[2] / "schema" / "course-bundle.schema.json").read_text())


def gentle_hill(lat, lon):
    return 35 + 0.01 * meters_north_of(lat, 52.5)


def wall(lat, lon):
    """Flat, then a 60% wall between 2.0 and 2.2 km (steeper than the difficulty model allows)."""
    d = meters_north_of(lat, 52.5)
    return 35 + 0.6 * np.clip(d - 2000, 0, 200)


def build(facts, sample, editions=None):
    return build_course_bundle(
        parse_course_facts(facts),
        straight_north_route(5000),
        synthetic_elevation(sample),
        editions=parsed_synthetic_editions() if editions is None else editions,
    )


def test_bundle_validates_against_the_shared_schema(synthetic_facts, tmp_path):
    path = tmp_path / "course-bundle.json"
    write_bundle(build(synthetic_facts, gentle_hill), path)

    written = json.loads(path.read_text())
    jsonschema.Draft202012Validator(SCHEMA).validate(written)
    line = written["measured"]["course_line"]
    assert line["km"][0] == 0
    # The test route is laid out on a sphere; the pipeline measures on the WGS84 ellipsoid.
    assert line["length_m"] == pytest.approx(5000, rel=0.002)
    assert line["km"][-1] == pytest.approx(line["length_m"] / 1000, abs=0.0001)
    assert written["measured"]["elevation_summary"]["gain_m"] == pytest.approx(50, abs=2)
    assert {s["url"] for s in written["sources"]} == {"https://example.org/synthetic.gpx", "https://example.org/dem"}
    # Facts keep their source all the way to the app.
    assert written["course"]["landmarks"] == [{"name": "Turnaround", "km": 2.5, "source": "https://example.org/synthetic"}]


def test_grades_outside_the_difficulty_model_are_null_not_invented(synthetic_facts):
    bundle = build(synthetic_facts, wall)

    jsonschema.Draft202012Validator(SCHEMA).validate(bundle)
    line = bundle["measured"]["course_line"]
    steep = [d for g, d in zip(line["grade"], line["difficulty"]) if abs(g) > 0.45]
    flat = [d for g, d in zip(line["grade"], line["difficulty"]) if abs(g) < 0.001]
    assert steep and all(d is None for d in steep)
    assert flat and all(d == pytest.approx(1.0, abs=0.01) for d in flat)


def test_a_malformed_bundle_is_rejected_with_the_problem_named(synthetic_facts):
    bundle = build(synthetic_facts, gentle_hill)
    bundle["measured"]["course_line"]["grade"][3] = "steep"
    del bundle["course"]["timezone"]

    with pytest.raises(BundleInvalid) as err:
        validate_bundle(bundle)
    assert "bundle.measured.course_line.grade[3]" in str(err.value)
    assert "timezone" in str(err.value)


def test_a_route_far_from_the_certified_distance_is_refused(synthetic_facts):
    synthetic_facts["certified_distance"]["meters"] = 5200  # route is ~5000 m: 4% short

    with pytest.raises(ValueError, match=r"certified"):
        build(synthetic_facts, gentle_hill)


def trace(facts):
    """Same route, but described as waypoints traced on streets rather than a course file."""
    del facts["route"]["url"]
    facts["route"]["waypoints"] = [{"at": "Start", "lat": 52.5, "lon": 13.4}, {"at": "Finish", "lat": 52.545, "lon": 13.4}]
    return facts


def test_a_traced_route_may_run_longer_than_the_line_the_course_was_certified_on(synthetic_facts):
    # Street centre lines run longer than the shortest legal line a course is measured along.
    synthetic_facts["certified_distance"]["meters"] = 4920  # route is ~5000 m: 1.6% long

    with pytest.raises(ValueError, match=r"certified"):
        build(synthetic_facts, gentle_hill)
    assert build(trace(synthetic_facts), gentle_hill)["measured"]["course_line"]["length_m"] > 4900


def test_a_traced_route_that_is_wildly_off_is_still_refused(synthetic_facts):
    synthetic_facts["certified_distance"]["meters"] = 4700  # route is ~5000 m: 6% long

    with pytest.raises(ValueError, match=r"certified"):
        build(trace(synthetic_facts), gentle_hill)


def test_a_route_traced_on_streets_credits_the_organizer_page_and_openstreetmap(synthetic_facts):
    bundle = build(trace(synthetic_facts), gentle_hill)

    route = next(s for s in bundle["sources"] if s["id"] == "route")
    assert route["url"] == "https://example.org/synthetic"
    assert "OpenStreetMap" in route["title"]
    assert "openstreetmap" in {s["id"] for s in bundle["sources"]}
    assert any("OpenStreetMap" in a["text"] for a in bundle["attributions"])


def test_edition_facts_reach_the_bundle_with_their_sources_and_flags(synthetic_facts, synthetic_edition):
    synthetic_edition["carried_over"] = {"from_edition": 2025, "reason": "The 2026 wave times aren't published yet."}
    synthetic_edition["waves"][0]["carried_over"] = True
    synthetic_edition["waves"][1] |= {"start_local": None, "note": "Not published."}
    edition = parse_edition_facts(synthetic_edition, timezone="America/New_York")

    bundle = build(synthetic_facts, gentle_hill, editions=[edition])

    jsonschema.Draft202012Validator(SCHEMA).validate(bundle)
    assert bundle["schema_version"] == 2
    source = {"source": "https://example.org/race-day", "accessed": "2026-09-18"}
    assert bundle["editions"] == [
        {
            "edition": 2026,
            "date": {"day": "2026-11-01", "confirmed": True, **source},
            "carried_over": {"from_edition": 2025, "reason": "The 2026 wave times aren't published yet."},
            "waves": [
                # 09:10 on the morning US clocks go back is EST: the offset travels with the time.
                {"id": "wave-1", "name": "Wave 1", "start_local": "09:10", "start": "2026-11-01T09:10:00-05:00", "carried_over": True, **source},
                {"id": "wave-2", "name": "Wave 2", "start_local": None, "start": None, "carried_over": False, "note": "Not published.", **source},
            ],
        }
    ]


def test_a_bundle_with_no_edition_is_rejected(synthetic_facts):
    with pytest.raises(BundleInvalid, match=r"bundle.editions"):
        build(synthetic_facts, gentle_hill, editions=[])


def test_the_schema_itself_refuses_edition_facts_that_contradict_themselves(synthetic_facts):
    # The pipeline never writes these, but the app trusts the schema, so the schema must say no.
    def broken(change) -> str:
        bundle = build(synthetic_facts, gentle_hill)
        change(bundle["editions"][0])
        with pytest.raises(BundleInvalid) as err:
            validate_bundle(bundle)
        return str(err.value)

    # A carried-over wave with nothing saying from which edition, or why.
    assert "carried_over" in broken(lambda edition: edition["waves"][0].update(carried_over=True))
    # A start time without the instant it means, and the other way round.
    assert "waves[0]" in broken(lambda edition: edition["waves"][0].update(start=None))
    assert "waves[0]" in broken(lambda edition: edition["waves"][0].update(start_local=None, note="Not published."))
    # No wave with a start time: nothing to run a race clock from.
    assert "waves" in broken(lambda edition: [wave.update(start_local=None, start=None, note="Not published.") for wave in edition["waves"]])
    # An unconfirmed date that doesn't say how it is known.
    assert "date" in broken(lambda edition: edition["date"].update(confirmed=False))

"""Seam 1: inputs -> Course Bundle. The bundle always satisfies the shared schema."""

import json
from pathlib import Path

import jsonschema
import numpy as np
import pytest

from geopace.bundle import BundleInvalid, build_course_bundle, validate_bundle, write_bundle
from geopace.course_facts import parse_course_facts

from conftest import meters_north_of, straight_north_route, synthetic_elevation

SCHEMA = json.loads((Path(__file__).parents[2] / "schema" / "course-bundle.schema.json").read_text())


def gentle_hill(lat, lon):
    return 35 + 0.01 * meters_north_of(lat, 52.5)


def wall(lat, lon):
    """Flat, then a 60% wall between 2.0 and 2.2 km (steeper than the difficulty model allows)."""
    d = meters_north_of(lat, 52.5)
    return 35 + 0.6 * np.clip(d - 2000, 0, 200)


def build(facts, sample):
    return build_course_bundle(parse_course_facts(facts), straight_north_route(5000), synthetic_elevation(sample))


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

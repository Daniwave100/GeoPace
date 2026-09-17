"""Seam 1: inputs -> Course Bundle. The course line part (distance, elevation, grade)."""

import numpy as np
import pytest

from geopace.bundle import build_course_bundle
from geopace.course_facts import CourseFactsInvalid, parse_course_facts

from conftest import meters_north_of, straight_north_route, synthetic_elevation

START_LAT = 52.5


def hill_with_noise(seed=0):
    """True terrain: 2% up for 2.5 km, then 2% down. Measured with 0.5 m noise and a few 3 m spikes."""
    rng = np.random.default_rng(seed)

    def elevation(lat, lon):
        d = meters_north_of(lat, START_LAT)
        true = 40 + 0.02 * np.minimum(d, 5000 - d)
        noise = rng.normal(0, 0.5, size=d.shape)
        spikes = np.where(rng.random(d.shape) < 0.01, 3.0, 0.0)
        return true + noise + spikes

    return synthetic_elevation(elevation)


def course_line(bundle):
    return bundle["measured"]["course_line"]


def test_noisy_elevation_yields_smoothed_grades_within_realistic_bounds(synthetic_facts):
    bundle = build_course_bundle(
        parse_course_facts(synthetic_facts),
        route=straight_north_route(5000),
        elevation=hill_with_noise(),
    )
    line = course_line(bundle)
    grade = np.array(line["grade"])
    km = np.array(line["km"])

    # Unsmoothed, 0.5 m noise over 10 m samples would produce ~7% "grades" everywhere.
    assert np.max(np.abs(grade)) < 0.035
    climb = grade[(km > 0.5) & (km < 2.0)]
    descent = grade[(km > 3.0) & (km < 4.5)]
    assert abs(np.median(climb) - 0.02) < 0.003
    assert abs(np.median(descent) + 0.02) < 0.003


def river_without_bridge_deck(lat, lon):
    """Flat 36 m street crossing a river at 2.00-2.08 km. Like a bare-earth model, the
    'ground' there is the water surface, 6 m below the (missing) bridge deck."""
    d = meters_north_of(lat, START_LAT)
    return np.where((d > 2005) & (d < 2075), 30.0, 36.0)


def test_listed_bridges_carry_the_course_over_the_water_not_down_to_it(synthetic_facts):
    source = {"source": "https://example.org/bridge", "accessed": "2026-09-16"}
    synthetic_facts["bridges"] = [{"name": "Test bridge", "km_start": 2.0, "km_end": 2.08, **source}]

    line = course_line(
        build_course_bundle(
            parse_course_facts(synthetic_facts),
            route=straight_north_route(5000),
            elevation=synthetic_elevation(river_without_bridge_deck),
        )
    )
    km = np.array(line["km"])
    elevation = np.array(line["elevation_m"])

    assert np.min(elevation[(km > 1.9) & (km < 2.2)]) > 35.5
    assert np.max(np.abs(line["grade"])) < 0.005


def test_a_bridge_without_a_source_is_rejected(synthetic_facts):
    synthetic_facts["bridges"] = [{"name": "Test bridge", "km_start": 2.0, "km_end": 2.08}]

    with pytest.raises(CourseFactsInvalid, match=r"bridges\[0\] \(Test bridge\).*source"):
        parse_course_facts(synthetic_facts)

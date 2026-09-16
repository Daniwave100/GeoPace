"""Optional real-data check for Berlin. Runs only when the local cache holds the real inputs
(after `uv run geopace build berlin` has been run once); otherwise it is skipped."""

import json
from pathlib import Path

import numpy as np
import pytest

from geopace import berlin_dgm1
from geopace.bundle import build_course_bundle, validate_bundle
from geopace.cache import cache_dir
from geopace.course_facts import load_course_facts
from geopace.route import parse_gpx

REPO = Path(__file__).parents[2]
ROUTE = cache_dir() / "berlin" / "route.gpx"
TILES = cache_dir() / "berlin" / "dgm1"


def test_committed_berlin_bundle_matches_the_schema():
    bundle = json.loads((REPO / "data" / "derived" / "berlin" / "course-bundle.json").read_text())
    validate_bundle(bundle)


@pytest.mark.skipif(not (ROUTE.exists() and any(TILES.glob("*.zip"))), reason="real Berlin inputs not cached")
def test_real_berlin_course_is_marathon_length_with_no_absurd_grades():
    facts = load_course_facts(REPO / "data" / "courses" / "berlin" / "course.yaml")
    bundle = build_course_bundle(facts, parse_gpx(ROUTE.read_text()), berlin_dgm1.elevation_model())
    line = bundle["measured"]["course_line"]

    assert line["length_m"] == pytest.approx(42195, rel=0.01)
    # Berlin is famously flat; the steepest real stretch is the ~3% ramp off the Kronprinzenbrücke.
    # A bridge deck missing from the ground model shows up as a ~5% plunge to the water.
    assert np.max(np.abs(line["grade"])) < 0.04
    # Berlin's streets sit roughly 30-60 m above sea level; bridges must not dip to the Spree (~30.8 m).
    assert 31.5 < min(line["elevation_m"]) and max(line["elevation_m"]) < 65
    assert all(d is not None for d in line["difficulty"])

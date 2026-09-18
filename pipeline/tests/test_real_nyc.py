"""Real-data checks for NYC. The committed bundle is checked always; rebuilding it from the real
inputs runs only when the local cache holds them (after `uv run geopace build nyc`)."""

import json
from pathlib import Path

import numpy as np
import pytest
from pyproj import Geod

from geopace import nyc_dem, nyc_lidar
from geopace.bundle import build_course_bundle, validate_bundle
from geopace.cache import cache_dir
from geopace.cli import load_route
from geopace.course_facts import load_course_facts
from geopace.edition_facts import load_editions

WGS84 = Geod(ellps="WGS84")
# The course's USATF certification (NY22001JHP, 2022): the straight line between start and finish
# is 47.22% of the race distance. It is the only published measurement that fixes the start line,
# which nobody gives coordinates for, so the course line has to keep agreeing with it.
CERTIFIED_SEPARATION = 0.4722

REPO = Path(__file__).parents[2]
FACTS = REPO / "data" / "courses" / "nyc" / "course.yaml"
BUNDLE = REPO / "data" / "derived" / "nyc" / "course-bundle.json"
CACHE = cache_dir() / "nyc"


def check_nyc_course_line(line: dict) -> None:
    """What has to be true of the NYC course however it was built."""
    elevation = np.array(line["elevation_m"])
    grade = np.array(line["grade"])
    lat, lon = line["lat"], line["lon"]

    assert line["length_m"] == pytest.approx(42195, rel=0.025)
    # Start on Staten Island, finish in Central Park, as far apart as the certificate says.
    separation = WGS84.inv(lon[0], lat[0], lon[-1], lat[-1])[2]
    assert separation / 42195 == pytest.approx(CERTIFIED_SEPARATION, abs=0.0005)
    # The race starts on the Verrazzano's upper deck, ~50 m up, and crests near 80 m. A bare-earth
    # model drops bridge decks, so without the LiDAR patch this would read as the sea below.
    assert 40 < elevation[0] < 70
    assert 70 < np.max(elevation) < 90
    # Lowest ground on the course is a few meters above sea level, never the water under a bridge.
    assert np.min(elevation) > 1
    # The steepest thing on the course is the ramp off the Queensboro Bridge.
    assert np.max(np.abs(grade)) < 0.09
    assert np.percentile(np.abs(grade), 99) < 0.06
    # Every grade stays inside the difficulty model's range, so nothing is grayed out.
    assert all(d is not None for d in line["difficulty"])


def check_nyc_not_measured(spans: list[dict]) -> None:
    """The 2017 scan has no returns at all over the middle of the Verrazzano's main span, so the
    crest of the course's biggest hill is a straight line, not a measurement. The bundle has to
    say so, or the app draws the highest point of the race as if it had been surveyed."""
    on_the_verrazzano = [span for span in spans if span["km_end"] <= 1.94]
    assert len(on_the_verrazzano) == 1
    [main_span] = on_the_verrazzano
    assert main_span["km_end"] - main_span["km_start"] > 0.4
    assert "Verrazzano" in main_span["reason"]
    # Flagged stretches are the exception: almost all of the course is measured.
    assert sum(span["km_end"] - span["km_start"] for span in spans) < 2.0


def test_committed_nyc_bundle_matches_the_schema_and_the_real_course():
    bundle = json.loads(BUNDLE.read_text())

    validate_bundle(bundle)
    assert bundle["course"]["timezone"] == "America/New_York"
    check_nyc_course_line(bundle["measured"]["course_line"])
    check_nyc_not_measured(bundle["measured"]["elevation_not_measured"])
    # The data it was built from is named, with a licence and the date it was fetched.
    assert {"route", "nyc-dem-2017", "nyc-lidar-2017", "openstreetmap"} == {s["id"] for s in bundle["sources"]}


@pytest.mark.skipif(not (CACHE / "dem").exists() or not (CACHE / "lidar").exists(), reason="real NYC inputs not cached")
def test_real_nyc_course_rebuilds_from_the_cached_inputs():
    facts = load_course_facts(FACTS)
    try:
        bundle = build_course_bundle(
            facts,
            load_route(facts, allow_download=False),
            nyc_dem.elevation_model(allow_download=False),
            decks=nyc_lidar.deck_model(allow_download=False),
            editions=load_editions(FACTS.parent, facts.timezone),
        )
    except FileNotFoundError as missing:  # streets, DEM blocks or LiDAR points not cached
        pytest.skip(str(missing))

    check_nyc_course_line(bundle["measured"]["course_line"])
    check_nyc_not_measured(bundle["measured"]["elevation_not_measured"])

"""Optional real-data check for Berlin. Runs only when the local cache holds the real inputs
(after `uv run geopace build berlin` has been run once); otherwise it is skipped."""

import json
from pathlib import Path

import numpy as np
import pytest

from geopace import berlin_dgm1, berlin_dom1, geoid_egm2008
from geopace.bundle import build_course_bundle, validate_bundle
from geopace.cache import cache_dir
from geopace.course_facts import load_course_facts
from geopace.edition_facts import load_editions
from geopace.route import parse_gpx

REPO = Path(__file__).parents[2]
ROUTE = cache_dir() / "berlin" / "route.gpx"
TILES = cache_dir() / "berlin" / "dgm1"
SURFACE_TILES = cache_dir() / "berlin" / "dom1"


def test_committed_berlin_bundle_matches_the_schema():
    bundle = json.loads((REPO / "data" / "derived" / "berlin" / "course-bundle.json").read_text())
    validate_bundle(bundle)


def check_berlin_ellipsoid_heights(line: dict) -> None:
    """In Berlin sea level is about 39.5 m *above* the ellipsoid; in New York it is 32.5 m below.
    Opposite signs, so the two cities' offsets can't be swapped, dropped or flipped unnoticed."""
    sea_level = np.array(line["ellipsoid_height_m"]) - np.array(line["elevation_m"])
    # Published independently of this pipeline: GeographicLib's GeoidEval gives EGM2008 as +39.56 m
    # at the start on Straße des 17. Juni (52.5147, 13.3615)
    # (https://geographiclib.sourceforge.io/cgi-bin/GeoidEval, accessed 2026-09-18).
    assert sea_level[0] == pytest.approx(39.56, abs=0.06)
    assert 39.3 < sea_level.min() and sea_level.max() < 39.9


def test_committed_berlin_bundle_carries_the_height_above_the_ellipsoid():
    bundle = json.loads((REPO / "data" / "derived" / "berlin" / "course-bundle.json").read_text())

    check_berlin_ellipsoid_heights(bundle["measured"]["course_line"])
    assert "geoid-egm2008" in {source["id"] for source in bundle["sources"]}


def test_berlins_bridges_are_measured_not_drawn_as_straight_lines():
    """Berlin's ground model leaves the bridge decks out. The pipeline used to draw a straight
    line across each one (PLAN.md D18) and flag it as not measured; it now reads the deck from the
    city's surface model, so nothing on the Berlin course is filled in."""
    bundle = json.loads((REPO / "data" / "derived" / "berlin" / "course-bundle.json").read_text())

    assert bundle["measured"]["elevation_not_measured"] == []
    assert "berlin-dom1" in {source["id"] for source in bundle["sources"]}
    assert any("DOM1" in credit["text"] for credit in bundle["attributions"])

    # The decks are where bridges are: above the street at their ends by no more than an arch.
    # A tree's canopy or a lorry taken for the deck would stand metres clear of this.
    facts = load_course_facts(REPO / "data" / "courses" / "berlin" / "course.yaml")
    line = bundle["measured"]["course_line"]
    km, elevation = np.array(line["km"]), np.array(line["elevation_m"])
    for bridge in facts.bridges:
        on = elevation[(km >= bridge.km_start) & (km <= bridge.km_end)]
        ends = elevation[[np.argmin(np.abs(km - bridge.km_start)), np.argmin(np.abs(km - bridge.km_end))]]
        assert on.max() - ends.max() < 2.0, bridge.name
        assert on.min() - ends.min() > -1.0, bridge.name
    # The Michaelbrücke is arched: its deck crests above both of its ends, which no straight line can.
    michael = elevation[(km >= 12.81) & (km <= 12.90)]
    assert michael.max() > max(elevation[np.argmin(np.abs(km - 12.78))], elevation[np.argmin(np.abs(km - 12.93))])


@pytest.mark.skipif(not (ROUTE.exists() and any(TILES.glob("*.zip")) and any(SURFACE_TILES.glob("*.zip"))), reason="real Berlin inputs not cached")
def test_real_berlin_course_is_marathon_length_with_no_absurd_grades():
    facts = load_course_facts(REPO / "data" / "courses" / "berlin" / "course.yaml")
    try:
        bundle = build_course_bundle(
            facts,
            parse_gpx(ROUTE.read_text()),
            berlin_dgm1.elevation_model(allow_download=False),
            decks=berlin_dom1.deck_model(allow_download=False),
            editions=load_editions(REPO / "data" / "courses" / "berlin", facts.timezone),
            geoid=geoid_egm2008.geoid_model(allow_download=False),
        )
    except (berlin_dgm1.TilesNotCached, geoid_egm2008.GridNotCached) as missing:
        pytest.skip(str(missing))
    line = bundle["measured"]["course_line"]
    check_berlin_ellipsoid_heights(line)

    assert line["length_m"] == pytest.approx(42195, rel=0.01)
    # Berlin is famously flat; the steepest real stretch is the ~3% ramp off the Kronprinzenbrücke.
    # A bridge deck missing from the ground model shows up as a ~5% plunge to the water.
    assert np.max(np.abs(line["grade"])) < 0.04
    # Berlin's streets sit roughly 30-60 m above sea level; bridges must not dip to the Spree (~30.8 m).
    assert 31.5 < min(line["elevation_m"]) and max(line["elevation_m"]) < 65
    assert all(d is not None for d in line["difficulty"])

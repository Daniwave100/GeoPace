"""Seam: a surface model (ground plus everything standing on it, as a 1 m grid) -> the height of
a bridge deck under the course. Berlin's bare-earth model leaves bridge decks out, and the
straight line the pipeline used to draw across each one (PLAN.md D18) is a guess: the
Kronprinzenbrücke is arched and crests 1.7 m above it. The surface model has the deck in it,
along with whatever else was there on the day of the flight: cars, lamp posts, overhanging trees."""

import numpy as np
import pytest

from geopace import berlin_dom1
from geopace.bundle import build_course_bundle
from geopace.course_facts import parse_course_facts
from geopace.elevation import BridgeDeckModel

from conftest import meters_north_of, parsed_synthetic_editions, straight_north_route, synthetic_elevation, synthetic_geoid

START_LAT = 52.5
ORIGIN = berlin_dom1.to_utm33(13.4, START_LAT)  # the synthetic route runs due north from here


def northing_m(cell_y):
    """Metres north of the start, for a cell of the synthetic surface."""
    return np.asarray(cell_y, dtype=float) + 0.5 - ORIGIN[1]


def river_ground(lat, lon):
    """Bare earth: a 36 m street, and between 2.00 and 2.10 km the river, 6 m below the missing deck."""
    d = meters_north_of(lat, START_LAT)
    return np.where((d > 2005) & (d < 2095), 30.0, 36.0)


def arched_deck(d):
    """The deck the ground model leaves out: level with the street at both ends, 1.5 m higher in the middle."""
    return 36.0 + 1.5 * np.clip(1 - np.abs(d - 2050) / 50, 0, 1)


def surface(clutter):
    """A surface model: the street, the arched deck over the river, and `clutter(d, cell_x)` metres of
    whatever stands on it."""

    def heights(cell_x, cell_y):
        d = northing_m(cell_y)
        return arched_deck(d) + clutter(d, np.asarray(cell_x, dtype=float))

    return heights


def build(synthetic_facts, heights):
    source = {"source": "https://example.org/bridge", "accessed": "2026-09-18"}
    synthetic_facts["bridges"] = [{"name": "Arched bridge", "km_start": 2.0, "km_end": 2.1, **source}]
    decks = BridgeDeckModel(returns=berlin_dom1.returns_from(heights), source=berlin_dom1.SOURCE, attribution=berlin_dom1.ATTRIBUTION)
    return build_course_bundle(
        parse_course_facts(synthetic_facts),
        route=straight_north_route(5000),
        elevation=synthetic_elevation(river_ground),
        decks=decks,
        editions=parsed_synthetic_editions(),
        geoid=synthetic_geoid(),
    )


def crest(bundle):
    line = bundle["measured"]["course_line"]
    km = np.array(line["km"])
    return float(np.max(np.array(line["elevation_m"])[(km > 2.0) & (km < 2.1)]))


def test_an_arched_bridge_is_measured_at_its_deck_not_drawn_as_a_straight_line(synthetic_facts):
    bundle = build(synthetic_facts, surface(lambda d, x: 0.0))

    # The straight line between the two ends would say 36.0 all the way across. The deck crests
    # at 37.5; the pipeline's 50 m smoothing, which is there so that grades describe the 100-200 m
    # of road a runner feels, keeps about a third of a bump this short.
    assert crest(bundle) == pytest.approx(36.5, abs=0.15)
    # Measured, so nothing on it is flagged as filled in.
    assert bundle["measured"]["elevation_not_measured"] == []
    assert "berlin-dom1" in {source["id"] for source in bundle["sources"]}


def test_a_lamp_post_and_a_passing_car_do_not_lift_the_deck(synthetic_facts):
    def clutter(d, x):
        lamp_post = np.where((np.abs(d - 2040) < 0.6) & (np.abs(x - np.floor(ORIGIN[0])) < 0.6), 8.0, 0.0)
        car = np.where((d > 2060) & (d < 2065) & (x - np.floor(ORIGIN[0]) > 0) & (x - np.floor(ORIGIN[0]) < 2.5), 1.5, 0.0)
        return lamp_post + car

    clean = crest(build(dict(synthetic_facts), surface(lambda d, x: 0.0)))
    assert crest(build(synthetic_facts, surface(clutter))) == pytest.approx(clean, abs=0.1)


def test_a_tree_over_one_side_of_the_deck_is_not_mistaken_for_the_deck(synthetic_facts):
    # Canopy 9 m up over the eastern half of the roadway for 20 m: two layers, and the deck is the
    # one that carries on from the samples either side.
    canopy = lambda d, x: np.where((d > 2020) & (d < 2040) & (x > np.floor(ORIGIN[0])), 9.0, 0.0)  # noqa: E731
    bundle = build(synthetic_facts, surface(canopy))

    assert crest(bundle) < 38.0
    line = bundle["measured"]["course_line"]
    assert np.max(np.abs(line["grade"])) < 0.04


def test_cells_near_a_point_are_the_ones_within_the_radius_and_holes_are_left_out():
    def heights(cell_x, cell_y):
        h = np.full(np.shape(cell_x), 40.0)
        h[(np.asarray(cell_x) == 100) & (np.asarray(cell_y) == 200)] = np.nan  # no data in this cell
        return h

    near = berlin_dom1.cells_within(heights, easting=100.5, northing=200.5, radius_m=2.0)

    # 13 cells have their centre within 2 m of the point; one of them has no data.
    assert len(near) == 12
    assert np.all(near == 40.0)

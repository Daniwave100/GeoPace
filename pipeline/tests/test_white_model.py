"""The committed White models: what the app actually loads for each course (issue #7).

These read data/derived/<course>/white-model.json, which is committed, so they run everywhere —
no cache and no downloads needed.
"""

import json
import statistics
from pathlib import Path

import numpy as np
import pytest

from geopace.buildings import inside_ring, near_the_road
from geopace.white_model import FILE_NAME, SCHEMA_VERSION, WhiteModelInvalid, validate_white_model

REPO = Path(__file__).parents[2]
COURSES = ["berlin", "nyc"]


def committed(course: str, name: str) -> dict:
    return json.loads((REPO / "data" / "derived" / course / name).read_text(encoding="utf-8"))


def heights_m(model: dict) -> list[float]:
    return [roof - base for roof, base in zip(model["buildings"]["roof_m"], model["buildings"]["base_m"])]


def ring_of(model: dict, i: int) -> np.ndarray:
    flat = model["buildings"]["ring"][i]
    return np.array(flat, dtype=float).reshape(-1, 2)


@pytest.mark.parametrize("course", COURSES)
def test_the_committed_white_model_matches_its_schema(course):
    validate_white_model(committed(course, FILE_NAME))


@pytest.mark.parametrize("course", COURSES)
def test_the_bundle_beside_it_names_it_counts_it_and_carries_its_credits(course):
    """The app reads the bundle first: the credits have to be there before the geometry arrives."""
    model = committed(course, FILE_NAME)
    bundle = committed(course, "course-bundle.json")
    white = bundle["measured"]["white_model"]

    assert white["file"] == FILE_NAME
    assert white["buildings"] == len(model["buildings"]["ring"])
    assert white["corridor_m"] == model["corridor_m"]
    assert model["schema_version"] == SCHEMA_VERSION
    for credit in model["attributions"]:
        assert credit in bundle["attributions"]
    for source in model["sources"]:
        assert source in bundle["sources"]


@pytest.mark.parametrize("course", COURSES)
def test_every_block_is_a_shape_with_its_roof_over_its_base(course):
    model = committed(course, FILE_NAME)
    blocks = model["buildings"]

    assert len(blocks["ring"]) > 1000
    assert all(len(ring) >= 6 and len(ring) % 2 == 0 for ring in blocks["ring"])
    assert all(roof >= base for roof, base in zip(blocks["roof_m"], blocks["base_m"]))


@pytest.mark.parametrize("course", COURSES)
def test_no_block_is_a_sliver_or_taller_than_the_tallest_thing_in_the_city(course):
    """A height read in the wrong unit, or off the wrong column, lands outside this at once."""
    heights = heights_m(committed(course, FILE_NAME))

    assert min(heights) >= 2.0
    assert max(heights) < 600  # New York's tallest on the course is about 470 m; Berlin's about 120 m
    assert 5 < statistics.median(heights) < 30


def test_berlins_blocks_stand_above_the_ellipsoid_and_new_yorks_below_it():
    """Sea level is about 39.5 m *above* the ellipsoid in Berlin and 32.5 m *below* it in New York
    (PLAN.md D51). Opposite signs, so a missing, swapped or flipped offset can't pass: it would
    bury a city 70 m underground or float it 70 m up."""
    berlin = committed("berlin", FILE_NAME)["buildings"]["base_m"]
    nyc = committed("nyc", FILE_NAME)["buildings"]["base_m"]

    # Berlin's ground runs about 27 to 56 m above sea level, plus 39.5.
    assert 60 < min(berlin) and max(berlin) < 100
    # New York's runs from about sea level to 40 m above it, minus 32.7.
    assert min(nyc) < 0 and max(nyc) < 20


def test_the_tallest_block_on_each_course_is_the_tower_that_really_stands_there():
    """Two towers a person can check by eye against the map, one per city."""
    nyc = committed("nyc", FILE_NAME)
    tallest = int(np.argmax(heights_m(nyc)))
    ring = ring_of(nyc, tallest)
    # Central Park Tower, 217 West 57th Street: a roof about 472 m over Central Park South, which
    # the course runs along in its last two kilometers.
    assert 440 < max(heights_m(nyc)) < 500
    assert ring[:, 0].mean() == pytest.approx(-73.981, abs=0.002)
    assert ring[:, 1].mean() == pytest.approx(40.766, abs=0.002)

    berlin = committed("berlin", FILE_NAME)
    ring = ring_of(berlin, int(np.argmax(heights_m(berlin))))
    # The towers at Breitscheidplatz in Charlottenburg, which the course passes near its end: the
    # tallest thing on a course that is otherwise all six-storey blocks.
    assert 110 < max(heights_m(berlin)) < 135
    assert ring[:, 0].mean() == pytest.approx(13.333, abs=0.003)
    assert ring[:, 1].mean() == pytest.approx(52.505, abs=0.003)


@pytest.mark.parametrize("course", COURSES)
def test_every_block_really_is_within_the_corridor_of_the_course(course):
    """The file says how far either side of the course it reaches; a block further away than that
    would be a corridor that doesn't mean what it says."""
    model = committed(course, FILE_NAME)
    line = committed(course, "course-bundle.json")["measured"]["course_line"]
    lat, lon = np.array(line["lat"]), np.array(line["lon"])
    # A block was chosen by its outline as the city published it, and the outline was then
    # simplified: a corner dropped from a wall can leave the wall a tolerance further out.
    reach_m = model["corridor_m"] + model["simplified_m"]

    # One in every hundred: the whole course line against every block would be tens of millions of
    # distances, and a mistake in the corridor would be in all of them, not one.
    for i in range(0, len(model["buildings"]["ring"]), 100):
        ring = ring_of(model, i)
        assert near_the_road(ring, lat, lon, reach_m), f"block {i} of {course} is outside the corridor"


# Whether the blocks on screen cast the shade the numbers claim is checked where both live:
# tests/test_shade.py works the shade out again from this very file and holds it against the
# table the app reads.


@pytest.mark.parametrize("course", COURSES)
def test_the_file_stays_inside_the_size_it_is_allowed_to_be_committed_at(course):
    """A marathon's worth of outlines is the biggest thing in the repo. Beyond this it stops being
    something a runner can just clone and run, and would have to be fetched by a set-up step."""
    size_mb = (REPO / "data" / "derived" / course / FILE_NAME).stat().st_size / 1024 / 1024

    assert size_mb < 8, f"{course}'s White model is {size_mb:.1f} MB"


def test_an_invalid_white_model_is_refused_with_every_problem_named():
    model = committed("berlin", FILE_NAME)
    model["buildings"]["roof_m"] = model["buildings"]["roof_m"][:-1]

    with pytest.raises(WhiteModelInvalid) as refused:
        validate_white_model(model)
    assert "different lengths" in str(refused.value)


def test_a_block_turned_inside_out_is_refused():
    model = committed("berlin", FILE_NAME)
    model["buildings"]["roof_m"][4] = model["buildings"]["base_m"][4] - 0.5

    with pytest.raises(WhiteModelInvalid) as refused:
        validate_white_model(model)
    assert "below its base" in str(refused.value)

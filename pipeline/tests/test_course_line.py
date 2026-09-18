"""Seam 1: inputs -> Course Bundle. The course line part (distance, elevation, grade)."""

import numpy as np
import pytest

from geopace.bundle import build_course_bundle
from geopace.course_facts import CourseFactsInvalid, parse_course_facts

from conftest import meters_north_of, straight_north_route, synthetic_decks, parsed_synthetic_editions, synthetic_elevation, synthetic_geoid

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
        editions=parsed_synthetic_editions(),
        geoid=synthetic_geoid(),
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
            editions=parsed_synthetic_editions(),
            geoid=synthetic_geoid(),
        )
    )
    km = np.array(line["km"])
    elevation = np.array(line["elevation_m"])

    assert np.min(elevation[(km > 1.9) & (km < 2.2)]) > 35.5
    assert np.max(np.abs(line["grade"])) < 0.005


def bay_without_bridge_deck(lat, lon):
    """Streets 5 m above sea level with a bay (0 m) between 1.5 and 3.5 km. A bare-earth
    model has no bridge in it at all: across the bay it reports the water."""
    d = meters_north_of(lat, START_LAT)
    return np.where((d > 1500) & (d < 3500), 0.0, 5.0)


def high_arched_deck(d):
    """A tall bridge: its deck leaves the street at 1.2 km, peaks 60 m up at 2.5 km, lands at 3.8 km."""
    return 5.0 + 55.0 * (1 - np.abs(d - 2500) / 1300)


def deck_returns(decks_at):
    """LiDAR-like bridge-deck returns: a few heights per deck, near every point on the bridge."""

    def returns(lat, lon):
        d = meters_north_of(lat, START_LAT)
        out = []
        for di in d:
            heights = decks_at(di) if 1200 <= di <= 3800 else []
            out.append(np.concatenate([h + np.array([-0.1, 0.0, 0.05, 0.1]) for h in heights]) if heights else np.empty(0))
        return out

    return returns


def with_test_bridge(synthetic_facts, **bridge):
    """The synthetic course facts, with one sourced bridge from km 1.2 to km 3.8."""
    synthetic_facts["bridges"] = [
        {
            "name": "Test Narrows Bridge",
            "km_start": 1.2,
            "km_end": 3.8,
            "source": "https://example.org/bridge",
            "accessed": "2026-09-17",
            **bridge,
        }
    ]
    return synthetic_facts


def build_with_decks(synthetic_facts, bridge, decks_at, geoid=None):
    with_test_bridge(synthetic_facts, **bridge)
    return build_course_bundle(
        parse_course_facts(synthetic_facts),
        route=straight_north_route(5000),
        elevation=synthetic_elevation(bay_without_bridge_deck),
        decks=synthetic_decks(deck_returns(decks_at)),
        editions=parsed_synthetic_editions(),
        geoid=geoid or synthetic_geoid(),
    )


def test_a_high_bridge_the_ground_model_drops_is_measured_at_deck_height(synthetic_facts):
    bundle = build_with_decks(synthetic_facts, {}, lambda d: [high_arched_deck(d)])
    line = course_line(bundle)
    km = np.array(line["km"])
    elevation = np.array(line["elevation_m"])

    # The top of the bridge, not the water 60 m below it.
    assert np.max(elevation) == pytest.approx(60, abs=2)
    assert elevation[np.argmin(np.abs(km - 2.5))] == pytest.approx(60, abs=2)
    over_water = elevation[(km > 1.5) & (km < 3.5)]
    assert np.min(over_water) > 10
    # A steady ~4% ramp up and down, not a plunge to sea level.
    assert np.max(np.abs(line["grade"])) < 0.05
    assert {s["url"] for s in bundle["sources"]} >= {"https://example.org/lidar"}
    assert "Synthetic LiDAR" in {a["text"] for a in bundle["attributions"]}


def test_on_a_double_deck_bridge_the_course_is_on_the_deck_runners_use(synthetic_facts):
    two_decks = lambda d: [high_arched_deck(d), high_arched_deck(d) + 6.4]  # noqa: E731

    lower = course_line(build_with_decks(synthetic_facts, {"deck": "lower"}, two_decks))
    upper = course_line(build_with_decks(synthetic_facts, {"deck": "upper"}, two_decks))

    assert np.max(lower["elevation_m"]) == pytest.approx(60, abs=2)
    assert np.max(upper["elevation_m"]) == pytest.approx(66.4, abs=2)


def test_the_height_above_the_ellipsoid_is_still_the_deck_runners_use(synthetic_facts):
    """New York: sea level is 32.5 m *below* the ellipsoid. The 3D line has to come out on the
    Queensboro's lower deck, 6.4 m under the upper one, not on top of the bridge."""
    two_decks = lambda d: [high_arched_deck(d), high_arched_deck(d) + 6.4]  # noqa: E731
    new_york = synthetic_geoid(lambda lat, lon: np.full(np.shape(lat), -32.5))

    lower = course_line(build_with_decks(synthetic_facts, {"deck": "lower"}, two_decks, geoid=new_york))
    upper = course_line(build_with_decks(synthetic_facts, {"deck": "upper"}, two_decks, geoid=new_york))

    crest = int(np.argmax(lower["elevation_m"]))
    assert upper["ellipsoid_height_m"][crest] - lower["ellipsoid_height_m"][crest] == pytest.approx(6.4, abs=0.05)
    # 60 m above sea level is 27.5 m above the ellipsoid there: added, with its sign, not subtracted.
    assert lower["ellipsoid_height_m"][crest] == pytest.approx(60 - 32.5, abs=2)
    assert lower["ellipsoid_height_m"][crest] - lower["elevation_m"][crest] == pytest.approx(-32.5, abs=0.011)


def bay_with_no_ground_at_all(lat, lon):
    """Like a real bare-earth model over open water: no data, not even the water surface."""
    d = meters_north_of(lat, START_LAT)
    return np.where((d > 1500) & (d < 3500), np.nan, 5.0)


def test_water_with_no_ground_data_is_fine_where_a_bridge_carries_the_course(synthetic_facts):
    with_test_bridge(synthetic_facts)

    line = course_line(
        build_course_bundle(
            parse_course_facts(synthetic_facts),
            route=straight_north_route(5000),
            elevation=synthetic_elevation(bay_with_no_ground_at_all),
            decks=synthetic_decks(deck_returns(lambda d: [high_arched_deck(d)])),
            editions=parsed_synthetic_editions(),
            geoid=synthetic_geoid(),
        )
    )

    assert np.max(line["elevation_m"]) == pytest.approx(60, abs=2)
    assert all(np.isfinite(line["elevation_m"]))


def test_missing_ground_where_no_bridge_carries_the_course_is_refused(synthetic_facts):
    with pytest.raises(ValueError, match=r"No elevation at km 1\.5"):
        build_course_bundle(
            parse_course_facts(synthetic_facts),
            route=straight_north_route(5000),
            elevation=synthetic_elevation(bay_with_no_ground_at_all),
            editions=parsed_synthetic_editions(),
            geoid=synthetic_geoid(),
        )


def test_a_structure_passing_overhead_is_not_mistaken_for_a_second_deck(synthetic_facts):
    # A few returns off a ramp crossing above the bridge, against a deck's worth underneath.
    def returns(lat, lon):
        out = []
        for di in meters_north_of(lat, START_LAT):
            if not 1200 <= di <= 3800:
                out.append(np.empty(0))
                continue
            deck = high_arched_deck(di) + np.linspace(-0.1, 0.1, 400)
            overhead = high_arched_deck(di) + 8 + np.linspace(-0.1, 0.1, 5) if 2000 <= di <= 2100 else np.empty(0)
            out.append(np.concatenate([deck, overhead]))
        return out

    with_test_bridge(synthetic_facts)
    line = course_line(
        build_course_bundle(
            parse_course_facts(synthetic_facts),
            route=straight_north_route(5000),
            elevation=synthetic_elevation(bay_without_bridge_deck),
            decks=synthetic_decks(returns),
            editions=parsed_synthetic_editions(),
            geoid=synthetic_geoid(),
        )
    )

    assert np.max(line["elevation_m"]) == pytest.approx(60, abs=2)
    assert np.max(np.abs(line["grade"])) < 0.05


def test_a_bridge_passing_under_another_structure_keeps_its_own_deck(synthetic_facts):
    """A ramp crossing above the bridge leaves as many returns as the deck itself, but only for a
    moment: the deck is the layer that carries on from the samples either side."""

    def returns(lat, lon):
        out = []
        for di in meters_north_of(lat, START_LAT):
            if not 1200 <= di <= 3800:
                out.append(np.empty(0))
                continue
            deck = high_arched_deck(di) + np.linspace(-0.1, 0.1, 400)
            crossing = high_arched_deck(di) + 7 + np.linspace(-0.1, 0.1, 400) if 2000 <= di <= 2100 else np.empty(0)
            out.append(np.concatenate([deck, crossing]))
        return out

    with_test_bridge(synthetic_facts)
    line = course_line(
        build_course_bundle(
            parse_course_facts(synthetic_facts),
            route=straight_north_route(5000),
            elevation=synthetic_elevation(bay_without_bridge_deck),
            decks=synthetic_decks(returns),
            editions=parsed_synthetic_editions(),
            geoid=synthetic_geoid(),
        )
    )
    km = np.array(line["km"])
    elevation = np.array(line["elevation_m"])

    # The course stays on its own deck under the crossing, instead of jumping 7 m up and back.
    under = elevation[(km > 2.0) & (km < 2.1)]
    assert np.max(under) < high_arched_deck(2100) + 2
    assert np.max(np.abs(line["grade"])) < 0.05


def test_a_double_deck_bridge_must_say_which_deck(synthetic_facts):
    two_decks = lambda d: [high_arched_deck(d), high_arched_deck(d) + 6.4]  # noqa: E731

    with pytest.raises(ValueError, match=r"Test Narrows Bridge.*deck: upper.*lower"):
        build_with_decks(synthetic_facts, {}, two_decks)


def test_a_listed_bridge_with_no_deck_in_the_surface_data_is_refused(synthetic_facts):
    with pytest.raises(ValueError, match=r"Test Narrows Bridge.*no bridge deck"):
        build_with_decks(synthetic_facts, {}, lambda d: [])


def test_a_bridge_deck_must_be_upper_or_lower(synthetic_facts):
    source = {"source": "https://example.org/bridge", "accessed": "2026-09-17"}
    synthetic_facts["bridges"] = [{"name": "Test bridge", "km_start": 2.0, "km_end": 2.08, "deck": "middle", **source}]

    with pytest.raises(CourseFactsInvalid, match=r"bridges\[0\] \(Test bridge\).*deck"):
        parse_course_facts(synthetic_facts)


def test_a_bridge_without_a_source_is_rejected(synthetic_facts):
    synthetic_facts["bridges"] = [{"name": "Test bridge", "km_start": 2.0, "km_end": 2.08}]

    with pytest.raises(CourseFactsInvalid, match=r"bridges\[0\] \(Test bridge\).*source"):
        parse_course_facts(synthetic_facts)


# ---- Where the height is not measured: the bundle has to say so, or the app draws a guess as a fact.


def not_measured(bundle):
    return bundle["measured"]["elevation_not_measured"]


def test_a_course_measured_all_the_way_has_nothing_to_flag(synthetic_facts):
    bundle = build_course_bundle(
        parse_course_facts(synthetic_facts),
        route=straight_north_route(5000),
        elevation=hill_with_noise(),
        editions=parsed_synthetic_editions(),
        geoid=synthetic_geoid(),
    )

    assert not_measured(bundle) == []


def test_a_bridge_spanned_in_a_straight_line_is_flagged_as_not_measured(synthetic_facts):
    source = {"source": "https://example.org/bridge", "accessed": "2026-09-16"}
    synthetic_facts["bridges"] = [{"name": "Test bridge", "km_start": 2.0, "km_end": 2.08, **source}]

    bundle = build_course_bundle(
        parse_course_facts(synthetic_facts),
        route=straight_north_route(5000),
        elevation=synthetic_elevation(river_without_bridge_deck),
        editions=parsed_synthetic_editions(),
        geoid=synthetic_geoid(),
    )

    [span] = not_measured(bundle)
    assert span["km_start"] == pytest.approx(2.0, abs=0.011)
    assert span["km_end"] == pytest.approx(2.08, abs=0.011)
    # Said for the runner: which bridge, and that the height is a straight line, not a survey.
    assert "Test bridge" in span["reason"]
    assert "straight line" in span["reason"]


def deck_returns_with_a_hole(hole_from_m, hole_to_m):
    """A deck the scan covers everywhere except one stretch, like the Verrazzano's main span."""
    complete = deck_returns(lambda d: [high_arched_deck(d)])

    def returns(lat, lon):
        d = meters_north_of(lat, START_LAT)
        return [np.empty(0) if hole_from_m <= di <= hole_to_m else found for di, found in zip(d, complete(lat, lon))]

    return returns


def build_with_a_hole(synthetic_facts, hole_from_m, hole_to_m):
    with_test_bridge(synthetic_facts)
    return build_course_bundle(
        parse_course_facts(synthetic_facts),
        route=straight_north_route(5000),
        elevation=synthetic_elevation(bay_without_bridge_deck),
        decks=synthetic_decks(deck_returns_with_a_hole(hole_from_m, hole_to_m)),
        editions=parsed_synthetic_editions(),
        geoid=synthetic_geoid(),
    )


def test_a_gap_in_the_scan_of_a_bridge_deck_is_flagged_and_the_measured_deck_is_not(synthetic_facts):
    bundle = build_with_a_hole(synthetic_facts, 2200, 2800)

    # Only the hole: the rest of the 2.6 km bridge has measured deck heights and stays unflagged.
    [span] = not_measured(bundle)
    assert span["km_start"] == pytest.approx(2.2, abs=0.011)
    assert span["km_end"] == pytest.approx(2.8, abs=0.011)
    assert "Test Narrows Bridge" in span["reason"]
    assert "straight line" in span["reason"]


def test_a_gap_too_short_to_change_the_smoothed_height_is_not_flagged(synthetic_facts):
    # Two samples without returns (20 m) vanish inside the 50 m smoothing; flagging them would
    # pepper every bridge with specks nobody can act on.
    bundle = build_with_a_hole(synthetic_facts, 2495, 2515)

    assert not_measured(bundle) == []


def test_flagged_stretches_lie_on_the_course_in_order_and_never_overlap(synthetic_facts):
    source = {"source": "https://example.org/bridge", "accessed": "2026-09-16"}
    synthetic_facts["bridges"] = [
        {"name": "First bridge", "km_start": 1.0, "km_end": 1.1, **source},
        {"name": "Second bridge", "km_start": 3.0, "km_end": 3.2, **source},
    ]

    spans = not_measured(
        build_course_bundle(
            parse_course_facts(synthetic_facts),
            route=straight_north_route(5000),
            elevation=hill_with_noise(),
            editions=parsed_synthetic_editions(),
            geoid=synthetic_geoid(),
        )
    )

    assert [span["reason"].count("bridge") > 0 for span in spans] == [True, True]
    assert all(0 <= span["km_start"] < span["km_end"] <= 5.0 for span in spans)
    assert spans[0]["km_end"] <= spans[1]["km_start"]

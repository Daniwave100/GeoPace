"""Bridge decks from a tiled LiDAR point cloud: only tiles along the course are read, and the
points read are cached locally."""

import numpy as np
import pytest
from pyproj import Transformer

from geopace.lidar_decks import BRIDGE_DECK, MIN_DECK_OVERHEAD_M, LidarTile, deck_heights, decks_over, lidar_deck_model
from geopace.provenance import Attribution, Source

UTM18 = Transformer.from_crs("EPSG:6347", "EPSG:4326", always_xy=True)
SOURCE = Source(id="test-lidar", title="Test LiDAR", url="https://example.org/lidar", licence="test", accessed="2026-09-17")
CREDIT = Attribution(text="Test LiDAR", url="https://example.org/lidar")


def tile(name, west, south, size=762):
    return LidarTile(name=name, url=f"https://example.org/{name}.copc.laz", min_x=west, min_y=south, max_x=west + size, max_y=south + size)


# Four 762 m tiles in a row (west to east) and one far to the north.
TILES = [tile("a", 580_000, 4_500_000), tile("b", 580_762, 4_500_000), tile("c", 581_524, 4_500_000), tile("d", 582_286, 4_500_000), tile("far", 580_000, 4_530_000)]


class FakeTiles:
    """Every tile holds a flat deck at 40 m along y = 4,500,300 (classified bridge deck), ground
    points at 2 m everywhere, and a stray unclassified point at 90 m (a light pole)."""

    def __init__(self):
        self.read = []

    def __call__(self, t, min_x, min_y, max_x, max_y):
        self.read.append(t.name)
        xs = np.arange(max(min_x, t.min_x), min(max_x, t.max_x), 0.5)
        n = len(xs)
        points = np.zeros(3 * n, dtype=[("x", "f8"), ("y", "f8"), ("z", "f8"), ("classification", "u1")])
        points["x"] = np.tile(xs, 3)
        points["y"] = np.concatenate([np.full(n, 4_500_300.0), np.full(n, 4_500_301.0), np.full(n, 4_500_300.5)])
        points["z"] = np.concatenate([np.full(n, 40.0), np.full(n, 2.0), np.full(n, 90.0)])
        points["classification"] = np.concatenate([np.full(n, BRIDGE_DECK), np.full(n, 2), np.full(n, 1)])
        keep = (points["y"] >= min_y) & (points["y"] <= max_y)
        return points[keep]


def lat_lon(xs, ys):
    lon, lat = UTM18.transform(np.asarray(xs, dtype=float), np.asarray(ys, dtype=float))
    return np.asarray(lat), np.asarray(lon)


def test_only_tiles_along_the_course_are_read_and_the_points_are_cached(tmp_path):
    reader = FakeTiles()
    decks = lidar_deck_model(TILES, reader, tmp_path, SOURCE, CREDIT)
    # A bridge running east from the middle of tile a into tile b, along the deck.
    lat, lon = lat_lon(np.arange(580_400, 581_100, 10), np.full(70, 4_500_300))

    returns = decks.returns(lat, lon)

    assert set(reader.read) == {"a", "b"}
    assert len(returns) == 70
    # Only bridge-deck returns count: no ground, no light pole.
    assert all(len(r) > 0 and np.all(r == 40.0) for r in returns)
    assert list(tmp_path.rglob("*")), "the points read should be cached on disk"

    reader.read.clear()
    again = lidar_deck_model(TILES, reader, tmp_path, SOURCE, CREDIT).returns(lat, lon)
    assert reader.read == []
    assert all(np.array_equal(x, y) for x, y in zip(returns, again))


def test_points_away_from_the_deck_have_no_returns(tmp_path):
    decks = lidar_deck_model(TILES, FakeTiles(), tmp_path, SOURCE, CREDIT)
    lat, lon = lat_lon([580_500, 580_500], [4_500_300, 4_500_600])  # on the deck, 300 m north of it

    on_deck, off_deck = decks.returns(lat, lon)

    assert len(on_deck) > 0
    assert len(off_deck) == 0


def test_a_course_outside_every_tile_is_refused(tmp_path):
    decks = lidar_deck_model(TILES, FakeTiles(), tmp_path, SOURCE, CREDIT)
    lat, lon = lat_lon([700_000], [4_500_300])

    with pytest.raises(ValueError, match=r"no LiDAR tiles"):
        decks.returns(lat, lon)


class TestTheDeckOverTheRunnersDeck:
    """A bridge deck is not a building (issue #42): the Queensboro's lower level runs under its
    upper level the whole way, and only the LiDAR knows. The same returns that give the deck under
    the runners' feet also hold the deck over their heads."""

    LOWER, UPPER = 44.0, 50.4  # the Queensboro's two levels, about 6.4 m apart (PLAN.md D23)

    def layer(self, height):
        return height + np.array([-0.1, 0.0, 0.05, 0.1])

    def test_on_the_lower_deck_the_upper_one_is_overhead_and_on_the_upper_deck_nothing_is(self):
        both = np.concatenate([self.layer(self.LOWER), self.layer(self.UPPER)])
        returns = [both, both, self.layer(self.LOWER), np.empty(0)]

        on_the_lower = deck_heights(returns, "lower", "test")
        over_the_lower = decks_over(returns, on_the_lower)
        assert over_the_lower[:2] == pytest.approx([self.UPPER, self.UPPER], abs=0.2)
        assert np.isnan(over_the_lower[2])  # the scan sees the lower deck alone: open sky
        assert np.isnan(over_the_lower[3])  # the scan sees nothing at all: nothing to say

        on_the_upper = deck_heights(returns, "upper", "test")
        assert np.isnan(decks_over(returns, on_the_upper)).all()

    def test_a_layer_too_close_to_be_driven_under_is_not_a_deck_overhead(self):
        """The scan sees top surfaces only: a second layer 3.5 m up has no road under it (a lorry
        needs four metres under a deck a metre thick). It is a parapet, a wall, or the roadway
        beside the course that the search radius caught — New York's exit ramp off the Queensboro
        shows one 3–5 m up for 100 m — and it keeps the sun off nobody."""
        close = np.concatenate([self.layer(self.LOWER), self.layer(self.LOWER + 3.5)])
        returns = [close]

        assert np.isnan(decks_over(returns, deck_heights(returns, "lower", "test"))).all()
        # A real deck overhead clears the bar, and the bar is at least a roof's headroom.
        from geopace.shade import UNDER_A_ROOF_M

        assert MIN_DECK_OVERHEAD_M >= UNDER_A_ROOF_M
        assert self.UPPER - self.LOWER > MIN_DECK_OVERHEAD_M

    def test_a_few_stray_returns_overhead_are_not_a_deck(self):
        """A sign, a light pole, a walkway: the same rule as for the deck itself (MIN_DECK_SHARE)."""
        deck = self.LOWER + np.linspace(-0.1, 0.1, 400)
        stray = np.array([self.UPPER, self.UPPER + 0.1, self.UPPER - 0.1])
        returns = [np.concatenate([deck, stray])]

        assert np.isnan(decks_over(returns, deck_heights(returns, None, "test"))).all()


class TestOneLayerSeenOnADoubleDeckBridge:
    """Issue #56. The scan sees top surfaces, so where the upper deck covers the lower one the lower
    deck is not seen at all, and the one layer left is the upper deck — whichever deck the course
    facts name. Which deck a lone layer is comes from the line it continues, drawn between the
    nearest points either side that saw both decks."""

    LOWER, UPPER = 44.0, 50.4  # the Queensboro's two levels (PLAN.md D23)

    def layer(self, height):
        return height + np.array([-0.1, 0.0, 0.05, 0.1])

    def both(self, lower=LOWER, upper=UPPER):
        return np.concatenate([self.layer(lower), self.layer(upper)])

    def test_the_upper_deck_seen_alone_is_not_the_lower_deck(self):
        """Today the lone layer is read as the lower deck because it is the lowest of one: a 6 m
        spike in the road, and no deck overhead where the deck overhead is all the scan saw."""
        returns = [self.both(), self.both(), self.layer(self.UPPER), self.layer(self.UPPER), self.both()]

        heights = deck_heights(returns, "lower", "test")

        assert heights[[0, 1, 4]] == pytest.approx([self.LOWER] * 3, abs=0.2)
        assert np.isnan(heights[2:4]).all()  # the lower deck was not seen: nothing to measure
        assert np.isnan(decks_over(returns, heights)[2:4]).all()  # and nothing to say over it either

    def test_the_lower_deck_seen_alone_is_the_lower_deck(self):
        returns = [self.both(), self.layer(self.LOWER), self.layer(self.LOWER), self.both()]

        assert deck_heights(returns, "lower", "test") == pytest.approx([self.LOWER] * 4, abs=0.2)

    def test_on_the_upper_deck_the_mirror_image(self):
        upper_alone = [self.both(), self.layer(self.UPPER), self.both()]
        lower_alone = [self.both(), self.layer(self.LOWER), self.both()]

        assert deck_heights(upper_alone, "upper", "test") == pytest.approx([self.UPPER] * 3, abs=0.2)
        assert np.isnan(deck_heights(lower_alone, "upper", "test")[1])

    def test_a_lone_layer_is_read_against_the_decks_lines_down_a_ramp(self):
        """Down the Queensboro's Manhattan ramp both decks fall about 0.6 m a sample, so a layer
        compared with one deck's height some samples away could be nearer the wrong deck. The
        lines are drawn between the points that saw both, on either side."""
        lower = 30.0 - 0.6 * np.arange(13)
        upper = lower + 7.3
        returns = [self.both(lower[i], upper[i]) if i < 5 or i > 9 else self.layer(upper[i]) for i in range(13)]

        heights = deck_heights(returns, "lower", "test")

        assert heights[:5] == pytest.approx(lower[:5], abs=0.2)
        assert heights[10:] == pytest.approx(lower[10:], abs=0.2)
        assert np.isnan(heights[5:10]).all()

    def test_where_the_scan_never_sees_both_decks_the_one_layer_is_the_named_deck(self):
        """The Verrazzano: the course is on the upper deck, which hides the lower one from the scan
        the whole way. There is no other deck's line to compare with, and the one layer seen is the
        deck the course facts name, as it has always been read."""
        returns = [self.layer(self.UPPER + 0.4 * i) for i in range(6)]

        assert deck_heights(returns, "upper", "test") == pytest.approx(self.UPPER + 0.4 * np.arange(6), abs=0.2)

    def test_two_layers_too_close_to_be_two_decks_are_no_measure_of_which_deck_a_lone_layer_is(self):
        """Off the Queensboro's exit ramp the scan sees a second layer 3–5 m up for 100 m: a wall or a
        roadway beside the course (MIN_DECK_OVERHEAD_M), not the upper deck. A lone layer past it is
        compared with the last point that saw two decks, not with the wall."""
        wall = np.concatenate([self.layer(26.0), self.layer(29.2)])  # 3.2 m apart
        returns = [self.both(28.3, 33.4), wall, self.layer(27.0)]

        heights = deck_heights(returns, "lower", "test")

        assert heights == pytest.approx([28.3, 26.0, 27.0], abs=0.2)

"""Bridge decks from a tiled LiDAR point cloud: only tiles along the course are read, and the
points read are cached locally."""

import numpy as np
import pytest
from pyproj import Transformer

from geopace.lidar_decks import BRIDGE_DECK, LidarTile, lidar_deck_model
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

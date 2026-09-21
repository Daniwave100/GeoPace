"""The buildings surface, on made-up buildings: no downloads."""

import math

import numpy as np
import pytest

from geopace.buildings import Building, BuildingsModel, buildings_along, corridor_boxes, distance_to_the_road, simplify_ring
from geopace.provenance import Attribution, Source

EARTH_RADIUS_M = 6_371_008.8


def square(id: str, lat: float, lon: float, side_m: float, ground_m: float, height_m: float) -> Building:
    """A square footprint centred on (lat, lon), standing `height_m` above `ground_m`."""
    half_lat = math.degrees(side_m / 2 / EARTH_RADIUS_M)
    half_lon = half_lat / math.cos(math.radians(lat))
    ring = np.array(
        [
            [lon - half_lon, lat - half_lat],
            [lon + half_lon, lat - half_lat],
            [lon + half_lon, lat + half_lat],
            [lon - half_lon, lat + half_lat],
        ]
    )
    return Building(id=id, ring=ring, ground_m=ground_m, roof_m=ground_m + height_m)


def synthetic_buildings(buildings: list[Building]) -> BuildingsModel:
    """Wrap a fixed list of buildings as a city's building data, with made-up provenance."""

    def within(south: float, west: float, north: float, east: float) -> list[Building]:
        return [
            building
            for building in buildings
            if building.ring[:, 1].min() <= north and building.ring[:, 1].max() >= south and building.ring[:, 0].min() <= east and building.ring[:, 0].max() >= west
        ]

    return BuildingsModel(
        within=within,
        source=Source(id="synthetic-buildings", title="Synthetic buildings", url="https://example.org/buildings", licence="test data", accessed="2026-09-19"),
        attribution=Attribution(text="Synthetic buildings", url="https://example.org/buildings"),
    )


class TestCorridor:
    """Which buildings the course runs past: the corridor, walked in chunks."""

    def test_every_box_is_the_corridor_wide_around_its_chunk(self):
        lat = np.array([52.5, 52.5, 52.5])
        lon = np.array([13.4, 13.401, 13.402])
        (box, chunk), = corridor_boxes(lat, lon, corridor_m=100, chunk_m=10_000)
        south, west, north, east = box
        assert chunk == slice(0, 3)
        # 100 m is about 0.0009 degrees of latitude, and more of longitude this far north.
        assert south == pytest.approx(52.5 - 0.0009, abs=1e-4)
        assert north == pytest.approx(52.5 + 0.0009, abs=1e-4)
        assert west < 13.4 and east > 13.402

    def test_a_long_course_is_walked_in_chunks_that_overlap_by_one_sample(self):
        lat = np.full(11, 52.5)
        lon = 13.4 + np.arange(11) * 0.001  # about 68 m apart
        boxes = corridor_boxes(lat, lon, corridor_m=50, chunk_m=200)
        assert len(boxes) > 1
        # No gap: each chunk starts where the last one ended, so no building falls between them.
        starts = [chunk.start for _, chunk in boxes]
        stops = [chunk.stop for _, chunk in boxes]
        assert starts[0] == 0 and stops[-1] == 11
        assert all(start < stop for start, stop in zip(starts[1:], stops[:-1]))

    def test_only_buildings_within_the_corridor_are_kept(self):
        near = square("near", 52.5, 13.4005, side_m=10, ground_m=0.0, height_m=10.0)
        far_north = square("far", 52.5 + math.degrees(400 / EARTH_RADIUS_M), 13.4005, side_m=10, ground_m=0.0, height_m=10.0)
        model = synthetic_buildings([near, far_north])
        lat = np.full(5, 52.5)
        lon = 13.4 + np.arange(5) * 0.0002
        kept = buildings_along(lat, lon, model, corridor_m=150)
        assert [building.id for building in kept] == ["near"]

    def test_a_building_is_kept_once_however_many_chunks_reach_it(self):
        near = square("near", 52.5, 13.4005, side_m=10, ground_m=0.0, height_m=10.0)
        model = synthetic_buildings([near])
        lat = np.full(21, 52.5)
        lon = 13.4 + np.arange(21) * 0.0001
        kept = buildings_along(lat, lon, model, corridor_m=150, chunk_m=30)
        assert [building.id for building in kept] == ["near"]

    def test_the_corridor_is_measured_to_the_footprint_not_to_its_middle(self):
        """A long building whose middle is far from the course but whose near wall is on it."""
        lat = np.full(3, 52.5)
        lon = np.array([13.4, 13.4001, 13.4002])
        # 500 m long, centred 250 m north: its southern wall is right on the course.
        wall = square("wall", 52.5 + math.degrees(250 / EARTH_RADIUS_M), 13.4001, side_m=500, ground_m=0.0, height_m=10.0)
        kept = buildings_along(lat, lon, synthetic_buildings([wall]), corridor_m=50)
        assert [building.id for building in kept] == ["wall"]


class TestSimplifyRing:
    """Outlines carry points a block on screen can't show; taking them out is most of the size."""

    def test_points_along_a_straight_wall_go(self):
        # A square with three extra points spread along its southern wall.
        ring = np.array([[13.4000, 52.5000], [13.4001, 52.5000], [13.4002, 52.5000], [13.4003, 52.5000], [13.4003, 52.5002], [13.4000, 52.5002]])
        simple = simplify_ring(ring, tolerance_m=0.25)
        assert len(simple) == 4
        assert simple[:, 0].min() == pytest.approx(13.4000) and simple[:, 0].max() == pytest.approx(13.4003)

    def test_a_corner_further_out_than_the_tolerance_stays(self):
        # The same wall, but with a 3 m bay window in the middle of it.
        bay_lat = 52.5000 - math.degrees(3 / EARTH_RADIUS_M)
        ring = np.array([[13.4000, 52.5000], [13.40015, bay_lat], [13.4003, 52.5000], [13.4003, 52.5002], [13.4000, 52.5002]])
        assert len(simplify_ring(ring, tolerance_m=0.25)) == 5

    def test_a_triangle_is_left_alone(self):
        ring = np.array([[13.4000, 52.5000], [13.4003, 52.5000], [13.4000, 52.5002]])
        assert len(simplify_ring(ring, tolerance_m=5.0)) == 3

    def test_simplifying_never_leaves_less_than_a_shape(self):
        """A tolerance big enough to swallow the whole building leaves the outline as it was."""
        ring = np.array([[13.4000, 52.5000], [13.4001, 52.5000], [13.4001, 52.5001], [13.4000, 52.5001]])
        assert len(simplify_ring(ring, tolerance_m=100.0)) == 4

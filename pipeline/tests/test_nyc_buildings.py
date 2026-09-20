"""New York's building records, on a made-up answer from the city's service: no downloads."""

import json

import pytest

from geopace import nyc_buildings
from geopace.nyc_dem import US_SURVEY_FOOT_M


def square(lon: float, lat: float, side: float = 0.0001) -> dict:
    """A GeoJSON MultiPolygon square with a courtyard in it, closed the way GeoJSON closes rings."""
    outside = [[lon, lat], [lon + side, lat], [lon + side, lat + side], [lon, lat + side], [lon, lat]]
    courtyard = [[lon + side / 4, lat + side / 4], [lon + side / 2, lat + side / 4], [lon + side / 2, lat + side / 2], [lon + side / 4, lat + side / 4]]
    return {"type": "MultiPolygon", "coordinates": [[outside, courtyard]]}


def record(doitt_id: str, *, height_ft: str | None = "40", ground_ft: str | None = "50", feature_code: str = "2100", geometry=None) -> dict:
    out = {"doitt_id": doitt_id, "feature_code": feature_code, "the_geom": square(-73.9857, 40.7484) if geometry is None else geometry}
    if height_ft is not None:
        out["height_roof"] = height_ft
    if ground_ft is not None:
        out["ground_elevation"] = ground_ft
    return out


def page(records: list[dict]) -> str:
    return json.dumps(records)


class TestParsing:
    def test_a_building_comes_back_in_meters_above_sea_level(self):
        """The city publishes feet: the roof is 40 ft over a ground 50 ft above sea level."""
        (building,) = nyc_buildings.parse_buildings([page([record("1")])])

        assert building.id == "1.0"
        assert building.ground_m == pytest.approx(50 * US_SURVEY_FOOT_M)
        assert building.roof_m == pytest.approx(90 * US_SURVEY_FOOT_M)
        # A roof height is how far the roof is over the ground, "not height above sea level".
        assert building.roof_m - building.ground_m == pytest.approx(12.19, abs=0.01)

    def test_the_outline_is_an_open_ring_of_lon_lat_degrees_with_no_courtyard(self):
        (building,) = nyc_buildings.parse_buildings([page([record("1")])])

        assert building.ring.shape == (4, 2)  # the closing point is dropped, the courtyard left out
        assert building.ring[:, 0] == pytest.approx(-73.9857, abs=0.001)
        assert building.ring[:, 1] == pytest.approx(40.7484, abs=0.001)

    def test_each_part_of_a_footprint_is_its_own_block(self):
        two = {"type": "MultiPolygon", "coordinates": square(-73.9857, 40.7484)["coordinates"] + square(-73.9850, 40.7484)["coordinates"]}
        blocks = nyc_buildings.parse_buildings([page([record("7", geometry=two)])])

        assert [building.id for building in blocks] == ["7.0", "7.1"]

    def test_a_plain_polygon_is_read_as_well_as_a_multipolygon(self):
        plain = {"type": "Polygon", "coordinates": square(-73.9857, 40.7484)["coordinates"][0]}
        (building,) = nyc_buildings.parse_buildings([page([record("9", geometry=plain)])])

        assert building.ring.shape == (4, 2)

    def test_a_roof_the_city_never_worked_out_is_not_drawn(self):
        """The city's own words: zero or missing means the information was not available."""
        records = [record("zero", height_ft="0"), record("missing", height_ft=None), record("blank", height_ft="")]

        assert nyc_buildings.parse_buildings([page(records)]) == []

    def test_a_placeholder_triangle_is_not_a_building(self):
        """A triangle the city drops in where it has no picture of a permitted building yet."""
        assert nyc_buildings.parse_buildings([page([record("p", feature_code="1003")])]) == []

    def test_a_record_with_no_ground_is_left_out_rather_than_put_at_sea_level(self):
        assert nyc_buildings.parse_buildings([page([record("g", ground_ft=None)])]) == []

    def test_a_canopy_is_not_a_building(self):
        # 6 ft is 1.83 m: under the threshold, and under the 12 ft the city says it captures.
        assert nyc_buildings.parse_buildings([page([record("c", height_ft="6")])]) == []

    def test_a_record_with_no_usable_geometry_is_skipped_rather_than_throwing(self):
        broken = [{"doitt_id": "a", "height_roof": "40", "ground_elevation": "50", "the_geom": None},
                  {"doitt_id": "b", "height_roof": "40", "ground_elevation": "50", "the_geom": {"type": "Point", "coordinates": [-73.9, 40.7]}},
                  {"doitt_id": "c", "height_roof": "40", "ground_elevation": "50", "the_geom": {"type": "MultiPolygon", "coordinates": [[["not", "a", "ring"]]]}}]

        assert nyc_buildings.parse_buildings([page(broken)]) == []

    def test_an_empty_answer_is_no_buildings(self):
        assert nyc_buildings.parse_buildings([page([])]) == []

    def test_every_page_of_an_answer_is_read(self):
        blocks = nyc_buildings.parse_buildings([page([record("1")]), page([record("2")])])

        assert [building.id for building in blocks] == ["1.0", "2.0"]


class TestTheQuery:
    def test_the_box_is_asked_for_as_a_polygon_the_outline_has_to_meet(self):
        url = nyc_buildings.box_url(40.7479, -73.9862, 40.7489, -73.9852)

        assert url.startswith(nyc_buildings.RESOURCE_URL)
        assert "intersects" in url and "POLYGON" in url
        assert "-73.986200+40.747900" in url or "-73.986200%2040.747900" in url

    def test_pages_are_asked_for_in_a_fixed_order_so_one_box_is_never_read_twice(self):
        url = nyc_buildings.box_url(40.7479, -73.9862, 40.7489, -73.9852, offset=5000)

        assert "order=doitt_id" in url
        assert "offset=5000" in url


def test_the_source_says_where_the_heights_come_from_and_what_is_left_out():
    source = nyc_buildings.SOURCE

    assert source.url.startswith("https://")
    assert source.accessed == "2026-09-19"
    assert "HEIGHT_ROOF" in source.note and "NAVD88" in source.note
    assert "no restrictions on use" in source.licence
    assert nyc_buildings.ATTRIBUTION.text.startswith("Buildings:")

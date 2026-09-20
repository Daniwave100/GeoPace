"""Berlin's building records, on a made-up answer from the city's service: no downloads."""

import numpy as np
import pytest

from geopace import berlin_buildings
from geopace.berlin_grid import to_utm33
from geopace.buildings import Building

from conftest import synthetic_elevation

# A 10 m square and a courtyard inside it, a second surface beside it, and three records the
# White model can't draw: no height, a doorway canopy, and a height the city never worked out.
PAGE = """<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:ua_gebaeudehoehen="ua_gebaeudehoehen" numberMatched="4" numberReturned="4">
  <wfs:member>
    <ua_gebaeudehoehen:gebaeudehoehen gml:id="gebaeudehoehen.1">
      <ua_gebaeudehoehen:geom>
        <gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::25833" gml:id="gebaeudehoehen.1.geom">
          <gml:surfaceMember>
            <gml:Polygon gml:id="gebaeudehoehen.1.geom.1">
              <gml:exterior><gml:LinearRing><gml:posList>389000 5819000 389010 5819000 389010 5819010 389000 5819010 389000 5819000</gml:posList></gml:LinearRing></gml:exterior>
              <gml:interior><gml:LinearRing><gml:posList>389003 5819003 389006 5819003 389006 5819006 389003 5819003</gml:posList></gml:LinearRing></gml:interior>
            </gml:Polygon>
          </gml:surfaceMember>
          <gml:surfaceMember>
            <gml:Polygon gml:id="gebaeudehoehen.1.geom.2">
              <gml:exterior><gml:LinearRing><gml:posList>389020 5819000 389030 5819000 389030 5819010 389020 5819000</gml:posList></gml:LinearRing></gml:exterior>
            </gml:Polygon>
          </gml:surfaceMember>
        </gml:MultiSurface>
      </ua_gebaeudehoehen:geom>
      <ua_gebaeudehoehen:hoehe>18.5</ua_gebaeudehoehen:hoehe>
    </ua_gebaeudehoehen:gebaeudehoehen>
  </wfs:member>
  <wfs:member>
    <ua_gebaeudehoehen:gebaeudehoehen gml:id="gebaeudehoehen.2">
      <ua_gebaeudehoehen:geom>
        <gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::25833" gml:id="gebaeudehoehen.2.geom">
          <gml:surfaceMember><gml:Polygon gml:id="gebaeudehoehen.2.geom.1">
            <gml:exterior><gml:LinearRing><gml:posList>389040 5819000 389050 5819000 389050 5819010 389040 5819000</gml:posList></gml:LinearRing></gml:exterior>
          </gml:Polygon></gml:surfaceMember>
        </gml:MultiSurface>
      </ua_gebaeudehoehen:geom>
      <ua_gebaeudehoehen:hoehe></ua_gebaeudehoehen:hoehe>
    </ua_gebaeudehoehen:gebaeudehoehen>
  </wfs:member>
  <wfs:member>
    <ua_gebaeudehoehen:gebaeudehoehen gml:id="gebaeudehoehen.3">
      <ua_gebaeudehoehen:geom>
        <gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::25833" gml:id="gebaeudehoehen.3.geom">
          <gml:surfaceMember><gml:Polygon gml:id="gebaeudehoehen.3.geom.1">
            <gml:exterior><gml:LinearRing><gml:posList>389060 5819000 389062 5819000 389062 5819002 389060 5819000</gml:posList></gml:LinearRing></gml:exterior>
          </gml:Polygon></gml:surfaceMember>
        </gml:MultiSurface>
      </ua_gebaeudehoehen:geom>
      <ua_gebaeudehoehen:hoehe>0.09</ua_gebaeudehoehen:hoehe>
    </ua_gebaeudehoehen:gebaeudehoehen>
  </wfs:member>
</wfs:FeatureCollection>
"""


class TestParsing:
    def test_a_building_comes_back_as_an_open_ring_of_lon_lat_degrees(self):
        (block_id, ring, height_m), _ = berlin_buildings.parse_buildings([PAGE])

        assert block_id == "gebaeudehoehen.1.0"
        assert height_m == pytest.approx(18.5)
        # The service closes its rings by repeating the first point; the pipeline leaves them open.
        assert len(ring) == 4
        assert ring[:, 0] == pytest.approx(13.36, abs=0.02)  # Berlin longitude
        assert ring[:, 1] == pytest.approx(52.52, abs=0.02)  # Berlin latitude
        # The square's corners are 10 m apart, which they are not in degrees.
        east, north = to_utm33(ring[:, 0], ring[:, 1])
        assert east.max() - east.min() == pytest.approx(10, abs=0.01)
        assert north.max() - north.min() == pytest.approx(10, abs=0.01)

    def test_a_courtyard_is_not_cut_out_of_the_block(self):
        """A white model's blocks are solid: the inner ring is dropped, not drawn as a hole."""
        blocks = berlin_buildings.parse_buildings([PAGE])

        assert all(len(ring) in (3, 4) for _, ring, _ in blocks)  # no ring carries the 3-point courtyard's points

    def test_each_surface_of_one_record_is_its_own_block(self):
        blocks = berlin_buildings.parse_buildings([PAGE])

        assert [block_id for block_id, _, _ in blocks] == ["gebaeudehoehen.1.0", "gebaeudehoehen.1.1"]

    def test_a_record_the_city_worked_out_no_height_for_is_not_drawn(self):
        assert "gebaeudehoehen.2.0" not in {block_id for block_id, _, _ in berlin_buildings.parse_buildings([PAGE])}

    def test_a_doorway_canopy_is_not_a_building(self):
        """The city's records go down to a few centimeters: drawn as a block, those are slivers."""
        assert "gebaeudehoehen.3.0" not in {block_id for block_id, _, _ in berlin_buildings.parse_buildings([PAGE])}

    def test_an_empty_answer_is_no_buildings_rather_than_a_failure(self):
        empty = PAGE[: PAGE.index("<wfs:member>")] + "</wfs:FeatureCollection>"
        assert berlin_buildings.parse_buildings([empty]) == []


class TestStandingOnTheGround:
    def test_a_block_stands_on_the_ground_under_it_and_its_roof_is_that_much_higher(self):
        blocks = berlin_buildings.parse_buildings([PAGE])
        ground = synthetic_elevation(lambda lat, lon: np.full(np.shape(lat), 34.0))

        standing = berlin_buildings.stand_on_the_ground(blocks, ground)

        assert [building.ground_m for building in standing] == [34.0, 34.0]
        assert standing[0].roof_m == pytest.approx(34.0 + 18.5)

    def test_a_block_the_ground_model_has_no_height_for_is_left_out(self):
        blocks = berlin_buildings.parse_buildings([PAGE])
        nothing = synthetic_elevation(lambda lat, lon: np.full(np.shape(lat), np.nan))

        assert berlin_buildings.stand_on_the_ground(blocks, nothing) == []

    def test_no_blocks_asks_the_ground_model_nothing(self):
        asked = []
        ground = synthetic_elevation(lambda lat, lon: asked.append(lat) or np.full(np.shape(lat), 34.0))

        assert berlin_buildings.stand_on_the_ground([], ground) == []
        assert asked == []


class TestTheQuery:
    def test_the_box_is_asked_for_in_the_city_s_own_meters(self):
        url = berlin_buildings.box_url(52.515, 13.360, 52.517, 13.365)

        assert "ua_gebaeudehoehen%3Agebaeudehoehen" in url or "TYPENAMES=ua_gebaeudehoehen:gebaeudehoehen" in url
        assert "EPSG::25833" in url
        bbox = url.split("BBOX=")[1].split("&")[0]
        min_x, min_y, max_x, max_y = (float(part) for part in bbox.split(",")[:4])
        east, north = to_utm33([13.360, 13.365], [52.515, 52.517])
        assert (min_x, max_x) == pytest.approx((east[0], east[1]), abs=0.1)
        assert (min_y, max_y) == pytest.approx((north[0], north[1]), abs=0.1)

    def test_a_later_page_asks_the_service_to_start_further_in(self):
        assert "STARTINDEX=5000" in berlin_buildings.box_url(52.515, 13.360, 52.517, 13.365, start=5000)


def test_the_source_says_which_height_the_city_publishes_and_what_is_left_out():
    """Every fact about the world carries where it came from, and a block as tall as a roof's
    ridge is a choice a reader has to be able to check (CLAUDE.md, PLAN.md principle 5)."""
    source = berlin_buildings.SOURCE

    assert source.url.startswith("https://")
    assert source.accessed == "2026-09-19"
    assert "Firsthöhe" in source.note
    assert "dl-de/zero-2-0" in source.licence
    assert isinstance(berlin_buildings.ATTRIBUTION.text, str) and berlin_buildings.ATTRIBUTION.text.startswith("Buildings:")


def test_a_parsed_block_is_the_shape_the_corridor_expects():
    blocks = berlin_buildings.parse_buildings([PAGE])
    standing = berlin_buildings.stand_on_the_ground(blocks, synthetic_elevation(lambda lat, lon: np.full(np.shape(lat), 34.0)))

    assert all(isinstance(building, Building) for building in standing)
    assert all(building.ring.ndim == 2 and building.ring.shape[1] == 2 for building in standing)

"""Route ingest: a course file (GPX) becomes an ordered list of (lat, lon) vertices."""

import pytest

from geopace.route import parse_gpx

GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test">
  <trk><trkseg>
    <trkpt lat="52.515214" lon="13.3602"><ele>999</ele></trkpt>
    <trkpt lat="52.514961" lon="13.355961"/>
  </trkseg><trkseg>
    <trkpt lat="52.514826" lon="13.353767"/>
  </trkseg></trk>
</gpx>"""


def test_track_points_from_every_segment_in_order_and_gps_elevation_is_ignored():
    assert parse_gpx(GPX) == [(52.515214, 13.3602), (52.514961, 13.355961), (52.514826, 13.353767)]


def test_a_file_without_track_points_is_rejected():
    with pytest.raises(ValueError, match="no track points"):
        parse_gpx('<gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>')

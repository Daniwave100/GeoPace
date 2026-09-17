"""Route ingest from waypoints: a course described as turn points is traced along real streets.

The streets come from OpenStreetMap (an Overpass API response); here they are tiny synthetic maps.
"""

import math

import pytest
from pyproj import Geod

from geopace.street_route import RouteNotTraceable, Waypoint, trace_route

LAT0, LON0 = 40.7, -74.0
M_PER_DEG_LAT = 111_000.0
M_PER_DEG_LON = 111_000.0 * math.cos(math.radians(LAT0))
WGS84 = Geod(ellps="WGS84")


def at(east_m, north_m):
    """(lat, lon) a given number of meters east and north of the map origin."""
    return (LAT0 + north_m / M_PER_DEG_LAT, LON0 + east_m / M_PER_DEG_LON)


def overpass(ways):
    """An Overpass JSON response. ways: {way_id: (tags, [(node_id, east_m, north_m), ...])}."""
    nodes = {}
    elements = []
    for way_id, (tags, points) in ways.items():
        for node_id, east, north in points:
            nodes[node_id] = at(east, north)
        elements.append({"type": "way", "id": way_id, "nodes": [p[0] for p in points], "tags": tags})
    elements += [{"type": "node", "id": i, "lat": lat, "lon": lon} for i, (lat, lon) in nodes.items()]
    return {"elements": elements}


ROAD = {"highway": "residential"}

# A 200 m x 200 m block of four streets around a park, with a footpath cutting across the park.
BLOCK = overpass(
    {
        1: (ROAD, [(1, 0, 0), (2, 200, 0)]),  # south street
        2: (ROAD, [(2, 200, 0), (3, 200, 200)]),  # east street
        3: (ROAD, [(3, 200, 200), (4, 0, 200)]),  # north street
        4: (ROAD, [(4, 0, 200), (1, 0, 0)]),  # west street
        5: ({"highway": "footway"}, [(1, 0, 0), (3, 200, 200)]),  # diagonal path through the park
    }
)


def length_m(route):
    lats, lons = zip(*route)
    return WGS84.line_length(lons, lats)


def passes_near(route, point, within_m=1.0):
    lats, lons = zip(*route)
    _, _, dist = WGS84.inv(lons, lats, [point[1]] * len(route), [point[0]] * len(route))
    return min(dist) < within_m


def test_the_route_follows_the_streets_through_every_waypoint_in_order():
    route = trace_route(
        BLOCK,
        [Waypoint(*at(100, 0), "south street"), Waypoint(*at(0, 150), "west street"), Waypoint(*at(200, 150), "east street")],
    )

    # Starts and ends exactly at the waypoints, even though they sit between street corners.
    assert route[0] == pytest.approx(at(100, 0))
    assert route[-1] == pytest.approx(at(200, 150))
    # West to the corner and up the west street (100 + 150 m), then over the top of the block
    # rather than back down past the start (50 + 200 + 50 m).
    assert length_m(route) == pytest.approx(550, abs=2)
    assert passes_near(route, at(0, 200)) and passes_near(route, at(200, 200))


def test_roads_are_preferred_over_footpaths_unless_a_waypoint_says_otherwise():
    corner_to_corner = [Waypoint(*at(0, 0), "SW corner"), Waypoint(*at(200, 200), "NE corner")]
    by_road = trace_route(BLOCK, corner_to_corner)
    assert length_m(by_road) == pytest.approx(400, abs=2)

    through_park = [corner_to_corner[0], Waypoint(*at(100, 100), "park path", way=5), corner_to_corner[1]]
    assert length_m(trace_route(BLOCK, through_park)) == pytest.approx(200 * math.sqrt(2), abs=2)


def test_a_waypoint_can_pick_one_of_two_stacked_roadways():
    # A double-deck bridge: two roadways 8 m apart, each with its own ramps at the ends.
    bridge = overpass(
        {
            10: (ROAD, [(10, 0, 0), (11, 0, 20)]),  # street leading onto the bridge
            11: (ROAD, [(11, 0, 20), (12, -4, 40), (13, -4, 460), (14, 0, 480)]),  # upper deck
            12: (ROAD, [(11, 0, 20), (22, 4, 40), (23, 4, 460), (14, 0, 480)]),  # lower deck
            13: (ROAD, [(14, 0, 480), (15, 0, 500)]),  # street off the bridge
        }
    )
    lower = trace_route(bridge, [Waypoint(*at(0, 0), "start"), Waypoint(*at(0, 250), "lower deck", way=12), Waypoint(*at(0, 500), "end")])

    assert passes_near(lower, at(4, 250))
    assert not passes_near(lower, at(-4, 250), within_m=5)


def test_a_waypoint_far_from_any_street_is_refused_by_name():
    with pytest.raises(RouteNotTraceable, match=r"Fifth Avenue.*no street"):
        trace_route(BLOCK, [Waypoint(*at(0, 0), "start"), Waypoint(*at(100, 400), "Fifth Avenue")])


def test_waypoints_with_no_street_between_them_are_refused_by_name():
    islands = overpass({1: (ROAD, [(1, 0, 0), (2, 100, 0)]), 2: (ROAD, [(3, 0, 300), (4, 100, 300)])})

    with pytest.raises(RouteNotTraceable, match=r"from 'mainland' to 'island'"):
        trace_route(islands, [Waypoint(*at(50, 0), "mainland"), Waypoint(*at(50, 300), "island")])

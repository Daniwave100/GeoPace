"""Route ingest from waypoints: trace a course along OpenStreetMap streets.

Some organizers publish no downloadable course file (NYC's is only a PDF map and a list of
closed streets). For those courses the course facts list the turn points in order, and this
module connects them along real streets, the shortest way, like a navigation app would:

1. Download the streets near the waypoints from OpenStreetMap (Overpass API) into the cache.
2. Put each waypoint on its nearest street (or on the one street it names, for places where
   roadways are stacked, like the two decks of a bridge).
3. Join consecutive waypoints by the shortest path along the streets. Footpaths, sidewalks and
   cycleways count extra, so the route stays on roads unless a waypoint deliberately puts it on one.

One-way rules are ignored: the course is closed to traffic and runners use the whole road.
"""

import heapq
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from pyproj import Geod

from geopace.cache import USER_AGENT
from geopace.course_facts import Waypoint

WGS84 = Geod(ellps="WGS84")
# Public Overpass servers, tried in turn: they are free, busy, and sometimes time out.
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
)

# A waypoint further than this from every street is a typo, not a place on the course.
MAX_SNAP_M = 40.0
# Streets fetched within this distance of the straight lines between waypoints.
CORRIDOR_M = 400.0
# Ways a runner can be routed along, and how much extra each meter of them "costs".
ROAD_TYPES = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary",
    "secondary_link", "tertiary", "tertiary_link", "unclassified", "residential", "living_street",
    "service", "road",
    # Car-free streets: plazas, and park drives like Central Park's (tagged pedestrian in OSM).
    "pedestrian",
}  # fmt: skip
PATH_TYPES = {"footway", "cycleway", "path", "track"}
PATH_COST = 4.0


class RouteNotTraceable(ValueError):
    """The waypoints can't be connected along the streets."""


def trace_route(streets: dict, waypoints: list[Waypoint]) -> list[tuple[float, float]]:
    """(lat, lon) vertices of the route through every waypoint in order, along the streets."""
    if len(waypoints) < 2:
        raise RouteNotTraceable("A route needs at least two waypoints")
    graph = _StreetGraph(streets)
    stops = [graph.add_waypoint(wp) for wp in waypoints]
    route: list[tuple[float, float]] = []
    for (a, wa), (b, wb) in zip(zip(stops, waypoints), zip(stops[1:], waypoints[1:])):
        path = graph.shortest_path(a, b)
        if path is None:
            raise RouteNotTraceable(f"No streets connect the route from {wa.label!r} to {wb.label!r}")
        leg = [graph.position(node) for node in path]
        route.extend(leg if not route else leg[1:])
    return route


def fetch_streets(waypoints: list[Waypoint], dest: Path, allow_download: bool = True) -> dict:
    """OpenStreetMap streets near the waypoints (cached at dest; delete it to refresh)."""
    if not dest.exists():
        if not allow_download:
            raise FileNotFoundError(f"OpenStreetMap streets are not cached at {dest}")
        corridor = ",".join(f"{wp.lat:.6f},{wp.lon:.6f}" for wp in waypoints)
        kinds = "|".join(sorted(ROAD_TYPES | PATH_TYPES))
        query = f'[out:json][timeout:300];way["highway"~"^({kinds})$"](around:{CORRIDOR_M:.0f},{corridor});(._;>;);out body qt;'
        print(f"  streets: downloading OpenStreetMap ways along the course into {dest}")
        body = _overpass(query)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
    with open(dest, encoding="utf-8") as f:
        return json.load(f)


def _overpass(query: str) -> bytes:
    """Ask a public Overpass server, moving on to the next one if it is busy or times out."""
    problems = []
    for attempt, url in enumerate(OVERPASS_URLS):
        request = urllib.request.Request(url, data=urllib.parse.urlencode({"data": query}).encode(), headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=360) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as err:
            problems.append(f"{url}: {err}")
            print(f"  streets: {url} did not answer ({err}); trying another server")
            time.sleep(2 * (attempt + 1))
    raise RouteNotTraceable("No OpenStreetMap server answered:\n  - " + "\n  - ".join(problems))


class _StreetGraph:
    """Street network as nodes and weighted edges. Waypoints are spliced into the edge they lie on."""

    def __init__(self, streets: dict):
        self._positions: dict[int, tuple[float, float]] = {}
        self._edges: dict[int, dict[int, float]] = {}
        self._segments: list[tuple[int, int, int, float]] = []  # (node a, node b, way id, cost per meter)
        for element in streets["elements"]:
            if element["type"] == "node":
                self._positions[element["id"]] = (element["lat"], element["lon"])
        for element in streets["elements"]:
            highway = element.get("tags", {}).get("highway") if element["type"] == "way" else None
            if highway in ROAD_TYPES or highway in PATH_TYPES:
                per_m = PATH_COST if highway in PATH_TYPES else 1.0
                for a, b in zip(element["nodes"], element["nodes"][1:]):
                    if a in self._positions and b in self._positions:
                        self._segments.append((a, b, element["id"], per_m))
                        self._link(a, b, per_m)
        self._next_id = -1

    def position(self, node: int) -> tuple[float, float]:
        return self._positions[node]

    def add_waypoint(self, waypoint: Waypoint) -> int:
        candidates = [s for s in self._segments if waypoint.way is None or s[2] == waypoint.way]
        if not candidates:
            raise RouteNotTraceable(f"Waypoint {waypoint.label!r}: OpenStreetMap way {waypoint.way} is not among the streets")
        distance, share = self._nearest_points(waypoint, candidates)
        best = int(np.argmin(distance))
        if distance[best] > MAX_SNAP_M:
            raise RouteNotTraceable(
                f"Waypoint {waypoint.label!r} ({waypoint.lat:.6f}, {waypoint.lon:.6f}) has no street within "
                f"{MAX_SNAP_M:.0f} m (nearest is {distance[best]:.0f} m away)"
            )
        a, b, way, per_m = candidates[best]
        if share[best] <= 0.0:
            return a
        if share[best] >= 1.0:
            return b
        # Split the segment a-b at the waypoint's foot point.
        (lat_a, lon_a), (lat_b, lon_b) = self._positions[a], self._positions[b]
        node = self._next_id
        self._next_id -= 1
        t = share[best]
        self._positions[node] = (lat_a + t * (lat_b - lat_a), lon_a + t * (lon_b - lon_a))
        self._segments.remove((a, b, way, per_m))
        self._segments += [(a, node, way, per_m), (node, b, way, per_m)]
        # (Two ways can share the same pair of nodes, so the a-b edge may already be gone.)
        self._edges[a].pop(b, None)
        self._edges[b].pop(a, None)
        self._link(a, node, per_m)
        self._link(node, b, per_m)
        return node

    def shortest_path(self, start: int, goal: int) -> list[int] | None:
        """Dijkstra's algorithm. None when goal can't be reached."""
        best = {start: 0.0}
        came_from: dict[int, int] = {}
        queue = [(0.0, start)]
        while queue:
            cost, node = heapq.heappop(queue)
            if node == goal:
                path = [goal]
                while path[-1] != start:
                    path.append(came_from[path[-1]])
                return path[::-1]
            if cost > best[node]:
                continue
            for neighbor, step in self._edges.get(node, {}).items():
                if cost + step < best.get(neighbor, math.inf):
                    best[neighbor] = cost + step
                    came_from[neighbor] = node
                    heapq.heappush(queue, (cost + step, neighbor))
        return None

    def _link(self, a: int, b: int, per_m: float) -> None:
        (lat_a, lon_a), (lat_b, lon_b) = self._positions[a], self._positions[b]
        cost = WGS84.inv(lon_a, lat_a, lon_b, lat_b)[2] * per_m
        self._edges.setdefault(a, {})[b] = cost
        self._edges.setdefault(b, {})[a] = cost

    def _nearest_points(self, waypoint: Waypoint, segments) -> tuple[np.ndarray, np.ndarray]:
        """Distance (m) from the waypoint to each segment, and how far along it (0..1) the nearest point is.
        Uses a flat local map around the waypoint, which is exact enough over tens of meters."""
        m_per_deg_lat = 111_132.0
        m_per_deg_lon = 111_320.0 * math.cos(math.radians(waypoint.lat))
        ends = np.array([(*self._positions[a], *self._positions[b]) for a, b, _, _ in segments])
        ax = (ends[:, 1] - waypoint.lon) * m_per_deg_lon
        ay = (ends[:, 0] - waypoint.lat) * m_per_deg_lat
        bx = (ends[:, 3] - waypoint.lon) * m_per_deg_lon
        by = (ends[:, 2] - waypoint.lat) * m_per_deg_lat
        dx, dy = bx - ax, by - ay
        length2 = np.maximum(dx * dx + dy * dy, 1e-12)
        share = np.clip(-(ax * dx + ay * dy) / length2, 0.0, 1.0)
        return np.hypot(ax + share * dx, ay + share * dy), share

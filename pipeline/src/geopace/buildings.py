"""The city's buildings along the course: the surface the White model is drawn from.

Every city publishes its buildings its own way — Berlin as a height on the cadastre's outline,
New York as a footprint with a roof height — so each city's reader (berlin_buildings.py,
nyc_buildings.py) turns its own into the same plain thing: an outline, the ground the building
stands on, and its roof. Both heights are meters above sea level in the same datum as the course
line's elevation_m, so that one place (white_model.py) turns them into the heights a 3D globe
counts from, with the same geoid model the course line uses (PLAN.md D51).

A building here is a block: one flat roof over one outline. That is what a white model is
(PLAN.md §6) and what the poster drew. Where a city gives the ridge of a pitched roof, the block
is as tall as the ridge, so its shadow is as long as the ridge's and its eaves are a little too
low; the source note on each city's data says which height the city publishes.

These same blocks are what shade is worked out from (shade.py), which is why the shadows on
screen and the numbers on the strip can't disagree — a test re-derives the shade from the
committed White model and checks it against the committed table.
"""

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from geopace.cache import download
from geopace.provenance import Attribution, Source

# WGS84's shape, for turning degrees into meters over a few hundred meters of city.
EARTH_RADIUS_M = 6_378_137.0
EARTH_FLATTENING_E2 = 6.694_379_990_14e-3

# How far either side of the course buildings are kept. A building shades the road from further
# than this when the sun is low, but the White model is what the runner looks at from the road,
# and every extra meter of corridor is data in the repo and geometry on a weak GPU (PLAN.md §8).
DEFAULT_CORRIDOR_M = 150.0
# How much course the pipeline asks for in one go. Small enough that the box round a bend is
# still mostly corridor; big enough that a marathon is a few dozen requests, not thousands.
DEFAULT_CHUNK_M = 1000.0
# How many records a city's service is asked for in one go. Both cities' own limits are well
# above this, and it keeps one box to one request everywhere along both courses.
PAGE = 5000
# A "building" this low is a porch, a bin store or a flat roof over a doorway: drawn as a block
# it is a sliver on the ground, and a city's records go down to a few centimeters.
MIN_HEIGHT_M = 2.0


@dataclass(frozen=True)
class Building:
    """One building as a block: its outline, the ground it stands on, and its roof."""

    id: str  # the city's own identifier, so a block on screen can be traced back to its record
    ring: np.ndarray  # (n, 2), columns lon and lat in degrees; the outline, not closed
    ground_m: float  # meters above sea level, in the city's own datum
    roof_m: float  # meters above sea level


@dataclass(frozen=True)
class BuildingsModel:
    """One city's building data, as the pipeline reads it."""

    # (south, west, north, east) degrees, and the least height above its own ground a building
    # must have -> every building whose outline meets that box. Shade asks for a wide band of
    # city and only the buildings in it tall enough to reach the course (shade.py); both cities'
    # services do that filtering themselves, so what isn't wanted is never downloaded.
    within: Callable[..., list[Building]]
    source: Source
    attribution: Attribution


def inside_ring(ring: np.ndarray, lat, lon) -> np.ndarray:
    """Which of the points fall inside the outline. Ray casting, in degrees: a footprint is a few
    tens of meters across, where a degree of longitude is as straight as a degree of latitude."""
    x = np.atleast_1d(np.asarray(lon, dtype=float))
    y = np.atleast_1d(np.asarray(lat, dtype=float))
    inside = np.zeros(x.shape, dtype=bool)
    ring_x, ring_y = ring[:, 0], ring[:, 1]
    for i in range(len(ring)):
        x1, y1 = ring_x[i - 1], ring_y[i - 1]  # -1 closes the ring on the first pass
        x2, y2 = ring_x[i], ring_y[i]
        if y1 == y2:
            continue
        # A ray going east from the point crosses this edge if the point's latitude is within the
        # edge's, and the edge is to the east at that latitude.
        straddles = (y1 > y) != (y2 > y)
        with np.errstate(invalid="ignore"):
            crossing_x = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
        inside ^= straddles & (x < crossing_x)
    return inside


def corridor_boxes(lat, lon, corridor_m: float = DEFAULT_CORRIDOR_M, chunk_m: float = DEFAULT_CHUNK_M) -> list[tuple[tuple[float, float, float, float], slice]]:
    """The course walked in chunks, each with the box that holds its corridor.

    Chunks overlap by one sample, so no stretch of road falls between two boxes. The box is the
    chunk's own bounding box grown by `corridor_m`, so round a bend it holds more than the
    corridor; `buildings_along` measures each building against the road itself afterwards.
    """
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    boxes = []
    start = 0
    while start < len(lat) - 1:
        stop = _chunk_end(lat, lon, start, chunk_m)
        boxes.append((_box_around(lat[start:stop], lon[start:stop], corridor_m), slice(start, stop)))
        start = stop - 1  # the chunks share a sample rather than leaving a gap between them
    return boxes


def buildings_along(lat, lon, model: BuildingsModel, corridor_m: float = DEFAULT_CORRIDOR_M, chunk_m: float = DEFAULT_CHUNK_M) -> list[Building]:
    """Every building whose outline comes within `corridor_m` of the course, in no particular order.

    The distance is to the outline itself, not to the middle of the building: a block a hundred
    meters deep whose front wall is on the pavement is one the runner sees.
    """
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    kept: dict[str, Building] = {}
    for box, chunk in corridor_boxes(lat, lon, corridor_m, chunk_m):
        road_lat, road_lon = lat[chunk], lon[chunk]
        for building in model.within(*box):
            if building.id in kept:
                continue
            if near_the_road(building.ring, road_lat, road_lon, corridor_m):
                kept[building.id] = building
    return list(kept.values())


def near_the_road(ring: np.ndarray, road_lat: np.ndarray, road_lon: np.ndarray, corridor_m: float) -> bool:
    """Whether any of these road samples is within `corridor_m` of the outline (or inside it)."""
    return distance_to_the_road(ring, road_lat, road_lon) <= corridor_m


def distance_to_the_road(ring: np.ndarray, road_lat: np.ndarray, road_lon: np.ndarray) -> float:
    """Metres from the outline to the nearest of these road samples; 0 where the road is inside it.

    The distance is to the outline itself, not to the middle of the building: a block a hundred
    metres deep whose front wall is on the pavement is one the runner sees, and one whose shadow
    falls on the road.
    """
    if inside_ring(ring, road_lat, road_lon).any():
        return 0.0
    middle_lat = float(road_lat.mean())
    road_x, road_y = _meters_from(middle_lat, road_lat, road_lon)
    ring_x, ring_y = _meters_from(middle_lat, ring[:, 1], ring[:, 0])
    closest = np.inf
    for i in range(len(ring_x)):
        closest = min(closest, float(_distance_squared_to_segment(road_x, road_y, ring_x[i - 1], ring_y[i - 1], ring_x[i], ring_y[i]).min()))
    return float(np.sqrt(closest))


def _distance_squared_to_segment(x, y, x1: float, y1: float, x2: float, y2: float) -> np.ndarray:
    """Square of the distance from each point to the segment (x1, y1)-(x2, y2), in meters."""
    dx, dy = x2 - x1, y2 - y1
    length_squared = dx * dx + dy * dy
    along = 0.0 if length_squared == 0 else np.clip(((x - x1) * dx + (y - y1) * dy) / length_squared, 0, 1)
    return (x - (x1 + along * dx)) ** 2 + (y - (y1 + along * dy)) ** 2


def _meters_from(middle_lat: float, lat, lon) -> tuple[np.ndarray, np.ndarray]:
    """Degrees to meters east and north of nothing in particular: only differences are used.

    A flat frame, good to centimeters over the few hundred meters this is ever asked about, and
    far quicker than measuring every distance on the ellipsoid itself: the corridor is one
    building's width, but it is measured against four thousand course samples per building.
    """
    per_lat, per_lon = meters_per_degree(middle_lat)
    return np.asarray(lon, dtype=float) * per_lon, np.asarray(lat, dtype=float) * per_lat


def meters_per_degree(lat: float) -> tuple[float, float]:
    """How many meters a degree of latitude and a degree of longitude are worth at this latitude.

    Both grow and shrink with latitude on an ellipsoid: a degree of latitude is 110.6 km at the
    equator and 111.7 km at the poles, and a degree of longitude closes to nothing. One rounded
    number for either would make a "150 m" corridor a percent wider or narrower than it says.
    """
    phi = np.radians(lat)
    curvature = np.sqrt(1 - EARTH_FLATTENING_E2 * np.sin(phi) ** 2)
    per_lat = EARTH_RADIUS_M * (1 - EARTH_FLATTENING_E2) / curvature**3 * np.pi / 180
    per_lon = EARTH_RADIUS_M * np.cos(phi) / curvature * np.pi / 180
    return float(per_lat), max(float(per_lon), 1e-6)


def _chunk_end(lat: np.ndarray, lon: np.ndarray, start: int, chunk_m: float) -> int:
    """The sample this chunk ends at: the first one more than `chunk_m` of road from its start."""
    per_lat, per_lon = meters_per_degree(float(lat[start]))
    steps = np.hypot(np.diff(lon[start:]) * per_lon, np.diff(lat[start:]) * per_lat)
    walked = np.cumsum(steps)
    past = np.flatnonzero(walked > chunk_m)
    return len(lat) if len(past) == 0 else start + int(past[0]) + 2


def _box_around(lat: np.ndarray, lon: np.ndarray, corridor_m: float) -> tuple[float, float, float, float]:
    """(south, west, north, east) round these samples, grown by the corridor."""
    per_lat, per_lon = meters_per_degree(float(lat.mean()))
    pad_lat, pad_lon = corridor_m / per_lat, corridor_m / per_lon
    return (float(lat.min()) - pad_lat, float(lon.min()) - pad_lon, float(lat.max()) + pad_lat, float(lon.max()) + pad_lon)


def simplify_ring(ring: np.ndarray, tolerance_m: float) -> np.ndarray:
    """The same outline with the points that say nothing taken out (Ramer-Douglas-Peucker).

    A cadastre's outline carries points along a straight wall — a party wall, a doorway, a change
    of ownership — that a block on screen can't show. Dropping every point no further than
    `tolerance_m` from the line it sits on leaves the same shape in far fewer numbers, which is
    most of what the White model's size is.
    """
    if len(ring) <= 3 or tolerance_m <= 0:
        return ring
    middle_lat = float(ring[:, 1].mean())
    x, y = _meters_from(middle_lat, ring[:, 1], ring[:, 0])
    keep = np.zeros(len(ring), dtype=bool)
    # A ring has no ends to anchor the splitting to, so it is cut at the first point and the one
    # furthest from it, and each of the two halves is walked as an open chain.
    far = int(np.argmax((x - x[0]) ** 2 + (y - y[0]) ** 2))
    keep[0] = keep[far] = True
    _keep_along(x, y, list(range(0, far + 1)), tolerance_m, keep)
    _keep_along(x, y, list(range(far, len(ring))) + [0], tolerance_m, keep)
    simple = ring[keep]
    return simple if len(simple) >= 3 else ring


def _keep_along(x: np.ndarray, y: np.ndarray, chain: list[int], tolerance_m: float, keep: np.ndarray) -> None:
    """Mark every point of this chain that is further than `tolerance_m` from the line it spans."""
    limit = tolerance_m**2
    halves = [(0, len(chain) - 1)]
    while halves:
        first, last = halves.pop()
        if last <= first + 1:
            continue
        inner = chain[first + 1 : last]
        away = _distance_squared_to_segment(x[inner], y[inner], x[chain[first]], y[chain[first]], x[chain[last]], y[chain[last]])
        furthest = int(np.argmax(away))
        if away[furthest] <= limit:
            continue
        at = first + 1 + furthest
        keep[chain[at]] = True
        halves += [(first, at), (at, last)]


class BoxesNotCached(FileNotFoundError):
    """Downloads were turned off and some of the corridor isn't in the cache."""


def cached_pages(folder: Path, box: tuple[float, float, float, float], suffix: str, url_for: Callable[[int], str], count_in: Callable[[str], int], allow_download: bool, min_height_m: float = 0.0) -> list[str]:
    """Every page of one city's answer for one box, kept on disk. Delete the folder to refresh.

    Both cities' services answer a box a page at a time, and differ only in how they are asked
    for the next one and where the count of what came back is written: `url_for(start)` asks for
    the page beginning at `start`, and `count_in` reads that page's own count out of it. The
    reading stops at the first page that isn't full.

    A box is named after itself — and after the least height asked for, so the wide bands shade
    is worked out from never come back as the corridor's own answer — so moving the course
    fetches fresh boxes and leaves the old files to be deleted rather than silently reusing them.
    """
    south, west, north, east = box
    key = f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}" + (f",h>{min_height_m:.1f}" if min_height_m > 0 else "")
    name = hashlib.sha1(key.encode()).hexdigest()[:12]
    pages: list[str] = []
    start = 0
    while True:
        path = folder / f"box-{name}-{start}.{suffix}"
        if not path.exists() and not allow_download:
            raise BoxesNotCached(f"Buildings for the box at ({south:.5f}, {west:.5f}) are not cached in {folder}")
        text = download(url_for(start), path).read_text(encoding="utf-8")
        pages.append(text)
        returned = count_in(text)
        start += returned
        if returned < PAGE:
            return pages

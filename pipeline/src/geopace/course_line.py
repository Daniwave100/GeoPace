"""Course Line builder: route vertices -> evenly spaced samples with distance, elevation, grade.

Steps, in order:
1. Measure the route along the WGS84 ellipsoid and resample it every `spacing_m` meters.
2. Sample bare-earth elevation from an official terrain model at each sample
   (never GPS elevation, which is far too noisy).
2b. Bare-earth models leave out bridge decks, so on a bridge they report the water or road
   underneath. Each listed bridge is patched in one of two ways:
   - With surface data (LiDAR returns classified as bridge deck), the height is the deck's
     own measured height. High bridges need this (NYC's Verrazzano crests ~78 m over the water).
     On a double-deck bridge the course facts say which deck the runners use.
   - Without it, a straight line between the heights at the bridge's two ends. That suits
     low, flat city bridges (Berlin).
3. Smooth the elevation, THEN compute grade. Grade from unsmoothed data is dominated by
   noise: 0.5 m of error across 10 m looks like a 5% hill.
4. Turn grade into a difficulty factor with a published energy-cost model.
"""

from dataclasses import dataclass

import numpy as np
from pyproj import Geod

from geopace import difficulty
from geopace.course_facts import Bridge
from geopace.elevation import BridgeDeckModel, ElevationModel
from geopace.lidar_decks import deck_height

WGS84 = Geod(ellps="WGS84")

DEFAULT_SPACING_M = 10.0
# A median filter first removes short spikes and pits (single bad cells, curbs, drains)...
MEDIAN_WINDOW_M = 50.0
# ...then a Gaussian blur leaves grades that describe ~100-200 m of road, the scale a runner feels.
GAUSSIAN_SIGMA_M = 50.0


@dataclass(frozen=True)
class CourseLine:
    spacing_m: float
    length_m: float
    lat: np.ndarray
    lon: np.ndarray
    distance_m: np.ndarray
    elevation_m: np.ndarray
    grade: np.ndarray
    difficulty: list[float | None]
    bearing_deg: np.ndarray


def build_course_line(
    route: list[tuple[float, float]],
    elevation: ElevationModel,
    spacing_m: float = DEFAULT_SPACING_M,
    bridges: list[Bridge] = (),
    decks: BridgeDeckModel | None = None,
) -> CourseLine:
    lat, lon, distance_m = resample(route, spacing_m)
    raw_elevation = np.asarray(elevation.sample(lat, lon), dtype=float)
    if decks is None:
        ground = span_bridges(distance_m, raw_elevation, bridges)
    else:
        ground = raise_bridge_decks(distance_m, lat, lon, raw_elevation, bridges, decks)
    # Checked after the bridges are in: a bare-earth model has no ground over open water, which
    # is fine exactly where a bridge carries the course over it.
    if not np.all(np.isfinite(ground)):
        bad = int(np.flatnonzero(~np.isfinite(ground))[0])
        raise ValueError(
            f"No elevation at km {distance_m[bad] / 1000:.3f} ({lat[bad]:.6f}, {lon[bad]:.6f}). "
            "If the course is on a bridge there, list the bridge in the course facts."
        )
    smoothed = smooth_elevation(ground, spacing_m)
    grade = np.gradient(smoothed, distance_m)
    return CourseLine(
        spacing_m=spacing_m,
        length_m=float(distance_m[-1]),
        lat=lat,
        lon=lon,
        distance_m=distance_m,
        elevation_m=smoothed,
        grade=grade,
        difficulty=difficulty.difficulty_factor(grade),
        bearing_deg=bearings(lat, lon),
    )


def resample(route: list[tuple[float, float]], spacing_m: float):
    """Evenly spaced points along the route. The last point is always the route's end."""
    if len(route) < 2:
        raise ValueError("A route needs at least two points")
    vertex_lat = np.array([point[0] for point in route], dtype=float)
    vertex_lon = np.array([point[1] for point in route], dtype=float)
    _, _, segment_m = WGS84.inv(vertex_lon[:-1], vertex_lat[:-1], vertex_lon[1:], vertex_lat[1:])
    vertex_distance_m = np.concatenate([[0.0], np.cumsum(segment_m)])
    total_m = vertex_distance_m[-1]
    distance_m = np.arange(0.0, total_m, spacing_m)
    if total_m - distance_m[-1] > 1e-6:
        distance_m = np.append(distance_m, total_m)
    # Linear interpolation in lat/lon inside one route segment; segments are short enough
    # (well under a km) that this is centimeter-accurate.
    lat = np.interp(distance_m, vertex_distance_m, vertex_lat)
    lon = np.interp(distance_m, vertex_distance_m, vertex_lon)
    return lat, lon, distance_m


def _bridge_span(distance_m: np.ndarray, bridge: Bridge) -> slice:
    """Samples from the last one at or before the bridge's start to the first at or after its
    end, so the two outer samples are on land."""
    first = max(np.searchsorted(distance_m, bridge.km_start * 1000, side="right") - 1, 0)
    last = min(np.searchsorted(distance_m, bridge.km_end * 1000, side="left"), len(distance_m) - 1)
    return slice(first, last + 1)


def span_bridges(distance_m: np.ndarray, elevation_m: np.ndarray, bridges: list[Bridge]) -> np.ndarray:
    """Replace heights on each bridge with a straight line between the bridge's two ends."""
    patched = elevation_m.copy()
    for bridge in bridges:
        span = _bridge_span(distance_m, bridge)
        first, last = span.start, span.stop - 1
        patched[span] = np.interp(
            distance_m[span],
            [distance_m[first], distance_m[last]],
            [elevation_m[first], elevation_m[last]],
        )
    return patched


def raise_bridge_decks(
    distance_m: np.ndarray,
    lat: np.ndarray,
    lon: np.ndarray,
    elevation_m: np.ndarray,
    bridges: list[Bridge],
    decks: BridgeDeckModel,
) -> np.ndarray:
    """Replace heights on each bridge with the measured height of the deck the course uses.

    Where a point on the bridge has no deck returns (a gap in the scan, or the ramp where the
    bridge meets the ground), the height is filled in along a straight line between the
    nearest measured points, and tied to the ground at the bridge's two ends.
    """
    patched = elevation_m.copy()
    for bridge in bridges:
        span = _bridge_span(distance_m, bridge)
        where = f"{bridge.name} (km {bridge.km_start}-{bridge.km_end})"
        heights = np.array([deck_height(z, bridge.deck, where) for z in decks.returns(lat[span], lon[span])])
        measured = np.isfinite(heights)
        if not measured.any():
            raise ValueError(f"{where}: the surface data has no bridge deck there. Is the km range right?")
        along = distance_m[span]
        known_m, known_h = along[measured], heights[measured]
        if not measured[0]:
            known_m, known_h = np.insert(known_m, 0, along[0]), np.insert(known_h, 0, elevation_m[span][0])
        if not measured[-1]:
            known_m, known_h = np.append(known_m, along[-1]), np.append(known_h, elevation_m[span][-1])
        patched[span] = np.interp(along, known_m, known_h)
    return patched


def smooth_elevation(elevation_m: np.ndarray, spacing_m: float) -> np.ndarray:
    median_half = max(1, round(MEDIAN_WINDOW_M / spacing_m / 2))
    despiked = _sliding_median(elevation_m, median_half)
    return _gaussian(despiked, GAUSSIAN_SIGMA_M / spacing_m)


def _sliding_median(values: np.ndarray, half_window: int) -> np.ndarray:
    padded = np.pad(values, half_window, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, 2 * half_window + 1)
    return np.median(windows, axis=1)


def _gaussian(values: np.ndarray, sigma_samples: float) -> np.ndarray:
    half = int(np.ceil(3 * sigma_samples))
    offsets = np.arange(-half, half + 1)
    kernel = np.exp(-0.5 * (offsets / sigma_samples) ** 2)
    # Normalizing by the summed weights at each position keeps the ends unbiased
    # (no pretend terrain beyond the start and finish).
    weighted = np.convolve(values, kernel, mode="same")
    weights = np.convolve(np.ones_like(values), kernel, mode="same")
    return weighted / weights


def bearings(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Direction of travel at each sample, degrees clockwise from true north, in [0, 360)."""
    forward, _, _ = WGS84.inv(lon[:-1], lat[:-1], lon[1:], lat[1:])
    forward = np.append(forward, forward[-1])
    return np.mod(forward, 360.0)

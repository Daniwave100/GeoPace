"""Course Line builder: route vertices -> evenly spaced samples with distance, elevation, grade.

Steps, in order:
1. Measure the route along the WGS84 ellipsoid and resample it every `spacing_m` meters.
2. Sample bare-earth elevation from an official terrain model at each sample
   (never GPS elevation, which is far too noisy).
2b. Bare-earth models leave out bridge decks, so on a bridge they report the water or road
   underneath. Across each listed bridge we replace the height with a straight line between
   the heights at the bridge's two ends. That suits low, flat city bridges (Berlin). High
   bridges with long ramps (NYC's Verrazzano) need deck heights from surface data instead.
3. Smooth the elevation, THEN compute grade. Grade from unsmoothed data is dominated by
   noise: 0.5 m of error across 10 m looks like a 5% hill.
4. Turn grade into a difficulty factor with a published energy-cost model.
"""

from dataclasses import dataclass

import numpy as np
from pyproj import Geod

from geopace import difficulty
from geopace.course_facts import Bridge
from geopace.elevation import ElevationModel

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
) -> CourseLine:
    lat, lon, distance_m = resample(route, spacing_m)
    raw_elevation = np.asarray(elevation.sample(lat, lon), dtype=float)
    if not np.all(np.isfinite(raw_elevation)):
        bad = int(np.flatnonzero(~np.isfinite(raw_elevation))[0])
        raise ValueError(f"No elevation at km {distance_m[bad] / 1000:.3f} ({lat[bad]:.6f}, {lon[bad]:.6f})")
    ground = span_bridges(distance_m, raw_elevation, bridges)
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
    vlat = np.array([p[0] for p in route], dtype=float)
    vlon = np.array([p[1] for p in route], dtype=float)
    _, _, seg = WGS84.inv(vlon[:-1], vlat[:-1], vlon[1:], vlat[1:])
    cumulative = np.concatenate([[0.0], np.cumsum(seg)])
    total = cumulative[-1]
    distance_m = np.arange(0.0, total, spacing_m)
    if total - distance_m[-1] > 1e-6:
        distance_m = np.append(distance_m, total)
    # Linear interpolation in lat/lon inside one route segment; segments are short enough
    # (well under a km) that this is centimeter-accurate.
    return np.interp(distance_m, cumulative, vlat), np.interp(distance_m, cumulative, vlon), distance_m


def span_bridges(distance_m: np.ndarray, elevation_m: np.ndarray, bridges: list[Bridge]) -> np.ndarray:
    """Replace heights on each bridge with a straight line between the bridge's two ends."""
    patched = elevation_m.copy()
    for bridge in bridges:
        # The last sample at or before the start and the first at or after the end are on land.
        first = max(np.searchsorted(distance_m, bridge.km_start * 1000, side="right") - 1, 0)
        last = min(np.searchsorted(distance_m, bridge.km_end * 1000, side="left"), len(distance_m) - 1)
        span = slice(first, last + 1)
        patched[span] = np.interp(
            distance_m[span],
            [distance_m[first], distance_m[last]],
            [elevation_m[first], elevation_m[last]],
        )
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

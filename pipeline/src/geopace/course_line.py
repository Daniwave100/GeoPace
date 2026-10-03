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
   Either way, a height that was filled in along a straight line is not a measurement. Those
   stretches are listed (`not_measured`) so the app can grey them out instead of drawing a
   guess in the same ink as a survey.
3. Smooth the elevation, THEN compute grade. Grade from unsmoothed data is dominated by
   noise: 0.5 m of error across 10 m looks like a 5% hill.
4. Turn grade into a difficulty factor with a published energy-cost model.
5. Add each point's height above the ellipsoid: the smoothed height above sea level plus what a
   published geoid model says separates the two at that place. The app's 3D scene needs it to
   draw the course at the road's own height (a globe's heights count from the ellipsoid).
"""

from dataclasses import dataclass, replace
from typing import TypeVar

import numpy as np
from pyproj import Geod

from geopace import difficulty
from geopace.course_facts import Bridge
from geopace.elevation import BridgeDeckModel, ElevationModel, GeoidModel
from geopace.lidar_decks import deck_heights, decks_over

WGS84 = Geod(ellps="WGS84")

DEFAULT_SPACING_M = 10.0
# A median filter first removes short spikes and pits (single bad cells, curbs, drains)...
MEDIAN_WINDOW_M = 50.0
# ...then a Gaussian blur leaves grades that describe ~100-200 m of road, the scale a runner feels.
GAUSSIAN_SIGMA_M = 50.0
# A gap in a bridge deck's scan shorter than this disappears inside the smoothing above, so it
# is not flagged: a few samples without returns are on every bridge, and nobody can act on them.
MIN_FLAGGED_GAP_M = MEDIAN_WINDOW_M


@dataclass(frozen=True)
class NotMeasured:
    """A stretch of the course whose height is filled in, not measured. `reason` is for the runner."""

    km_start: float
    km_end: float
    reason: str


@dataclass(frozen=True)
class UnderADeck:
    """A stretch of the course that runs under a bridge deck: the lower level of a double-deck
    bridge, or a bridge passing under another. Measured, from the same returns as the deck's own
    height, and never drawn — a deck is not a building (issue #42). The shade table keeps the sun
    off these samples at every step, and `reason` tells the runner why."""

    km_start: float
    km_end: float
    # What is overhead, in the sentence's words: "the upper deck" of this bridge, or "another deck".
    above: str
    # How far over the road the deck overhead stands, median along the stretch.
    deck_above_m: float
    reason: str
    # The survey the deck overhead was read from: the same one as the deck underfoot.
    source: str


@dataclass(frozen=True)
class CourseLine:
    spacing_m: float
    length_m: float
    lat: np.ndarray
    lon: np.ndarray
    distance_m: np.ndarray
    elevation_m: np.ndarray
    # The same height counted from the WGS84 ellipsoid instead of from sea level.
    ellipsoid_height_m: np.ndarray
    grade: np.ndarray
    difficulty: list[float | None]
    bearing_deg: np.ndarray
    # Where elevation_m is a straight line between measured heights, in course order.
    not_measured: list[NotMeasured]
    # Where the course runs under a bridge deck, in course order. Empty without surface data.
    under_a_deck: list[UnderADeck]


def build_course_line(
    route: list[tuple[float, float]],
    elevation: ElevationModel,
    spacing_m: float = DEFAULT_SPACING_M,
    bridges: list[Bridge] = (),
    decks: BridgeDeckModel | None = None,
    *,
    geoid: GeoidModel,
) -> CourseLine:
    lat, lon, distance_m = resample(route, spacing_m)
    raw_elevation = np.asarray(elevation.sample(lat, lon), dtype=float)
    under_a_deck: list[UnderADeck] = []
    if decks is None:
        ground, not_measured = span_bridges(distance_m, raw_elevation, bridges)
    else:
        ground, not_measured, under_a_deck = raise_bridge_decks(distance_m, lat, lon, raw_elevation, bridges, decks)
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
    sea_level_above_ellipsoid = np.asarray(geoid.offset(lat, lon), dtype=float)
    if not np.all(np.isfinite(sea_level_above_ellipsoid)):
        bad = int(np.flatnonzero(~np.isfinite(sea_level_above_ellipsoid))[0])
        raise ValueError(
            f"The geoid model has no value at km {distance_m[bad] / 1000:.3f} ({lat[bad]:.6f}, {lon[bad]:.6f}). "
            "Does the model cover this city?"
        )
    return CourseLine(
        spacing_m=spacing_m,
        length_m=float(distance_m[-1]),
        lat=lat,
        lon=lon,
        distance_m=distance_m,
        elevation_m=smoothed,
        ellipsoid_height_m=smoothed + sea_level_above_ellipsoid,
        grade=grade,
        difficulty=difficulty.difficulty_factor(grade),
        bearing_deg=bearings(lat, lon),
        not_measured=_in_course_order(not_measured),
        under_a_deck=_in_course_order(under_a_deck),
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


def span_bridges(
    distance_m: np.ndarray, elevation_m: np.ndarray, bridges: list[Bridge]
) -> tuple[np.ndarray, list[NotMeasured]]:
    """Replace heights on each bridge with a straight line between the bridge's two ends.

    Nothing on such a bridge is measured, however short it is, so every one of them is flagged.
    """
    patched = elevation_m.copy()
    not_measured = []
    for bridge in bridges:
        span = _bridge_span(distance_m, bridge)
        first, last = span.start, span.stop - 1
        patched[span] = np.interp(
            distance_m[span],
            [distance_m[first], distance_m[last]],
            [elevation_m[first], elevation_m[last]],
        )
        not_measured.append(
            NotMeasured(
                km_start=float(distance_m[first]) / 1000,
                km_end=float(distance_m[last]) / 1000,
                reason=f"{bridge.name}: the ground model leaves the bridge deck out, so the height here "
                "is a straight line between the bridge's two ends.",
            )
        )
    return patched, not_measured


def raise_bridge_decks(
    distance_m: np.ndarray,
    lat: np.ndarray,
    lon: np.ndarray,
    elevation_m: np.ndarray,
    bridges: list[Bridge],
    decks: BridgeDeckModel,
) -> tuple[np.ndarray, list[NotMeasured], list[UnderADeck]]:
    """Replace heights on each bridge with the measured height of the deck the course uses.

    Where a point on the bridge has no returns from the deck the course uses (a gap in the scan,
    the ramp where the bridge meets the ground, or the upper deck of a double-deck bridge hiding
    the lower one from the scan, issue #56), the height is filled in along a straight line between
    the nearest measured points, and tied to the ground at the bridge's two ends. Those stretches
    are flagged as not measured, unless they are too short to survive the smoothing.

    The same returns say where a second deck stands over the one the course uses (the Queensboro's
    upper level over its lower, issue #42): those stretches are listed too, for the shade table.
    """
    patched = elevation_m.copy()
    not_measured = []
    under_a_deck = []
    for bridge in bridges:
        span = _bridge_span(distance_m, bridge)
        where = f"{bridge.name} (km {bridge.km_start}-{bridge.km_end})"
        returns = decks.returns(lat[span], lon[span])
        heights = deck_heights(returns, bridge.deck, where)
        measured = np.isfinite(heights)
        if not measured.any():
            raise ValueError(f"{where}: the surface data has no bridge deck there. Is the km range right?")
        under_a_deck.extend(_under_a_deck(distance_m[span], heights, decks_over(returns, heights), bridge, decks.source.url))
        along = distance_m[span]
        known_m, known_h = along[measured], heights[measured]
        if not measured[0]:
            known_m, known_h = np.insert(known_m, 0, along[0]), np.insert(known_h, 0, elevation_m[span][0])
        if not measured[-1]:
            known_m, known_h = np.append(known_m, along[-1]), np.append(known_h, elevation_m[span][-1])
        patched[span] = np.interp(along, known_m, known_h)
        for gap_start_m, gap_end_m in _gaps(along, measured):
            not_measured.append(
                NotMeasured(
                    km_start=gap_start_m / 1000,
                    km_end=gap_end_m / 1000,
                    reason=f"{bridge.name}: the survey has no returns from the bridge deck here, so the "
                    "height is a straight line between the measured heights either side.",
                )
            )
    return patched, not_measured, under_a_deck


def _under_a_deck(along_m: np.ndarray, deck_m: np.ndarray, over_m: np.ndarray, bridge: Bridge, source: str) -> list[UnderADeck]:
    """The stretches of one bridge that run under a deck, from the returns at each of its points.

    Where the scan sees the runners' deck and nothing over it, the sky is open, and a stretch ends
    there. Two kinds of break are carried across instead. A break shorter than MIN_FLAGGED_GAP_M,
    whatever the scan saw in it: at 10 m samples read from returns within 5 m, one sample that
    happens to catch the runners' deck alone is the scan's density, not a hole in the deck
    overhead, and 50 m is the bar a gap in the deck's own height has to clear to be flagged. And a
    gap where the scan has no deck at all, however long, between two stretches under a deck: it
    has nothing to say there, a deck has no holes, and the height is already filled in and flagged
    across the same gap, which greys this too. A stretch shorter than MIN_FLAGGED_GAP_M — a ramp
    crossing over for a moment — is left out, for the same reason a gap that short isn't flagged.
    """
    under = np.isfinite(over_m)
    nothing_seen = ~np.isfinite(deck_m)
    spans = []
    i = 0
    while i < len(under):
        if not under[i]:
            i += 1
            continue
        end = i
        j = i + 1
        # Carry on past a break while it is short, or while the scan has seen nothing since `end`.
        while j < len(under) and (along_m[j] - along_m[end] < MIN_FLAGGED_GAP_M or nothing_seen[end + 1 : j].all()):
            if under[j]:
                end = j
            j += 1
        if along_m[end] - along_m[i] >= MIN_FLAGGED_GAP_M:
            inside = slice(i, end + 1)
            above = "the upper deck" if bridge.deck == "lower" else "another deck"
            spans.append(
                UnderADeck(
                    km_start=float(along_m[i]) / 1000,
                    km_end=float(along_m[end]) / 1000,
                    above=above,
                    deck_above_m=round(float(np.nanmedian(over_m[inside] - deck_m[inside])), 1),
                    reason=f"{bridge.name}: the survey's bridge-deck returns stand over the road here, so the road runs under {above} and the sun never reaches it.",
                    source=source,
                )
            )
        i = end + 1
    return spans

def _gaps(along_m: np.ndarray, measured: np.ndarray) -> list[tuple[float, float]]:
    """Stretches of a bridge with no measured deck height, each from the measured point before
    it to the measured point after it (or the bridge's end, which is tied to the ground)."""
    gaps = []
    i = 0
    while i < len(measured):
        if measured[i]:
            i += 1
            continue
        run_end = i
        while run_end + 1 < len(measured) and not measured[run_end + 1]:
            run_end += 1
        start_m = float(along_m[max(i - 1, 0)])
        end_m = float(along_m[min(run_end + 1, len(measured) - 1)])
        if end_m - start_m >= MIN_FLAGGED_GAP_M:
            gaps.append((start_m, end_m))
        i = run_end + 1
    return gaps


Span = TypeVar("Span", NotMeasured, UnderADeck)


def _in_course_order(spans: list[Span]) -> list[Span]:
    """Sorted by where they start, and never overlapping: two bridges listed back to back share
    the sample where one ends and the next begins."""
    ordered = []
    reached_km = 0.0
    for span in sorted(spans, key=lambda s: s.km_start):
        start = max(span.km_start, reached_km)
        if start < span.km_end:
            ordered.append(replace(span, km_start=start))
            reached_km = span.km_end
    return ordered


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

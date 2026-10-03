"""Bridge decks from a tiled, classified LiDAR point cloud.

City LiDAR comes as thousands of tiles (NYC's 2017 scan is 1,894 tiles, ~180 GB). We never
download all of it: for each stretch of bridge we read only the tiles it crosses, and from those
only the points inside a narrow box around the course. What we keep, the returns classified as
bridge deck, is cached on disk so later builds don't read the tiles again.
"""

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from pyproj import Transformer

from geopace.elevation import BridgeDeckModel
from geopace.provenance import Attribution, Source

# ASPRS LAS 1.4 point class for bridge decks.
BRIDGE_DECK = 17
# Deck returns within this distance of a course point count as "under the runner's feet".
# Wide enough to always catch some returns on a deck, narrow enough to stay on one roadway.
SEARCH_RADIUS_M = 5.0
# Course points per box read from the tiles (at 10 m spacing, a box covers ~200 m of course).
POINTS_PER_BOX = 20
# Returns more than this far apart in height belong to different decks (the two levels of NYC's
# Queensboro Bridge are ~6 m apart; one deck's returns spread well under 1 m).
DECK_GAP_M = 2.0
# Fewer returns than this near a point is not a deck (a stray return, a sign, a light pole).
MIN_DECK_RETURNS = 3
# A layer with far fewer returns than the busiest one is something passing over or under the
# course (a ramp, a walkway), not a deck the runners could be on.
MIN_DECK_SHARE = 0.25
# A deck over the runners has to stand at least this far above the deck under them, top to top,
# because the scan sees top surfaces only: a lorry needs about four metres of headroom under a
# roof (shade.py's UNDER_A_ROOF_M) and a deck is about a metre thick, so nothing drives under
# anything closer. A second layer nearer than this is a parapet, a wall, or a roadway beside the
# course that SEARCH_RADIUS_M caught, not a deck over the road.
MIN_DECK_OVERHEAD_M = 5.0


@dataclass(frozen=True)
class LidarTile:
    name: str
    url: str
    # Bounds in the point cloud's own coordinate system (meters).
    min_x: float
    min_y: float
    max_x: float
    max_y: float


# (tile, min_x, min_y, max_x, max_y) -> structured array with x, y, z, classification fields
# for the tile's points inside that box.
ReadPoints = Callable[[LidarTile, float, float, float, float], np.ndarray]


def lidar_deck_model(
    tiles: list[LidarTile],
    read_points: ReadPoints,
    cache_folder: Path,
    source: Source,
    attribution: Attribution,
    crs: str = "EPSG:6347",
) -> BridgeDeckModel:
    to_crs = Transformer.from_crs("EPSG:4326", crs, always_xy=True)

    def deck_points(min_x: float, min_y: float, max_x: float, max_y: float) -> np.ndarray:
        """(n, 3) array of x, y, z for the bridge-deck returns in the box, from the cache if possible."""
        box = f"{crs} {min_x:.2f} {min_y:.2f} {max_x:.2f} {max_y:.2f}"
        path = cache_folder / f"deck-{hashlib.sha1(box.encode()).hexdigest()[:16]}.npy"
        if path.exists():
            return np.load(path)
        crossed = [t for t in tiles if t.min_x <= max_x and min_x <= t.max_x and t.min_y <= max_y and min_y <= t.max_y]
        if not crossed:
            raise ValueError(f"There are no LiDAR tiles covering the box {box}")
        parts = [np.empty((0, 3))]
        for t in crossed:
            points = read_points(t, min_x, min_y, max_x, max_y)
            deck = points[points["classification"] == BRIDGE_DECK]
            parts.append(np.column_stack([deck["x"], deck["y"], deck["z"]]))
        found = np.concatenate(parts)
        cache_folder.mkdir(parents=True, exist_ok=True)
        np.save(path, found)
        return found

    def returns(lat: np.ndarray, lon: np.ndarray) -> list[np.ndarray]:
        xs, ys = to_crs.transform(np.asarray(lon, dtype=float), np.asarray(lat, dtype=float))
        xs, ys = np.atleast_1d(xs), np.atleast_1d(ys)
        out = []
        for start in range(0, len(xs), POINTS_PER_BOX):
            box_x, box_y = xs[start : start + POINTS_PER_BOX], ys[start : start + POINTS_PER_BOX]
            deck = deck_points(
                box_x.min() - SEARCH_RADIUS_M,
                box_y.min() - SEARCH_RADIUS_M,
                box_x.max() + SEARCH_RADIUS_M,
                box_y.max() + SEARCH_RADIUS_M,
            )
            for x, y in zip(box_x, box_y):
                near = (deck[:, 0] - x) ** 2 + (deck[:, 1] - y) ** 2 <= SEARCH_RADIUS_M**2
                out.append(deck[near, 2])
        return out

    return BridgeDeckModel(returns=returns, source=source, attribution=attribution)


def deck_heights(returns: list[np.ndarray], deck: str | None, where: str) -> np.ndarray:
    """The height of the deck under the runners at each point along a bridge, NaN where the scan
    has nothing to say.

    The returns near a point can fall in more than one layer: the bridge's own deck, and whatever
    passes over or under it there (a ramp, a walkway, the other level of a double-deck bridge).
    Layers with far fewer returns than the busiest are discarded, then:

    - no deck named: one layer left is the deck. Several, and a deck runs on unbroken, so take the
      layer nearest the height of the closest point that was not ambiguous. That is how a bridge
      passing under something else for a few meters resolves itself.
    - the course facts name a deck ("upper"/"lower"): a bridge that is double-decked the whole way
      (NYC's Queensboro) can only be resolved this way, and `_named_deck` says how.
    """
    layers = [_layers(z) for z in returns]
    if deck is not None:
        return _named_deck(layers, deck)
    heights = np.array([layer[0] if len(layer) == 1 else np.nan for layer in layers])
    ambiguous = [i for i, layer in enumerate(layers) if len(layer) > 1]
    if ambiguous and not np.any(np.isfinite(heights)):
        found = ", ".join(f"{h:.1f} m" for h in layers[ambiguous[0]])
        raise ValueError(
            f"{where} has more than one deck in the surface data ({found}) all the way along. "
            "Say which one the course uses in the course facts with `deck: upper` or `deck: lower`."
        )
    known = np.flatnonzero(np.isfinite(heights))
    for i in ambiguous:
        nearest = known[np.argmin(np.abs(known - i))]
        heights[i] = min(layers[i], key=lambda h: abs(h - heights[nearest]))
    return heights


def _named_deck(layers: list[list[float]], deck: str) -> np.ndarray:
    """The height of the deck the course facts name, at each point of a double-deck bridge, NaN
    where the scan does not see that deck.

    A point that sees two decks has the named one by position, the lowest or the highest layer. A
    point that sees one layer could be seeing either: the scan sees top surfaces, so where the
    upper deck covers the lower one the lower deck is not in the returns at all, and the one layer
    left is the upper deck whichever deck the course uses (issue #56). Read as the lowest of one,
    it put the Queensboro's road 6 m up on the upper deck for 50 m. A deck runs on unbroken, so a
    lone layer is the named deck only if it is nearer that deck's line than the other deck's, each
    line drawn between the nearest points either side that saw both decks. Two layers closer than
    MIN_DECK_OVERHEAD_M are not two decks (a wall or a roadway beside the course), so such a point
    is no measure of where either deck runs. Where no point on the bridge sees both decks (the
    Verrazzano's upper deck hides its lower one the whole way) there is no other line to compare
    with, and the one layer is the named deck.
    """
    named = (lambda layer: layer[0]) if deck == "lower" else (lambda layer: layer[-1])
    other = (lambda layer: layer[-1]) if deck == "lower" else (lambda layer: layer[0])
    heights = np.array([named(layer) if layer else np.nan for layer in layers])
    saw_both = [i for i, layer in enumerate(layers) if len(layer) > 1 and layer[-1] - layer[0] >= MIN_DECK_OVERHEAD_M]
    if not saw_both:
        return heights
    at = np.arange(len(layers))
    named_line = np.interp(at, saw_both, [named(layers[i]) for i in saw_both])
    other_line = np.interp(at, saw_both, [other(layers[i]) for i in saw_both])
    for i, layer in enumerate(layers):
        if len(layer) == 1 and abs(layer[0] - named_line[i]) > abs(layer[0] - other_line[i]):
            heights[i] = np.nan
    return heights


def decks_over(returns: list[np.ndarray], deck_m: np.ndarray) -> np.ndarray:
    """The height of the deck over the runners' heads at each point along a bridge, NaN where the
    scan sees none: the lowest layer standing at least MIN_DECK_OVERHEAD_M above the deck the
    course uses.

    A bridge deck is not a building, so neither city's building records know that the Queensboro's
    lower level runs under its upper one (issue #42). The scan does: the same returns that give the
    deck under the runners' feet hold a second layer over their heads, and where it stands the sun
    never reaches the road. A point whose own deck is unknown has nothing over it that we can say.
    """
    deck_m = np.asarray(deck_m, dtype=float)
    over = np.full(len(returns), np.nan)
    for i, z in enumerate(returns):
        if not np.isfinite(deck_m[i]):
            continue
        above = [layer for layer in _layers(z) if layer >= deck_m[i] + MIN_DECK_OVERHEAD_M]
        if above:
            over[i] = above[0]
    return over

def _layers(returns: np.ndarray) -> list[float]:
    """The heights the returns near one point fall into, lowest first: a deck, plus anything
    passing over or under it. Empty when there aren't enough returns to call anything a deck."""
    heights = np.sort(np.asarray(returns, dtype=float))
    layers = [layer for layer in np.split(heights, np.flatnonzero(np.diff(heights) > DECK_GAP_M) + 1) if len(layer) >= MIN_DECK_RETURNS]
    if not layers:
        return []
    busiest = max(len(layer) for layer in layers)
    return [float(np.median(layer)) for layer in layers if len(layer) >= MIN_DECK_SHARE * busiest]

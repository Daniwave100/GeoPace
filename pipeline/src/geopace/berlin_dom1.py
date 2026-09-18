"""Berlin's bridge decks, from the city's surface model (ATKIS DOM1, 1 m grid).

The ground model (berlin_dgm1.py) leaves bridge decks out: on a bridge it reports the river or
the road underneath. The surface model is the same survey with everything still standing on the
ground: buildings, trees, and the bridges. So on a listed bridge the deck's height is read from
it, instead of being drawn as a straight line between the bridge's two ends, which is a guess
(and a wrong one on an arched bridge: the Kronprinzenbrücke crests 1.7 m above that line).

A surface model also has in it whatever else was on the bridge on the day of the flight: cars,
lamp posts, a tree leaning over the railing. So a deck's height is never one cell's. For each
point on the course we hand over every cell within a few meters, and lidar_decks.deck_heights
sorts them into layers the same way it does for New York's LiDAR returns: a lamp post is too few
cells to be a layer, a car is within the deck's own layer and loses to the median, and a tree's
canopy is a second layer that doesn't carry on from one sample to the next the way a deck does.
"""

from collections.abc import Callable

import numpy as np

from geopace.berlin_grid import BerlinGrid, heights_at, load_tiles, tile_of, to_utm33
from geopace.elevation import BridgeDeckModel, DeckReturnsFn
from geopace.provenance import Attribution, Source

__all__ = ["deck_model", "returns_from", "cells_within", "to_utm33"]

FEED_URL = "https://gdi.berlin.de/data/dom/atom/"
GRID = BerlinGrid(name="DOM1", tile_url="https://gdi.berlin.de/data/dom/atom/DOM1_{e}_{n}.zip")
# Cells whose centre is within this distance of a course point count as "under the runner's
# feet". Berlin's bridges are 15 m wide and more, so 3 m stays on the roadway, and it is about
# 30 cells: enough that a car or a lamp post is a minority of them.
SEARCH_RADIUS_M = 3.0

SOURCE = Source(
    id="berlin-dom1",
    title="ATKIS® DOM – Digital surface model 1 m (Geoportal Berlin)",
    url=FEED_URL,
    licence="Datenlizenz Deutschland – Zero – Version 2.0 (https://www.govdata.de/dl-de/zero-2-0)",
    accessed="2026-09-18",
    note="Surface heights (ground plus buildings, vegetation and bridges), same grid and tiling as DGM1; feed updated 2025-08-07, tiles from a 2021 flight. Used only for bridge decks.",
)
ATTRIBUTION = Attribution(
    text="Bridge decks: Geoportal Berlin / ATKIS® DOM1 (dl-de/zero-2.0)",
    url=FEED_URL,
)

# (cell_x, cell_y) integer arrays, the cells' lower-left corners in EPSG:25833 meters -> height
# of each cell in meters, NaN where the model has no data.
SurfaceFn = Callable[[np.ndarray, np.ndarray], np.ndarray]


def deck_model(allow_download: bool = True) -> BridgeDeckModel:
    def returns(lat: np.ndarray, lon: np.ndarray) -> list[np.ndarray]:
        # Load every tile the search circles touch once, then read cells out of them.
        easting, northing = to_utm33(np.asarray(lon, dtype=float), np.asarray(lat, dtype=float))
        reach = int(np.ceil(SEARCH_RADIUS_M)) + 1
        corners = [(np.floor(easting) + dx, np.floor(northing) + dy) for dx in (-reach, reach) for dy in (-reach, reach)]
        needed = {tile_of(cx, cy) for xs, ys in corners for cx, cy in zip(np.atleast_1d(xs), np.atleast_1d(ys))}
        grids = load_tiles(GRID, needed, allow_download)
        return returns_from(lambda cell_x, cell_y: heights_at(grids, cell_x, cell_y))(lat, lon)

    return BridgeDeckModel(returns=returns, source=SOURCE, attribution=ATTRIBUTION)


def returns_from(surface: SurfaceFn) -> DeckReturnsFn:
    """The surface heights near each (lat, lon), in the shape lidar_decks.deck_heights expects."""

    def returns(lat: np.ndarray, lon: np.ndarray) -> list[np.ndarray]:
        easting, northing = to_utm33(np.asarray(lon, dtype=float), np.asarray(lat, dtype=float))
        return [cells_within(surface, x, y, SEARCH_RADIUS_M) for x, y in zip(np.atleast_1d(easting), np.atleast_1d(northing))]

    return returns


def cells_within(surface: SurfaceFn, easting: float, northing: float, radius_m: float) -> np.ndarray:
    """Heights of the cells whose centre is within `radius_m` of the point. Cells with no data are left out."""
    reach = int(np.ceil(radius_m))
    offsets = np.arange(-reach, reach + 1)
    cell_x, cell_y = np.meshgrid(np.floor(easting) + offsets, np.floor(northing) + offsets)
    # A cell's centre is half a meter in from its lower-left corner.
    near = (cell_x + 0.5 - easting) ** 2 + (cell_y + 0.5 - northing) ** 2 <= radius_m**2
    heights = np.asarray(surface(cell_x[near].astype(np.int64), cell_y[near].astype(np.int64)), dtype=float)
    return heights[np.isfinite(heights)]

"""Berlin's official bare-earth ground model (ATKIS DGM1, 1 m grid) as an elevation model.

Buildings, trees and bridge decks are removed from it; heights are meters above sea level
(DHHN2016). How the city publishes it, and how the tiles are read, is in berlin_grid.py.
"""

import numpy as np

from geopace.berlin_grid import BerlinGrid, TilesNotCached, heights_at, load_tiles, tile_of, to_utm33
from geopace.elevation import ElevationModel
from geopace.provenance import Attribution, Source

__all__ = ["TilesNotCached", "elevation_model", "sample"]

FEED_URL = "https://gdi.berlin.de/data/dgm1/atom/"
GRID = BerlinGrid(name="DGM1", tile_url="https://gdi.berlin.de/data/dgm1/atom/DGM1_{e}_{n}.zip")

SOURCE = Source(
    id="berlin-dgm1",
    title="ATKIS® DGM – Digital terrain model 1 m (Geoportal Berlin)",
    url=FEED_URL,
    licence="Datenlizenz Deutschland – Zero – Version 2.0 (https://www.govdata.de/dl-de/zero-2-0)",
    accessed="2026-09-16",
    note="Bare-earth heights in DHHN2016; feed updated 2025-12-18.",
)
ATTRIBUTION = Attribution(
    text="Elevation: Geoportal Berlin / ATKIS® DGM1 (dl-de/zero-2.0)",
    url="https://gdi.berlin.de/view/dgm1",
)

def elevation_model(allow_download: bool = True) -> ElevationModel:
    return ElevationModel(
        sample=lambda lat, lon: sample(lat, lon, allow_download),
        source=SOURCE,
        attribution=ATTRIBUTION,
    )


def sample(lat: np.ndarray, lon: np.ndarray, allow_download: bool = True) -> np.ndarray:
    """Bilinear interpolation between the four 1 m cells around each point."""
    easting, northing = to_utm33(np.asarray(lon), np.asarray(lat))
    # Cell centers sit at whole meters + 0.5, so shift by half a cell before flooring.
    x, y = easting - 0.5, northing - 0.5
    # (west_cell, south_cell) is the cell to the lower left; east_share/north_share (0..1)
    # say how far the point sits toward the next cell east/north.
    west_cell, south_cell = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    east_share, north_share = x - west_cell, y - south_cell

    corners = [
        (west_cell, south_cell),
        (west_cell + 1, south_cell),
        (west_cell, south_cell + 1),
        (west_cell + 1, south_cell + 1),
    ]
    needed = {tile_of(cx, cy) for xs, ys in corners for cx, cy in zip(xs, ys)}
    grids = load_tiles(GRID, needed, allow_download)

    south_west, south_east, north_west, north_east = (heights_at(grids, xs, ys) for xs, ys in corners)
    south = south_west * (1 - east_share) + south_east * east_share
    north = north_west * (1 - east_share) + north_east * east_share
    return south * (1 - north_share) + north * north_share

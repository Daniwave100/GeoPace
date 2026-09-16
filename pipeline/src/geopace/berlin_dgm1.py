"""Berlin's official bare-earth ground model (ATKIS DGM1, 1 m grid) as an elevation model.

The city publishes it as 2 km x 2 km zip files of "easting northing height" text lines in
ETRS89 / UTM zone 33N (EPSG:25833), one line per 1 m cell, heights in meters above sea level
(DHHN2016). We download only the tiles the course passes through.
"""

import io
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from pyproj import Transformer

from geopace.cache import cache_dir, download
from geopace.elevation import ElevationModel
from geopace.provenance import Attribution, Source

TILE_URL = "https://gdi.berlin.de/data/dgm1/atom/DGM1_{e}_{n}.zip"
FEED_URL = "https://gdi.berlin.de/data/dgm1/atom/"
TILE_SIZE_M = 2000

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

_to_utm33 = Transformer.from_crs("EPSG:4326", "EPSG:25833", always_xy=True)


class TilesNotCached(FileNotFoundError):
    """Downloads were turned off and some needed terrain tiles aren't in the cache."""


def elevation_model(allow_download: bool = True) -> ElevationModel:
    return ElevationModel(
        sample=lambda lat, lon: sample(lat, lon, allow_download),
        source=SOURCE,
        attribution=ATTRIBUTION,
    )


def sample(lat: np.ndarray, lon: np.ndarray, allow_download: bool = True) -> np.ndarray:
    """Bilinear interpolation between the four 1 m cells around each point."""
    easting, northing = _to_utm33.transform(np.asarray(lon), np.asarray(lat))
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
    needed = {_tile_of(cx, cy) for xs, ys in corners for cx, cy in zip(xs, ys)}
    grids = _load_tiles(needed, allow_download)

    def height(xs, ys):
        out = np.empty(xs.shape)
        for i, (cx, cy) in enumerate(zip(xs, ys)):
            east_km, north_km = _tile_of(cx, cy)
            out[i] = grids[(east_km, north_km)][cy - north_km * 1000, cx - east_km * 1000]
        return out

    south_west, south_east, north_west, north_east = (height(xs, ys) for xs, ys in corners)
    south = south_west * (1 - east_share) + south_east * east_share
    north = north_west * (1 - east_share) + north_east * east_share
    return south * (1 - north_share) + north * north_share


def _tile_of(cell_x: int, cell_y: int) -> tuple[int, int]:
    """Tile name parts (lower-left corner in km, even numbers) for a 1 m cell."""
    return (int(cell_x) // TILE_SIZE_M * 2, int(cell_y) // TILE_SIZE_M * 2)


def _load_tiles(tiles: set[tuple[int, int]], allow_download: bool) -> dict[tuple[int, int], np.ndarray]:
    folder = cache_dir() / "berlin" / "dgm1"
    todo = sorted(tiles)
    missing = [t for t in todo if not (folder / f"DGM1_{t[0]}_{t[1]}.zip").exists()]
    if missing and not allow_download:
        raise TilesNotCached(f"{len(missing)} DGM1 tiles are not cached in {folder}")
    print(f"  DGM1: {len(todo)} tiles (downloading any not yet cached into {folder})")
    with ThreadPoolExecutor(max_workers=4) as pool:
        paths = list(pool.map(lambda t: download(TILE_URL.format(e=t[0], n=t[1]), folder / f"DGM1_{t[0]}_{t[1]}.zip"), todo))
    return {tile: _read_tile(tile, path) for tile, path in zip(todo, paths)}


def _read_tile(tile: tuple[int, int], path: Path) -> np.ndarray:
    """A 2000 x 2000 grid indexed [north offset m, east offset m]. Missing cells are NaN."""
    with zipfile.ZipFile(path) as archive:
        (name,) = [n for n in archive.namelist() if n.endswith(".xyz")]
        xyz = np.loadtxt(io.BytesIO(archive.read(name)))
    grid = np.full((TILE_SIZE_M, TILE_SIZE_M), np.nan, dtype=np.float32)
    col = np.floor(xyz[:, 0]).astype(np.int64) - tile[0] * 1000
    row = np.floor(xyz[:, 1]).astype(np.int64) - tile[1] * 1000
    grid[row, col] = xyz[:, 2]
    return grid

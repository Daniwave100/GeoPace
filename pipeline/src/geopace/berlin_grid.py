"""Berlin's official 1 m height grids: how the city publishes them, and how to read them.

The ground model (DGM1) and the surface model (DOM1) come the same way: 2 km x 2 km zip files of
"easting northing height" text lines in ETRS89 / UTM zone 33N (EPSG:25833), one line per 1 m
cell, heights in meters above sea level. We download only the tiles the course passes through.
"""

import io
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from pyproj import Transformer

from geopace.cache import cache_dir, download

TILE_SIZE_M = 2000

_to_utm33 = Transformer.from_crs("EPSG:4326", "EPSG:25833", always_xy=True)


def to_utm33(lon, lat):
    """(easting, northing) in meters, EPSG:25833."""
    return _to_utm33.transform(lon, lat)


@dataclass(frozen=True)
class BerlinGrid:
    """One of the city's tiled 1 m grids."""

    name: str  # "DGM1" or "DOM1": it is in every tile's file name
    tile_url: str  # with {e} and {n}: the tile's lower-left corner in km (even numbers)


class TilesNotCached(FileNotFoundError):
    """Downloads were turned off and some needed tiles aren't in the cache."""


# Tiles already read during this run. A tile is 4 million lines of text and takes seconds to
# parse, and one build asks for the same tile several times (three of Berlin's bridges share one).
_read_already: dict[Path, np.ndarray] = {}


def tile_of(cell_x: int, cell_y: int) -> tuple[int, int]:
    """Tile name parts (lower-left corner in km, even numbers) for a 1 m cell."""
    return (int(cell_x) // TILE_SIZE_M * 2, int(cell_y) // TILE_SIZE_M * 2)


def load_tiles(grid: BerlinGrid, tiles: set[tuple[int, int]], allow_download: bool) -> dict[tuple[int, int], np.ndarray]:
    folder = cache_dir() / "berlin" / grid.name.lower()
    todo = sorted(tiles)
    file_of = lambda t: folder / f"{grid.name}_{t[0]}_{t[1]}.zip"  # noqa: E731
    missing = [t for t in todo if not file_of(t).exists()]
    if missing and not allow_download:
        raise TilesNotCached(f"{len(missing)} {grid.name} tiles are not cached in {folder}")
    if any(file_of(t) not in _read_already for t in todo):
        print(f"  {grid.name}: {len(todo)} tiles (downloading any not yet cached into {folder})")
    with ThreadPoolExecutor(max_workers=4) as pool:
        paths = list(pool.map(lambda t: download(grid.tile_url.format(e=t[0], n=t[1]), file_of(t)), todo))
    for tile, path in zip(todo, paths):
        if path not in _read_already:
            _read_already[path] = _read_tile(tile, path)
    return {tile: _read_already[path] for tile, path in zip(todo, paths)}


def heights_at(grids: dict[tuple[int, int], np.ndarray], cell_x: np.ndarray, cell_y: np.ndarray) -> np.ndarray:
    """The height in each 1 m cell, from tiles already loaded. NaN where a cell has no data."""
    out = np.empty(np.shape(cell_x))
    for i, (cx, cy) in enumerate(zip(cell_x, cell_y)):
        east_km, north_km = tile_of(cx, cy)
        out[i] = grids[(east_km, north_km)][cy - north_km * 1000, cx - east_km * 1000]
    return out


def _read_tile(tile: tuple[int, int], path: Path) -> np.ndarray:
    """A 2000 x 2000 grid indexed [north offset m, east offset m]. Missing cells are NaN."""
    with zipfile.ZipFile(path) as archive:
        # One text file per tile: .xyz in the ground model's zips, .txt in the surface model's.
        (name,) = [n for n in archive.namelist() if n.endswith((".xyz", ".txt"))]
        xyz = np.loadtxt(io.BytesIO(archive.read(name)))
    grid = np.full((TILE_SIZE_M, TILE_SIZE_M), np.nan, dtype=np.float32)
    col = np.floor(xyz[:, 0]).astype(np.int64) - tile[0] * 1000
    row = np.floor(xyz[:, 1]).astype(np.int64) - tile[1] * 1000
    grid[row, col] = xyz[:, 2]
    return grid

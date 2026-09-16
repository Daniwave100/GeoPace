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


def elevation_model() -> ElevationModel:
    return ElevationModel(sample=sample, source=SOURCE, attribution=ATTRIBUTION)


def sample(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Bilinear interpolation between the four 1 m cells around each point."""
    easting, northing = _to_utm33.transform(np.asarray(lon), np.asarray(lat))
    # Cell centers sit at whole meters + 0.5, so shift by half a cell before flooring.
    fx, fy = easting - 0.5, northing - 0.5
    ix, iy = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    tx, ty = fx - ix, fy - iy

    corners = [(ix, iy), (ix + 1, iy), (ix, iy + 1), (ix + 1, iy + 1)]
    needed = {_tile_of(x, y) for xs, ys in corners for x, y in zip(xs, ys)}
    grids = _load_tiles(needed)

    def height(xs, ys):
        out = np.empty(xs.shape)
        for i, (x, y) in enumerate(zip(xs, ys)):
            e, n = _tile_of(x, y)
            out[i] = grids[(e, n)][y - n * 1000, x - e * 1000]
        return out

    h00, h10, h01, h11 = (height(xs, ys) for xs, ys in corners)
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty


def _tile_of(cell_x: int, cell_y: int) -> tuple[int, int]:
    """Tile name parts (lower-left corner in km, even numbers) for a 1 m cell."""
    return (int(cell_x) // TILE_SIZE_M * 2, int(cell_y) // TILE_SIZE_M * 2)


def _load_tiles(tiles: set[tuple[int, int]]) -> dict[tuple[int, int], np.ndarray]:
    folder = cache_dir() / "berlin" / "dgm1"
    todo = sorted(tiles)
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

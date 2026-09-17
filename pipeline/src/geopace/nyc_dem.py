"""NYC's 1-foot bare-earth elevation model (DEM) from the 2017 LiDAR, as an elevation model.

Made from the same May 2017 scan as the bridge decks (nyc_lidar.py), with buildings, trees and
bridges removed. NOAA's Digital Coast republishes it as 31 Cloud-Optimized GeoTIFFs (~20 GB in
all) in NAD83(2011) / New York Long Island (EPSG:6539), US survey feet, NAVD88 heights in feet.
A COG is split into 512 x 512 px blocks that can be read one at a time over HTTP, so we download
only the blocks the course passes through (~156 m squares) and cache them.
"""

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window

from geopace.cache import cache_dir, download
from geopace.elevation import ElevationModel
from geopace.provenance import Attribution, Source

BASE_URL = "https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/dem/NYC_topobathy_BE_DEM_2017_9307/"
ITEMS_URL = BASE_URL + "stac/noaa_item_collection_m9307.json"
BLOCK_PX = 512
US_SURVEY_FOOT_M = 1200 / 3937

SOURCE = Source(
    id="nyc-dem-2017",
    title="2017 NYC 1-foot bare-earth DEM (City of New York topobathymetric LiDAR), via NOAA Digital Coast",
    url="https://www.fisheries.noaa.gov/inport/item/64732",
    licence="NYC Open Data: no restrictions on use (NYC Admin. Code § 23-504); NOAA redistribution, no access constraints",
    accessed="2026-09-17",
    note="Bare earth: buildings, trees and bridge decks removed. NAVD88 heights, converted from US survey feet to meters.",
)
ATTRIBUTION = Attribution(
    text="Elevation: 2017 NYC 1-ft DEM (City of New York / NOAA Digital Coast)",
    url="https://www.fisheries.noaa.gov/inport/item/64732",
)

_to_ny_long_island = Transformer.from_crs("EPSG:4326", "EPSG:6539", always_xy=True)


class BlocksNotCached(FileNotFoundError):
    """Downloads were turned off and some needed DEM blocks aren't in the cache."""


@dataclass(frozen=True)
class Tile:
    name: str
    url: str
    west: float  # feet, left edge
    north: float  # feet, top edge
    pixel_ft: float
    rows: int
    cols: int


def elevation_model(allow_download: bool = True) -> ElevationModel:
    folder = cache_dir() / "nyc" / "dem"
    items = folder / "items.json"
    if not items.exists() and not allow_download:
        raise BlocksNotCached(f"The DEM tile list is not cached at {items}")
    tiles = _read_items(download(ITEMS_URL, items))
    return ElevationModel(
        sample=lambda lat, lon: sample(lat, lon, tiles, folder, allow_download),
        source=SOURCE,
        attribution=ATTRIBUTION,
    )


def sample(lat, lon, tiles: list[Tile], folder: Path, allow_download: bool = True) -> np.ndarray:
    """Bilinear interpolation between the four 1-ft cells around each point, in meters. NaN where
    no tile has data."""
    x, y = _to_ny_long_island.transform(np.atleast_1d(np.asarray(lon, dtype=float)), np.atleast_1d(np.asarray(lat, dtype=float)))
    out = np.full(x.shape, np.nan)
    blocks: dict[tuple[str, int, int], np.ndarray] = {}
    with _RemoteTiles(allow_download) as remote:
        for tile in tiles:
            _sample_tile(tile, x, y, out, blocks, remote, folder)
    return out


def corridor_blocks(tile: Tile, x: np.ndarray, y: np.ndarray) -> list[tuple[int, int]]:
    """The blocks of this tile the given points need: the corridor along the course. Every other
    block of the tile is left on the server."""
    col, row, inside = _pixels(tile, x, y)
    needed = set()
    for r in (np.floor(row[inside]), np.floor(row[inside]) + 1):
        for c in (np.floor(col[inside]), np.floor(col[inside]) + 1):
            needed |= set(zip((r // BLOCK_PX).astype(int).tolist(), (c // BLOCK_PX).astype(int).tolist()))
    return sorted(needed)


def _pixels(tile: Tile, x: np.ndarray, y: np.ndarray):
    """Pixel column and row of each point in the tile, and which points it actually covers."""
    # Cell centers sit half a cell in from the tile's corner.
    col = (x - tile.west) / tile.pixel_ft - 0.5
    row = (tile.north - y) / tile.pixel_ft - 0.5
    inside = (col >= 0) & (row >= 0) & (col < tile.cols - 1) & (row < tile.rows - 1)
    return col, row, inside


def _sample_tile(tile: Tile, x, y, out: np.ndarray, blocks: dict, remote: "_RemoteTiles", folder: Path) -> None:
    """Fill in out[i] for every point still NaN that this tile has data for."""
    todo = np.flatnonzero(np.isnan(out))
    col, row, inside = _pixels(tile, x[todo], y[todo])
    for block_row, block_col in corridor_blocks(tile, x[todo], y[todo]):
        key = (tile.name, block_row, block_col)
        if key not in blocks:
            blocks[key] = _block(tile, block_row, block_col, folder, remote)

    def height(r: int, c: int) -> float:
        return blocks[(tile.name, r // BLOCK_PX, c // BLOCK_PX)][r % BLOCK_PX, c % BLOCK_PX]

    for i, c, r in zip(todo[inside], col[inside], row[inside]):
        west, north = math.floor(c), math.floor(r)
        east_share, south_share = c - west, r - north
        top = height(north, west) * (1 - east_share) + height(north, west + 1) * east_share
        bottom = height(north + 1, west) * (1 - east_share) + height(north + 1, west + 1) * east_share
        out[i] = (top * (1 - south_share) + bottom * south_share) * US_SURVEY_FOOT_M


class _RemoteTiles:
    """Opens each DEM tile over HTTP at most once per sampling run."""

    def __init__(self, allow_download: bool):
        self.allow_download = allow_download
        self._open: dict[str, rasterio.DatasetReader] = {}

    def __enter__(self):
        self._env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2")
        self._env.__enter__()
        return self

    def __exit__(self, *exc):
        for dataset in self._open.values():
            dataset.close()
        self._env.__exit__(*exc)

    def dataset(self, tile: Tile) -> rasterio.DatasetReader:
        if tile.name not in self._open:
            print(f"  DEM: reading blocks along the course from {tile.name}")
            self._open[tile.name] = rasterio.open(f"/vsicurl/{tile.url}")
        return self._open[tile.name]


def _block(tile: Tile, block_row: int, block_col: int, folder: Path, remote: _RemoteTiles) -> np.ndarray:
    """One 512 x 512 block of heights in feet (NaN = no data), padded with NaN at the tile's edge."""
    path = folder / "blocks" / f"{tile.name}_{block_row}_{block_col}.npy"
    if path.exists():
        return np.load(path)
    if not remote.allow_download:
        raise BlocksNotCached(f"DEM block {path.name} is not cached in {path.parent}")
    dem = remote.dataset(tile)
    window = Window(block_col * BLOCK_PX, block_row * BLOCK_PX, BLOCK_PX, BLOCK_PX)
    heights = dem.read(1, window=window, boundless=True, fill_value=dem.nodata, masked=True)
    grid = heights.filled(np.nan).astype(np.float32)
    grid[grid < -1e30] = np.nan  # the nodata value, in case the mask missed it
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, grid)
    return grid


def _read_items(path: Path) -> list[Tile]:
    with open(path, encoding="utf-8") as f:
        features = json.load(f)["features"]
    tiles = []
    for feature in features:
        (asset,) = feature["assets"].values()
        pixel, _, west, _, neg_pixel, north = asset["proj:transform"][:6]
        if asset.get("proj:epsg") != 6539 or pixel != -neg_pixel:
            raise ValueError(f"DEM tile {feature['id']} is not a north-up EPSG:6539 grid")
        rows, cols = asset["proj:shape"]
        tiles.append(Tile(feature["id"], asset["href"], west, north, pixel, rows, cols))
    return tiles

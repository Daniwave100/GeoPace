"""New York's trees, from the city's own land cover and the LiDAR that made it.

New York has no tree register worth working shade out from: its forestry records carry a trunk
diameter and no height at all, and they stop at the trees the Parks Department tends — which
leaves out Central Park, where the race spends its last four kilometres. So the crowns here are
put together from two datasets the city publishes, each doing the thing it is good at:

  - **Where the trees are:** the 2017 6-inch land cover, class 1, *Tree Canopy*. Eight classes
    over the whole city at six inches, made by the city from the 2017 LiDAR and 2016 four-band
    imagery, with its own buildings, bridges and roads layers thrown in. Top-down, so a crown that
    overhangs a road is canopy; and only vegetation over 8 feet is in the class at all. It is the
    published answer to "is that a tree", and because it already knows what a building and a
    bridge are, no shed, scaffold or bridge tower can come out of here as a tree.
  - **How tall they are:** the 2017 topobathymetric LiDAR (nyc_lidar.py), read out of the same
    COPC tiles the bridge decks come from. ⚠️ Its points are classified as ground, bridge deck or
    *unclassified* and nothing else — there is no vegetation class anywhere along this course, so
    the LiDAR cannot say where a tree is, only how high whatever stands there reaches. Inside the
    canopy mask, the highest return in a cell is the top of the leaves.

The ground under each patch is the bare-earth DEM the course line already uses (nyc_dem.py), so a
crown and the road agree, and the canopy height is the difference.

⚠️ **The land cover is a 1.3 GB download that unpacks to 91 GB** — a six-inch byte per 3,000 km²
of city. Nothing that size is kept: the corridor is read once into a grid of canopy heights, that
grid is cached, and the raw files can be deleted. Every later build reads the cache; only a
rebuild after the course itself moves needs the download again (PLAN.md D60).
"""

import hashlib
import time
from pathlib import Path

import laspy
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import shapes
from rasterio.windows import Window

from geopace import nyc_lidar
from geopace.buildings import simplify_ring
from geopace.cache import ATTEMPTS, PAUSE_S, cache_dir, download
from geopace.elevation import ElevationModel
from geopace.provenance import Attribution, Source
from geopace.trees import MIN_CROWN_M, Crown, TreesModel, crown_over

# Where the land cover comes from, and what it unpacks to. Socrata serves it as one blob.
LAND_COVER_URL = "https://data.cityofnewyork.us/download/he6d-2qns/application%2Fzip"
LAND_COVER_FILE = "NYC_2017_LiDAR_LandCover.img"
ABOUT_URL = "https://data.cityofnewyork.us/Environment/Land-Cover-Raster-Data-2017-6in-Resolution/he6d-2qns"
# The land cover's own class for a tree crown. (2 is grass and shrubs, 5 buildings, 6 roads.)
TREE_CANOPY = 1
# The raster is in New York State Plane Long Island, US survey feet, at six inches.
LAND_COVER_CRS = "EPSG:2263"
US_SURVEY_FOOT_M = 1200 / 3937
# How fine the canopy is worked out: thirteen of the land cover's own cells, so that every box
# along the course lands on one lattice and a wood cut between two boxes lines up exactly. That is
# 6.5 feet, a shade under two metres — finer than a street tree's crown is wide.
GRID_PX = 13
GRID_FT = GRID_PX * 0.5
GRID_M = GRID_FT * US_SURVEY_FOOT_M
# Heights are rounded to this before the canopy is cut into patches, so a stand of trees comes out
# as a few flat-topped patches rather than one slab at its tallest tree's height. A block model is
# flat-topped anyway (PLAN.md D56); this says how flat, and a patch's height is good to half of it.
HEIGHT_BAND_M = 4.0
# A patch smaller than this is one tall cell: the corner of a crown that is mostly in the next
# band, or a chimney the land cover took for a tree.
MIN_PATCH_CELLS = 4
# How far a traced outline's point may sit from the line it is on before it is dropped. A patch
# comes off the grid as a staircase; this takes the steps out without moving the edge.
SIMPLIFY_M = 2.0
# No tree in New York is this tall — the city's tallest measured trees are about 40 m. A canopy
# cell reading higher than this has caught the edge of a building or a stray return with no class
# to mark it as noise (this scan has none), so it is dropped rather than drawn as a tree. Along the
# course it is 0.3-0.7% of canopy cells, almost all of them at the edge of a park beside a tower.
TALLEST_TREE_M = 45.0
# How coarse a point cloud the tops are read from. The full scan is 8 points per square metre and
# a corridor of it is tens of millions of points; one per square metre finds the top of a crown to
# within a few tens of centimetres and is read in a fraction of the time.
LIDAR_RESOLUTION_M = 1.0

SOURCE = Source(
    id="nyc-land-cover-2017",
    title="Land Cover Raster Data (2017), 6-inch, class 1 Tree Canopy (City of New York, Office of Technology and Innovation)",
    url=ABOUT_URL,
    licence="NYC Open Data: no restrictions on use (NYC Admin. Code § 23-504)",
    accessed="2026-09-21",
    note=(
        "Eight-class land cover at 6 inches, derived from the 2017 LiDAR and 2016 four-band orthoimagery. "
        "Only vegetation over 8 feet is class 1, and the mapping is top-down, so a crown overhanging a road "
        "is canopy. Used as the mask for where a tree is; each patch's height is the highest 2017 LiDAR "
        "return in the cell over the bare-earth DEM, rounded into 4 m bands; a cell reading over 45 m is a "
        "building's edge or a stray return, not a tree, and is dropped. ⚠️ The newer 2021 6-inch canopy "
        "(TNC / University of Vermont) is CC BY-NC-SA — NonCommercial — and is not used."
    ),
)
ATTRIBUTION = Attribution(
    text="Trees: NYC Land Cover 2017 + 2017 NYC Topobathymetric LiDAR (City of New York)",
    url=ABOUT_URL,
)
# What the survey caught the trees wearing, in the runner's words.
LEAVES_WHEN_SURVEYED = "scanned 3–17 May 2017, about half of it with the leaves still off, so a crown here is if anything smaller than the one that will be there on race day"

_to_land_cover = Transformer.from_crs("EPSG:4326", LAND_COVER_CRS, always_xy=True)
_from_land_cover = Transformer.from_crs(LAND_COVER_CRS, "EPSG:4326", always_xy=True)
_lidar_to_land_cover = Transformer.from_crs(nyc_lidar.CRS, LAND_COVER_CRS, always_xy=True)


class LandCoverNotCached(FileNotFoundError):
    """The corridor's canopy isn't cached and the raw land cover isn't here to work it out from."""


def trees_model(elevation: ElevationModel, allow_download: bool = True) -> TreesModel:
    """New York's crowns: the land cover's canopy, at the LiDAR's own height.

    The model remembers which cells of the lattice it has already given out. The corridor's boxes
    overlap where the course bends, and without that a wood in two boxes would be traced twice,
    into two outlines that are not the same shape — drawn on top of each other and shading the
    road twice over. The first box to reach a cell keeps it; the next traces what is left.
    """
    folder = cache_dir() / "nyc" / "trees"
    given_out: set[int] = set()

    def within(south: float, west: float, north: float, east: float) -> list[Crown]:
        height_m, grid = canopy_grid((south, west, north, east), elevation, folder, allow_download)
        return crowns_from(height_m, grid, elevation, given_out)

    return TreesModel(within=within, source=SOURCE, attribution=ATTRIBUTION, leaves_when_surveyed=LEAVES_WHEN_SURVEYED)


def canopy_grid(box: tuple[float, float, float, float], ground: ElevationModel, folder: Path, allow_download: bool = True) -> tuple[np.ndarray, rasterio.Affine]:
    """A grid of canopy heights over the ground for this box, NaN where there is no tree. Cached.

    The cache is the point. What goes into it — 91 GB of six-inch land cover and a corridor of a
    180 GB point cloud — is read once and thrown away; what comes out is a few hundred kilobytes
    per kilometre of course, which is what every later build reads. So the grid's own place in the
    world is kept with it, and nothing here opens the raw raster again.
    """
    south, west, north, east = box
    name = hashlib.sha1(f"{south:.6f},{west:.6f},{north:.6f},{east:.6f},{GRID_PX}".encode()).hexdigest()[:12]
    path = folder / f"canopy-{name}.npz"
    if path.exists():
        kept = np.load(path)
        return kept["height_m"], rasterio.Affine(*kept["grid"])

    canopy, grid = land_cover_canopy(box, allow_download)
    height_m = np.full(canopy.shape, np.nan, dtype=np.float32)
    if canopy.any():
        tops_m = lidar_tops(box, canopy.shape, grid, allow_download)
        rows, cols = np.nonzero(canopy & np.isfinite(tops_m))
        lon, lat = cell_middles(grid, rows, cols)
        ground_m = np.asarray(ground.sample(lat, lon), dtype=float)
        height_m[rows, cols] = (tops_m[rows, cols] - ground_m).astype(np.float32)
    folder.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, height_m=height_m, grid=np.array(tuple(grid)[:6], dtype=float))
    return height_m, grid


def land_cover_canopy(box: tuple[float, float, float, float], allow_download: bool = True) -> tuple[np.ndarray, rasterio.Affine]:
    """Which cells of this box the city's land cover calls tree canopy, and where they are.

    Each cell takes the class most of its six-inch cells are, which for the edge of a crown is the
    same question the crown itself poses: is this piece of ground under the leaves or not? The
    window is snapped outwards to whole cells of one lattice, so a wood that falls in two of the
    corridor's boxes is cut on the same lines in both.
    """
    path = land_cover_file(allow_download)
    with rasterio.open(path) as src:
        window = _snapped_window(src, box)
        shape = (int(window.height) // GRID_PX, int(window.width) // GRID_PX)
        classes = src.read(1, window=window, out_shape=shape, resampling=Resampling.mode, boundless=True, fill_value=0)
        corner = src.transform * (window.col_off, window.row_off)
    return classes == TREE_CANOPY, rasterio.Affine(GRID_FT, 0.0, corner[0], 0.0, -GRID_FT, corner[1])


def _snapped_window(src, box: tuple[float, float, float, float]) -> Window:
    """The box as a window on the land cover, grown outwards to whole cells of the lattice."""
    south, west, north, east = box
    (x0, x1), (y0, y1) = _to_land_cover.transform([west, east], [south, north])
    top_row, left_col = src.index(min(x0, x1), max(y0, y1), op=float)
    bottom_row, right_col = src.index(max(x0, x1), min(y0, y1), op=float)
    col_off = int(np.floor(left_col / GRID_PX)) * GRID_PX
    row_off = int(np.floor(top_row / GRID_PX)) * GRID_PX
    width = max(GRID_PX, int(np.ceil((right_col - col_off) / GRID_PX)) * GRID_PX)
    height = max(GRID_PX, int(np.ceil((bottom_row - row_off) / GRID_PX)) * GRID_PX)
    return Window(col_off, row_off, width, height)


def land_cover_file(allow_download: bool = True) -> Path:
    """Where the land cover raster is, unpacked.

    It is never fetched by the pipeline itself: 1.3 GB down the wire and 91 GB on the disk is a
    thing to say out loud, not to start behind someone's back. A build whose corridor is already
    cached never comes here at all.
    """
    path = cache_dir() / "nyc" / "landcover" / LAND_COVER_FILE
    if not path.exists() or not allow_download:
        raise LandCoverNotCached(
            f"New York's 2017 land cover is not unpacked at {path}, and this box's canopy is not cached either.\n"
            f"  It is a 1.3 GB download that unpacks to 91 GB, so the pipeline never fetches it on its own:\n"
            f"    curl -L '{LAND_COVER_URL}' -o {path.parent / 'Land_Cover.zip'}\n"
            f"    unzip -j {path.parent / 'Land_Cover.zip'} 'Land_Cover/*.img' 'Land_Cover/*.ige' -d {path.parent}\n"
            f"  Build the course once, then both files can be deleted: what the build keeps is the canopy grid."
        )
    return path


def lidar_tops(box: tuple[float, float, float, float], shape: tuple[int, int], grid: rasterio.Affine, allow_download: bool = True) -> np.ndarray:
    """The highest LiDAR return in each cell of the grid, in metres above sea level (NAVD88).

    Inside the canopy mask the highest return is the top of the leaves: the land cover has already
    said that what stands here is a tree, so no class filter is needed and none would work — this
    scan classifies nothing at all as vegetation (see the module's note).
    """
    tops = np.full(shape, -np.inf)
    tiles = nyc_lidar.read_tile_index(download(nyc_lidar.INDEX_URL, cache_dir() / "nyc" / "lidar" / "tileindex.gpkg"))
    south, west, north, east = box
    to_lidar = Transformer.from_crs("EPSG:4326", nyc_lidar.CRS, always_xy=True)
    (x0, x1), (y0, y1) = to_lidar.transform([west, east], [south, north])
    bounds = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
    for tile in tiles:
        if tile.min_x > bounds[2] or tile.max_x < bounds[0] or tile.min_y > bounds[3] or tile.max_y < bounds[1]:
            continue
        if not allow_download:
            raise nyc_lidar.TilesNotCached(f"LiDAR points in {tile.name} are needed for the canopy and are not cached")
        points = _points_in(tile, bounds)
        if len(points) == 0:
            continue
        x, y = _lidar_to_land_cover.transform(np.asarray(points.x), np.asarray(points.y))
        keep_the_highest(tops, grid, x, y, np.asarray(points.z))
    return np.where(np.isfinite(tops), tops, np.nan)


def _points_in(tile, bounds: tuple[float, float, float, float]):
    """One tile's points inside the box, read over HTTP a node at a time.

    A marathon's corridor is a few hundred of these reads against a public bucket, and one dropped
    connection half an hour in would otherwise throw away the whole build. Tried again, waiting a
    little longer each time, the way every other download here is (cache.download).
    """
    for attempt in range(1, ATTEMPTS + 1):
        try:
            with laspy.CopcReader.open(tile.url) as reader:
                return reader.query(laspy.copc.Bounds(mins=np.array(bounds[:2]), maxs=np.array(bounds[2:])), resolution=LIDAR_RESOLUTION_M)
        except Exception as trouble:  # noqa: BLE001 - laspy wraps whatever requests and lazrs raise
            if attempt == ATTEMPTS:
                raise
            print(f"  retrying {tile.name} ({attempt} of {ATTEMPTS - 1}): {trouble}")
            time.sleep(PAUSE_S * attempt)
    raise AssertionError("unreachable")


def keep_the_highest(tops: np.ndarray, grid: rasterio.Affine, x: np.ndarray, y: np.ndarray, z: np.ndarray) -> None:
    """The highest return in each cell of the grid, added to whatever earlier tiles already gave."""
    col = np.floor((x - grid.c) / GRID_FT).astype(np.int64)
    row = np.floor((grid.f - y) / GRID_FT).astype(np.int64)
    inside = (row >= 0) & (row < tops.shape[0]) & (col >= 0) & (col < tops.shape[1])
    np.maximum.at(tops, (row[inside], col[inside]), z[inside])


def crowns_from(height_m: np.ndarray, grid: rasterio.Affine, ground: ElevationModel, given_out: set[int] | None = None) -> list[Crown]:
    """The canopy grid cut into flat-topped patches, each one a crown.

    Heights are rounded into bands first, so a stand of trees comes out as a few patches at
    different heights rather than one slab at its tallest tree's. Each patch's outline comes off
    the grid as a staircase and is simplified back to the shape it is tracing, and each stands on
    the ground under its own middle — the same rule a building block stands by.
    """
    usable = np.isfinite(height_m) & (height_m >= MIN_CROWN_M) & (height_m <= TALLEST_TREE_M)
    if given_out is not None:
        usable = _not_already_given(usable, grid, given_out)
    if not usable.any():
        return []
    banded = np.zeros(height_m.shape, dtype=np.int32)
    banded[usable] = np.maximum(np.round(height_m[usable] / HEIGHT_BAND_M), 1).astype(np.int32)
    patches = []
    for patch, band in shapes(banded, mask=usable, transform=grid, connectivity=8):
        outline = np.asarray(patch["coordinates"][0], dtype=float)  # the exterior; a clearing inside a wood is not cut out
        if _area_m2(outline) < MIN_PATCH_CELLS * GRID_M**2:
            continue
        ring = simplify_ring(_in_degrees(outline), SIMPLIFY_M)
        if len(ring) >= 3:
            patches.append((ring, float(band) * HEIGHT_BAND_M))
    if not patches:
        return []
    middles = np.array([ring.mean(axis=0) for ring, _ in patches])
    ground_m = np.asarray(ground.sample(middles[:, 1], middles[:, 0]), dtype=float)
    crowns = []
    for (ring, height), middle, stands_on in zip(patches, middles, ground_m):
        if not np.isfinite(stands_on):
            continue  # off the edge of the ground model: left out, never stood at sea level
        underside_m, top_m = crown_over(float(stands_on), height)
        crowns.append(Crown(id=f"{middle[0]:.6f},{middle[1]:.6f},{height:.0f}", ring=ring, underside_m=underside_m, top_m=top_m))
    return crowns


def _not_already_given(usable: np.ndarray, grid: rasterio.Affine, given_out: set[int]) -> np.ndarray:
    """The cells no earlier box has handed out, taken for this one. Every window is snapped to the
    same lattice, so a cell has one name wherever it is seen."""
    rows, cols = np.nonzero(usable)
    lattice = (round(-grid.f / GRID_FT) + rows) * 4_000_000 + (round(grid.c / GRID_FT) + cols)
    fresh = np.fromiter((key not in given_out for key in lattice.tolist()), dtype=bool, count=len(lattice))
    given_out.update(lattice[fresh].tolist())
    mine = np.zeros(usable.shape, dtype=bool)
    mine[rows[fresh], cols[fresh]] = True
    return mine


def cell_middles(grid: rasterio.Affine, rows: np.ndarray, cols: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(lon, lat) of the middle of each named cell."""
    return _from_land_cover.transform(grid.c + (cols + 0.5) * GRID_FT, grid.f - (rows + 0.5) * GRID_FT)


def _area_m2(outline: np.ndarray) -> float:
    """The outline's area in square metres, by the shoelace formula."""
    x, y = outline[:, 0] * US_SURVEY_FOOT_M, outline[:, 1] * US_SURVEY_FOOT_M
    return abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))) / 2


def _in_degrees(outline: np.ndarray) -> np.ndarray:
    """A traced outline, from the land cover's feet to (lon, lat), with the closing point dropped."""
    if len(outline) > 1 and outline[0][0] == outline[-1][0] and outline[0][1] == outline[-1][1]:
        outline = outline[:-1]
    lon, lat = _from_land_cover.transform(outline[:, 0], outline[:, 1])
    return np.column_stack([lon, lat])

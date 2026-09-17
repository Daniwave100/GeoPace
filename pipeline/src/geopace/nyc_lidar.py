"""NYC's 2017 topobathymetric LiDAR, used for the bridge decks the bare-earth DEM leaves out.

Flown for the City of New York in May 2017 (8 points/m², classified; class 17 = bridge deck).
NOAA's Digital Coast republishes it as Cloud-Optimized Point Cloud (COPC) tiles on a public
bucket, in NAD83(2011) / UTM zone 18N (EPSG:6347) with NAVD88 heights in meters (GEOID18).
COPC lets us read just a small box of points from a tile over HTTP, so only the corridor around
each bridge is ever downloaded.
"""

import sqlite3
import struct
from pathlib import Path

import laspy
import numpy as np

from geopace.cache import cache_dir, download
from geopace.lidar_decks import LidarTile, lidar_deck_model
from geopace.elevation import BridgeDeckModel
from geopace.provenance import Attribution, Source

BASE_URL = "https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/laz/geoid18/9306/"
INDEX_URL = BASE_URL + "tileindex_2017_nyc_topobathy_m9306.gpkg"
CRS = "EPSG:6347"

SOURCE = Source(
    id="nyc-lidar-2017",
    title="2017 NYC Topobathymetric LiDAR (City of New York), via NOAA Digital Coast",
    url="https://www.fisheries.noaa.gov/inport/item/64728",
    licence="NYC Open Data: no restrictions on use (NYC Admin. Code § 23-504); NOAA redistribution, no access constraints",
    accessed="2026-09-17",
    note="Collected May 2017, ~50% leaf-off. Class 17 (bridge deck) returns give deck heights; NAVD88 (GEOID18) meters.",
)
ATTRIBUTION = Attribution(
    text="Bridge decks: 2017 NYC Topobathymetric LiDAR (City of New York / NOAA Digital Coast)",
    url="https://www.fisheries.noaa.gov/inport/item/64728",
)


class TilesNotCached(FileNotFoundError):
    """Downloads were turned off and some needed LiDAR points aren't in the cache."""


def deck_model(allow_download: bool = True) -> BridgeDeckModel:
    folder = cache_dir() / "nyc" / "lidar"
    index = folder / "tileindex.gpkg"
    if not index.exists() and not allow_download:
        raise TilesNotCached(f"The LiDAR tile index is not cached at {index}")
    tiles = read_tile_index(download(INDEX_URL, index))

    def read_points(tile: LidarTile, min_x: float, min_y: float, max_x: float, max_y: float) -> np.ndarray:
        if not allow_download:
            raise TilesNotCached(f"LiDAR points near ({min_x:.0f}, {min_y:.0f}) in {tile.name} are not cached in {folder}")
        print(f"  LiDAR: reading bridge-deck points from {tile.name}")
        bounds = laspy.copc.Bounds(mins=np.array([min_x, min_y]), maxs=np.array([max_x, max_y]))
        with laspy.CopcReader.open(tile.url) as reader:
            points = reader.query(bounds)
        out = np.zeros(len(points), dtype=[("x", "f8"), ("y", "f8"), ("z", "f8"), ("classification", "u1")])
        out["x"], out["y"], out["z"] = points.x, points.y, points.z
        out["classification"] = points.classification
        return out

    return lidar_deck_model(tiles, read_points, folder / "decks", SOURCE, ATTRIBUTION, crs=CRS)


def read_tile_index(path: Path) -> list[LidarTile]:
    """Tiles from NOAA's GeoPackage index. Each tile's bounding box is read from the envelope
    stored in the GeoPackage geometry header, so no GIS library is needed."""
    with sqlite3.connect(path) as db:
        (table,) = db.execute("SELECT table_name FROM gpkg_contents WHERE data_type = 'features'").fetchone()
        rows = db.execute(f'SELECT geom, filename, url FROM "{table}"').fetchall()
    return [LidarTile(name, url, *_envelope(geom)) for geom, name, url in rows]


def _envelope(blob: bytes) -> tuple[float, float, float, float]:
    """(min_x, min_y, max_x, max_y) from a GeoPackage geometry blob header."""
    flags = blob[3]
    if blob[:2] != b"GP" or (flags >> 1) & 0b111 == 0:
        raise ValueError("GeoPackage geometry has no envelope")
    order = "<" if flags & 1 else ">"
    min_x, max_x, min_y, max_y = struct.unpack(order + "4d", blob[8:40])
    return min_x, min_y, max_x, max_y

"""The elevation model reads only the corridor along the course, never a whole tile.

NYC's 1-ft DEM is ~20 GB in 31 tiles; a marathon corridor is a few hundred 512 px blocks.
"""

import numpy as np
from pyproj import Transformer

from geopace.nyc_dem import BLOCK_PX, Tile, corridor_blocks

# One real-sized DEM tile: 23,346 x 25,000 one-foot cells in NAD83(2011) / NY Long Island (feet).
TILE = Tile(name="be_NYC_012", url="https://example.org/be_NYC_012.tif", west=926654.0, north=175000.0, pixel_ft=1.0, rows=25000, cols=23346)
TO_TILE = Transformer.from_crs("EPSG:4326", "EPSG:6539", always_xy=True)


def course(lat0, lon0, lat1, lon1, points=200):
    lat = np.linspace(lat0, lat1, points)
    lon = np.linspace(lon0, lon1, points)
    return TO_TILE.transform(lon, lat)


def test_only_the_blocks_under_the_course_are_read():
    # ~1 km of course inside the tile (this one covers part of Staten Island).
    x, y = course(40.600, -74.190, 40.609, -74.186)

    blocks = corridor_blocks(TILE, np.asarray(x), np.asarray(y))

    whole_tile = (TILE.rows // BLOCK_PX + 1) * (TILE.cols // BLOCK_PX + 1)
    assert 0 < len(blocks) < 20, "a kilometer of course should need a handful of blocks"
    assert len(blocks) < whole_tile / 100
    # They are the blocks the course runs through, side by side, not scattered over the tile.
    rows = {row for row, _ in blocks}
    assert max(rows) - min(rows) <= len(blocks)


def test_a_course_outside_the_tile_reads_nothing_from_it():
    x, y = course(40.780, -73.950, 40.790, -73.940)  # Manhattan: covered by other tiles

    assert corridor_blocks(TILE, np.asarray(x), np.asarray(y)) == []

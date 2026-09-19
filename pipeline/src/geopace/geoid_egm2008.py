"""How far sea level is above the ellipsoid, from the Earth Gravitational Model 2008 (EGM2008).

Surveys give heights above sea level: New York's in NAVD88, Berlin's in DHHN2016. A 3D globe
(CesiumJS) counts heights from the WGS84 ellipsoid, a smooth mathematical egg that sea level
wanders above and below by tens of meters: about 32.5 m below it in New York, about 39.5 m above
it in Berlin. A geoid model is the published table of that difference. To draw the course at the
road's own height, the pipeline adds it to every point: ellipsoid height = height above sea
level + the model's value there.

One worldwide model, not each country's own (PLAN.md D51). EGM2008 is referred to the WGS84
ellipsoid itself, which is the one the app draws on, and a course in any city can use it. Each
city's official model is referred to its own national frame instead, and needs a second step to
reach WGS84 that is easy to get silently wrong: New York's GEOID18 gives heights above the
NAD83(2011) ellipsoid, which is 1.25 m from WGS84's there, and the standard software conversion
between the two is a do-nothing placeholder. Measured on 2026-09-18 along both courses, EGM2008
comes out 0.21 m above Germany's official GCG2016 everywhere in Berlin, and about 0.37 m above
GEOID18 plus that frame step in New York (NAVD88 is known to sit about half a meter off global
models). Both are inside what the line is drawn against: Google publishes no height reference or
accuracy for its photographed city, and the app lifts the line a little above the road anyway.

The grid is the 2.5-arc-minute one (a value every ~4.6 km north-south), as a GeoTIFF from the
PROJ project's file server: 80 MB, downloaded once into the cache. Its rows run north to south,
and each value belongs to a point, not to a cell.
"""

from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

from geopace.cache import cache_dir, download
from geopace.elevation import GeoidModel
from geopace.provenance import Attribution, Source

GRID_FILE = "us_nga_egm08_25.tif"
GRID_URL = f"https://cdn.proj.org/{GRID_FILE}"

# The agency's own page for the model. The file itself comes from the PROJ project (GRID_URL).
MODEL_URL = "https://earth-info.nga.mil/index.php?dir=wgs84&action=wgs84"

SOURCE = Source(
    id="geoid-egm2008",
    title="Earth Gravitational Model 2008 (EGM2008), 2.5-minute worldwide geoid height grid (U.S. National Geospatial-Intelligence Agency)",
    url=MODEL_URL,
    licence="Public domain: a work of a U.S. federal agency, labelled so in the file and by the PROJ project that redistributes it (NGA's own page states no terms)",
    accessed="2026-09-18",
    note=f"How far sea level is above the WGS84 ellipsoid. Added to each height above sea level to get the height the 3D scene needs. Read from {GRID_URL} (a GeoTIFF the PROJ project made from the model), between the four grid points around each place. Against the cities' official models it is 0.21 m high in Berlin (GCG2016) and about 0.37 m high in New York (GEOID18 and the step from NAD83 to WGS84).",
)
ATTRIBUTION = Attribution(
    text="Height above the ellipsoid: EGM2008 geoid model (U.S. National Geospatial-Intelligence Agency)",
    url=MODEL_URL,
)


class GridNotCached(FileNotFoundError):
    """Downloads were turned off and the geoid grid isn't in the cache."""


def geoid_model(allow_download: bool = True) -> GeoidModel:
    path = cache_dir() / "geoid" / GRID_FILE
    if not path.exists():
        if not allow_download:
            raise GridNotCached(f"The EGM2008 grid is not cached at {path}")
        print(f"  geoid: {GRID_URL} (80 MB, once)")
        download(GRID_URL, path)
    return GeoidModel(offset=lambda lat, lon: offsets_from_grid(lat, lon, path), source=SOURCE, attribution=ATTRIBUTION)


def offsets_from_grid(lat, lon, path: Path) -> np.ndarray:
    """Meters that sea level is above the ellipsoid at each place (negative: below it), read
    between the four grid points around it. NaN where the grid has no value."""
    lat = np.atleast_1d(np.asarray(lat, dtype=float))
    lon = np.atleast_1d(np.asarray(lon, dtype=float))
    with rasterio.open(path) as grid:
        # The file's corner is half a step outside its first point, because each value is a point.
        step_lon, step_lat = grid.transform.a, -grid.transform.e
        col = (lon - grid.transform.c) / step_lon - 0.5
        row = (grid.transform.f - lat) / step_lat - 0.5
        inside = (col >= 0) & (row >= 0) & (col <= grid.width - 1) & (row <= grid.height - 1)
        out = np.full(lat.shape, np.nan)
        if not inside.any():
            return out
        # Only the corner of the world the places are in is read, not all 37 million values.
        first_row, first_col = int(np.floor(row[inside].min())), int(np.floor(col[inside].min()))
        last_row = min(int(np.floor(row[inside].max())) + 1, grid.height - 1)
        last_col = min(int(np.floor(col[inside].max())) + 1, grid.width - 1)
        window = Window(first_col, first_row, last_col - first_col + 1, last_row - first_row + 1)
        values = grid.read(1, window=window).astype(float)
        if grid.nodata is not None:
            values[values == grid.nodata] = np.nan

    r, c = row[inside] - first_row, col[inside] - first_col
    # The grid point to the north-west of each place. (A place exactly on the window's last row
    # or column counts as all the way across the cell before it.)
    north = np.minimum(np.floor(r).astype(int), values.shape[0] - 2)
    west = np.minimum(np.floor(c).astype(int), values.shape[1] - 2)
    south_share, east_share = r - north, c - west
    top = values[north, west] * (1 - east_share) + values[north, west + 1] * east_share
    bottom = values[north + 1, west] * (1 - east_share) + values[north + 1, west + 1] * east_share
    out[inside] = top * (1 - south_share) + bottom * south_share
    return out

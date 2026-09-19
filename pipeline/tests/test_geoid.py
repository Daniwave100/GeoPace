"""Seam: a place on Earth -> how far sea level is above the ellipsoid there (the geoid model).

The app's 3D scene counts heights from the ellipsoid; the cities' surveys count them from sea
level. Get this wrong by sign, by city, or by swapping latitude and longitude, and the course is
drawn tens of meters under the road or over it. The grid-reading is checked on a made-up grid (no
download); the real model is checked against values published independently of our code.
"""

import numpy as np
import pytest
import rasterio
from rasterio.transform import Affine

from geopace import geoid_egm2008
from geopace.cache import cache_dir

GRID = cache_dir() / "geoid" / geoid_egm2008.GRID_FILE


def plane(lat, lon):
    """A made-up geoid that tilts differently north-south and east-west, so a swap shows."""
    return 10.0 + 2.0 * (np.asarray(lat) - 50.0) - 0.5 * (np.asarray(lon) - 10.0)


def write_grid(path, *, north=54.0, west=8.0, step=0.5, rows=9, cols=13):
    """A small grid laid out the way the published one is: rows run north to south, and each
    value belongs to a point (the corner of the file is half a cell outside the first point)."""
    lats = north - step * np.arange(rows)
    lons = west + step * np.arange(cols)
    values = plane(lats[:, None], lons[None, :]).astype("float32")
    transform = Affine(step, 0.0, west - step / 2, 0.0, -step, north + step / 2)
    with rasterio.open(path, "w", driver="GTiff", height=rows, width=cols, count=1, dtype="float32", crs="EPSG:4979", transform=transform) as out:
        out.write(values, 1)
        out.update_tags(AREA_OR_POINT="Point")
    return path


def test_the_offset_at_a_place_is_read_between_the_four_grid_points_around_it(tmp_path):
    grid = write_grid(tmp_path / "grid.tif")
    lat = np.array([52.0, 52.26, 50.9, 53.99])
    lon = np.array([10.0, 13.37, 8.01, 13.9])

    offsets = geoid_egm2008.offsets_from_grid(lat, lon, grid)

    # A plane is reproduced exactly by reading between grid points, wherever the place is.
    assert offsets == pytest.approx(plane(lat, lon), abs=1e-4)


def test_a_place_the_grid_does_not_cover_has_no_offset(tmp_path):
    grid = write_grid(tmp_path / "grid.tif")

    offsets = geoid_egm2008.offsets_from_grid(np.array([52.0, 60.0]), np.array([10.0, 10.0]), grid)

    assert np.isfinite(offsets[0]) and np.isnan(offsets[1])


# Worked out by other software than ours: GeographicLib's GeoidEval, which evaluates the same NGA
# model on its full 1-arc-minute grid (https://geographiclib.sourceforge.io/cgi-bin/GeoidEval,
# accessed 2026-09-18). We read the coarser 2.5-minute grid, which is where the tolerance comes
# from. As a check on the model itself: the U.S. survey's own GEOID18 service gives -32.12 m at
# the Verrazzano start, above a different ellipsoid that is 1.25 m from this one there, and
# NAVD88 is known to sit about half a meter off global models: -33.0 m is what that predicts.
QUEENSBORO_BRIDGE = (40.7568, -73.9545, -32.54)
VERRAZZANO_START = (40.6030, -74.0560, -33.00)
BERLIN_START = (52.5147, 13.3615, +39.56)


@pytest.mark.skipif(not GRID.exists(), reason="EGM2008 grid not cached")
def test_the_real_model_agrees_with_published_values_in_both_cities():
    model = geoid_egm2008.geoid_model(allow_download=False)
    lat, lon, published = (np.array(column) for column in zip(QUEENSBORO_BRIDGE, VERRAZZANO_START, BERLIN_START))

    offsets = model.offset(lat, lon)

    assert offsets == pytest.approx(published, abs=0.05)
    # Sea level is below the ellipsoid in New York and above it in Berlin: a swapped, missing or
    # sign-flipped offset is 70 m out, not a rounding error.
    assert offsets[0] < -30 and offsets[2] > 30
    assert model.source.url.startswith("https://") and model.source.accessed

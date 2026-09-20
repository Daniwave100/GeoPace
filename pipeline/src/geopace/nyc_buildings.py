"""New York's buildings, from the city's own Building Footprints.

The city publishes every building's outline with two heights: the ground at its foot, and how far
its roof stands above that ground. Both come from photogrammetry or LiDAR, and both are kept up
to date — which is why they are used for the buildings rather than the 2017 LiDAR the course
line's bridge decks come from: that scan predates a decade of new towers along the course
(PLAN.md §5, §8).

Unlike Berlin (berlin_buildings.py), the ground each block stands on is the city's own
`GROUND_ELEVATION` rather than our bare-earth model. It is in the same datum as the course line's
heights (NAVD88), and it is the ground the roof height was measured from, so keeping the pair
together is what makes a roof come out where the city says it is.

Heights are published in feet — US survey feet, as all of the city's planimetric data is — and are
turned into meters here, with the same foot the elevation model uses (nyc_dem.py).
"""

import json
import urllib.parse

import numpy as np

from geopace.buildings import MIN_HEIGHT_M, PAGE, Building, BuildingsModel, cached_pages
from geopace.cache import cache_dir
from geopace.nyc_dem import US_SURVEY_FOOT_M
from geopace.provenance import Attribution, Source

DATASET = "5zhs-2jue"  # "BUILDING" on NYC Open Data: the Building Footprints
RESOURCE_URL = f"https://data.cityofnewyork.us/resource/{DATASET}.json"
ABOUT_URL = "https://data.cityofnewyork.us/City-Government/Building-Footprints/5zhs-2jue"
METADATA_URL = "https://github.com/CityOfNewYork/nyc-geo-metadata/blob/master/Metadata/Metadata_BuildingFootprints.md"
# A triangle the city drops in where it has no picture or plan of a permitted building yet. It is
# not a shape anything stands in; drawn as a block it is a spike in the middle of a street.
PLACEHOLDER_FEATURE_CODE = 1003

SOURCE = Source(
    id="nyc-building-footprints",
    title="Building Footprints (BUILDING) — City of New York, Office of Technology and Innovation",
    url=ABOUT_URL,
    licence="NYC Open Data: no restrictions on use (NYC Admin. Code § 23-504)",
    accessed="2026-09-19",
    note=(
        "Outline, the ground at the building's foot (GROUND_ELEVATION, NAVD88) and the roof's height above "
        f"that ground (HEIGHT_ROOF), both in US survey feet; field definitions at {METADATA_URL}. Read only "
        "along the course corridor. The city captures buildings over 400 sq ft and 12 ft tall; a record whose "
        "roof height is zero or missing is one the city never worked out, and is not drawn, as are the "
        "placeholder triangles it uses for a building it has no picture of yet."
    ),
)
ATTRIBUTION = Attribution(
    text="Buildings: Building Footprints (City of New York, OTI)",
    url=ABOUT_URL,
)


def buildings_model(allow_download: bool = True) -> BuildingsModel:
    """New York's buildings. Unlike Berlin's, they come with the ground they stand on."""
    folder = cache_dir() / "nyc" / "buildings"

    def within(south: float, west: float, north: float, east: float) -> list[Building]:
        box = (south, west, north, east)
        pages = cached_pages(folder, box, "json", lambda offset: box_url(*box, offset), lambda page: len(json.loads(page)), allow_download)
        return parse_buildings(pages)

    return BuildingsModel(within=within, source=SOURCE, attribution=ATTRIBUTION)


def box_url(south: float, west: float, north: float, east: float, offset: int = 0) -> str:
    """One page of the buildings whose outline meets a box, as the city's query language asks it."""
    corners = [(west, south), (east, south), (east, north), (west, north), (west, south)]
    box = "POLYGON((" + ",".join(f"{lon:.6f} {lat:.6f}" for lon, lat in corners) + "))"
    query = [
        ("$select", "the_geom,doitt_id,height_roof,ground_elevation,feature_code"),
        ("$where", f"intersects(the_geom,'{box}')"),
        ("$limit", str(PAGE)),
        ("$offset", str(offset)),
        # Without an order the city may answer the pages of one box in any order, and repeat rows.
        ("$order", "doitt_id"),
    ]
    return RESOURCE_URL + "?" + urllib.parse.urlencode(query)


def parse_buildings(pages: list[str]) -> list[Building]:
    """Every part of every building in these answers, as blocks standing on their own ground."""
    blocks = []
    for page in pages:
        for record in json.loads(page):
            blocks.extend(_record_blocks(record))
    return blocks


def _record_blocks(record: dict) -> list[Building]:
    if _number(record.get("feature_code")) == PLACEHOLDER_FEATURE_CODE:
        return []
    height_ft = _number(record.get("height_roof"))
    ground_ft = _number(record.get("ground_elevation"))
    if height_ft is None or ground_ft is None:
        return []
    height_m = height_ft * US_SURVEY_FOOT_M
    if height_m < MIN_HEIGHT_M:  # zero means the city never worked this roof out
        return []
    ground_m = ground_ft * US_SURVEY_FOOT_M
    name = str(record.get("doitt_id", ""))
    blocks = []
    for part, ring in enumerate(_exterior_rings(record.get("the_geom"))):
        if len(ring) >= 3:
            blocks.append(Building(id=f"{name}.{part}", ring=ring, ground_m=ground_m, roof_m=ground_m + height_m))
    return blocks


def _exterior_rings(geometry) -> list[np.ndarray]:
    """The outside of every part of a footprint, as (lon, lat) degrees. Courtyards are left out."""
    if not isinstance(geometry, dict):
        return []
    kind = geometry.get("type")
    if kind == "Polygon":
        parts = [geometry.get("coordinates") or []]
    elif kind == "MultiPolygon":
        parts = geometry.get("coordinates") or []
    else:
        return []
    rings = []
    for part in parts:
        if not part:
            continue
        try:
            ring = np.asarray(part[0], dtype=float)  # [0] is the outside; the rest are holes
        except (TypeError, ValueError):
            continue  # a record whose outline isn't a ring of numbers: one block, not the build
        if ring.ndim != 2 or ring.shape[1] < 2:
            continue
        ring = ring[:, :2]
        # GeoJSON closes a ring by repeating its first point; the rest of the pipeline leaves it open.
        if len(ring) > 1 and np.array_equal(ring[0], ring[-1]):
            ring = ring[:-1]
        rings.append(ring)
    return rings


def _number(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

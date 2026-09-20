"""Berlin's buildings, from the city's published building heights (Umweltatlas map 06.10.1).

The city works these heights out from its own LoD2 3D building models and publishes them on the
cadastre's outlines: one record per building or building part, with the height of its ridge above
the ground under it. That is exactly what a white model is made of, and it comes as a web service
that answers a box, so only the corridor along the course is ever downloaded — where the LoD2
models themselves are city-wide CityGML tiles with roof shapes we would only flatten again.

Two things the records don't carry, and where they come from instead:
  - the ground each building stands on: the city's own bare-earth model (berlin_dgm1.py), the
    same one the course line's heights come from, so a building and the road agree;
  - a height for every building: the city says some couldn't be worked out. Those are not drawn.
"""

import xml.etree.ElementTree as ET

import numpy as np

from geopace.berlin_grid import from_utm33, to_utm33
from geopace.buildings import MIN_HEIGHT_M, PAGE, Building, BuildingsModel, cached_pages
from geopace.cache import cache_dir
from geopace.elevation import ElevationModel
from geopace.provenance import Attribution, Source

SERVICE_URL = "https://gdi.berlin.de/services/wfs/ua_gebaeudehoehen"
TYPE_NAME = "ua_gebaeudehoehen:gebaeudehoehen"
# The service's own limit per request is well above this; a page this size keeps one box to one
# request everywhere along both courses, and the loop below covers a denser city anyway.
PAGE = 5000
# A "building" this low is a porch, a bin store or a flat roof over a doorway. Drawn as a block it
# is a sliver on the ground, and the city's own records go down to a few centimeters.
MIN_HEIGHT_M = 2.0

ABOUT_URL = "https://www.berlin.de/umweltatlas/nutzung/gebaeudehoehen/"

SOURCE = Source(
    id="berlin-building-heights",
    title="Gebäudehöhen 2022 (Umweltatlas Berlin, map 06.10.1), from the city's LoD2 3D building models",
    url=ABOUT_URL,
    licence="Datenlizenz Deutschland – Zero – Version 2.0 (https://www.govdata.de/dl-de/zero-2-0)",
    accessed="2026-09-19",
    note=(
        "Ridge height (Firsthöhe) above the ground, on the building outlines of the ALKIS cadastre, "
        "worked out from Berlin's LoD2 3D building models and published for 2022. Read only along the "
        "course corridor. A block is as tall as its ridge, so under a pitched roof it stands a little "
        "proud of the eaves. Buildings the city could work out no height for are not drawn."
    ),
)
ATTRIBUTION = Attribution(
    text="Buildings: Geoportal Berlin / Gebäudehöhen (Umweltatlas) (dl-de/zero-2.0)",
    url=ABOUT_URL,
)

GML = "http://www.opengis.net/gml/3.2"
WFS = "http://www.opengis.net/wfs/2.0"
LAYER = "ua_gebaeudehoehen"


def buildings_model(elevation: ElevationModel, allow_download: bool = True) -> BuildingsModel:
    """Berlin's buildings, standing on the heights of the city's own bare-earth model."""
    folder = cache_dir() / "berlin" / "buildings"

    def within(south: float, west: float, north: float, east: float) -> list[Building]:
        box = (south, west, north, east)
        pages = cached_pages(folder, box, "xml", lambda start: box_url(*box, start), lambda page: _count(page, "numberReturned"), allow_download)
        return stand_on_the_ground(parse_buildings(pages), elevation)

    return BuildingsModel(within=within, source=SOURCE, attribution=ATTRIBUTION)


def stand_on_the_ground(blocks: list[tuple[str, np.ndarray, float]], elevation: ElevationModel) -> list[Building]:
    """Put each outline on the ground under its middle, and stand its height on top of that.

    The ground is the city's own bare-earth model, the same one the course line's heights come
    from, so a block and the road beside it agree. A block the model has no height for — outside
    its coverage, or a cell with no data — is left out rather than put at sea level.
    """
    if not blocks:
        return []
    middles = np.array([ring.mean(axis=0) for _, ring, _ in blocks])
    ground = np.asarray(elevation.sample(middles[:, 1], middles[:, 0]), dtype=float)
    return [
        Building(id=block_id, ring=ring, ground_m=float(ground_m), roof_m=float(ground_m) + height_m)
        for (block_id, ring, height_m), ground_m in zip(blocks, ground)
        if np.isfinite(ground_m)
    ]


def box_url(south: float, west: float, north: float, east: float, start: int = 0) -> str:
    """One page of the buildings in a box. The box goes in the city's own meters (EPSG:25833)."""
    (min_x, max_x), (min_y, max_y) = to_utm33([west, east], [south, north])
    query = [
        ("SERVICE", "WFS"),
        ("VERSION", "2.0.0"),
        ("REQUEST", "GetFeature"),
        ("TYPENAMES", TYPE_NAME),
        ("COUNT", str(PAGE)),
        ("STARTINDEX", str(start)),
        ("SRSNAME", "urn:ogc:def:crs:EPSG::25833"),
        ("BBOX", f"{min_x:.1f},{min_y:.1f},{max_x:.1f},{max_y:.1f},urn:ogc:def:crs:EPSG::25833"),
    ]
    return SERVICE_URL + "?" + "&".join(f"{key}={value}" for key, value in query)


def _count(text: str, attribute: str) -> int:
    root = ET.fromstring(text)
    return int(root.get(attribute, "0"))


def parse_buildings(pages: list[str]) -> list[tuple[str, np.ndarray, float]]:
    """(id, outline in lon/lat, height above the ground) for every part of every building.

    The city records a building and each of its parts separately, each with its own height, so a
    tower on a podium comes out as two blocks rather than one. Courtyards (interior rings) are
    left out: a white model's blocks are solid.
    """
    blocks = []
    for page in pages:
        for member in ET.fromstring(page).findall(f"{{{WFS}}}member"):
            for feature in member:
                blocks.extend(_feature_blocks(feature))
    return blocks


def _feature_blocks(feature: ET.Element) -> list[tuple[str, np.ndarray, float]]:
    height = feature.findtext(f"{{{LAYER}}}hoehe")
    if height is None or height.strip() == "":
        return []  # the city says it couldn't work this one out
    height_m = float(height)
    if height_m < MIN_HEIGHT_M:
        return []
    name = feature.get(f"{{{GML}}}id") or feature.findtext(f"{{{LAYER}}}gml_id") or ""
    blocks = []
    for part, polygon in enumerate(feature.iter(f"{{{GML}}}Polygon")):
        positions = polygon.find(f"{{{GML}}}exterior/{{{GML}}}LinearRing/{{{GML}}}posList")
        if positions is None or positions.text is None:
            continue
        ring = ring_from_pos_list(positions.text)
        if len(ring) >= 3:
            blocks.append((f"{name}.{part}", ring, height_m))
    return blocks


def ring_from_pos_list(text: str) -> np.ndarray:
    """"easting northing easting northing …" in EPSG:25833 -> an open ring of (lon, lat) degrees."""
    numbers = np.fromstring(text.strip(), sep=" ")
    easting, northing = numbers[0::2], numbers[1::2]
    # GML closes a ring by repeating its first point; the rest of the pipeline leaves it open.
    if len(easting) > 1 and easting[0] == easting[-1] and northing[0] == northing[-1]:
        easting, northing = easting[:-1], northing[:-1]
    lon, lat = from_utm33(easting, northing)
    return np.column_stack([lon, lat])

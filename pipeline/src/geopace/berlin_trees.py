"""Berlin's trees, from the city's own register of them (Baumbestand Berlin).

Berlin keeps a record of every street tree and of the trees in its public green spaces, each with
its species, its height and how wide its crown is. That is a tree register, not a survey of the
canopy, and it is far the better thing to work shade out from: a record says *tree*, where a
height model only says *something stands here* and would put a crown on every bridge deck, shed
and scaffold in the city.

Two things the register doesn't carry, and where they come from instead:
  - the ground each tree stands on: the city's own bare-earth model (berlin_dgm1.py), the same one
    the course line's heights and the buildings' come from, so a crown and the road agree;
  - a crown width for every tree. Street trees nearly always have one; the trees in the parks
    often don't. Where it is missing the crown is `CROWN_SHARE_OF_HEIGHT` of the tree's height —
    ⚠️ filled in, not measured, and the register's own median (see the constant).

⚠️ **The register is not every tree.** The service says so itself: "Die Daten umfassen
Straßenbäume und einen Teil der Bäume in Grünanlagen" — street trees, and *part* of the trees in
green spaces. So a wood the city doesn't tend is not here, and the layer under-claims shade rather
than inventing it. The bundle's source note says this where the numbers are.
"""

import xml.etree.ElementTree as ET

import numpy as np

from geopace.berlin_grid import from_utm33, to_utm33
from geopace.buildings import PAGE, cached_pages
from geopace.cache import cache_dir
from geopace.elevation import ElevationModel
from geopace.provenance import Attribution, Source
from geopace.trees import MIN_CROWN_M, MIN_RADIUS_M, Crown, TreesModel, crown_over, disc_ring

SERVICE_URL = "https://gdi.berlin.de/services/wfs/baumbestand"
# The register comes in two layers: the trees along the streets, and the trees in the parks.
TYPE_NAMES = ("baumbestand:strassenbaeume", "baumbestand:anlagenbaeume")
ABOUT_URL = "https://daten.berlin.de/datensaetze/baumbestand-berlin"

LAYER = "baumbestand"  # the XML namespace the service puts its own fields in
GML = "http://www.opengis.net/gml/3.2"
WFS = "http://www.opengis.net/wfs/2.0"

# How wide a crown is taken to be where the register doesn't say, as a share of the tree's height.
# ⚠️ Filled in, not measured — but it is the register's own number: the median of crown width over
# height across 22,667 Berlin trees that carry both (12,971 street trees at 0.67, 9,696 park trees
# at 0.56, measured 2026-09-21 over five 2 km squares of the city).
CROWN_SHARE_OF_HEIGHT = 0.6
SOURCE = Source(
    id="berlin-tree-register",
    title="Baumbestand Berlin: the city's register of its street trees and park trees (Geoportal Berlin)",
    url=ABOUT_URL,
    licence="Datenlizenz Deutschland – Zero – Version 2.0 (https://www.govdata.de/dl-de/zero-2-0)",
    accessed="2026-09-21",
    note=(
        "One record per tree, with its species, its height (baumhoehe) and the width of its crown "
        "(kronedurch), read along the course corridor as WFS. The register covers the street trees "
        "and part of the trees in public green spaces, so a wood the city does not tend is not in it. "
        "Each crown stands on the city's own bare-earth model; where the register gives no crown "
        f"width it is taken as {CROWN_SHARE_OF_HEIGHT} of the tree's height, the register's own median, "
        "and where a crown starts is worked out, never measured (PLAN.md D60)."
    ),
)
ATTRIBUTION = Attribution(
    text="Trees: Geoportal Berlin / Baumbestand (dl-de/zero-2.0)",
    url=ABOUT_URL,
)
# What the survey caught the trees wearing. A register is not a flight: a tree is measured once and
# kept up to date, so there is no leaf-off scan behind these numbers at all.
LEAVES_WHEN_SURVEYED = "measured tree by tree and kept up to date, not from a flight, so the leaves were on whenever each tree was last seen"


def trees_model(elevation: ElevationModel, allow_download: bool = True) -> TreesModel:
    """Berlin's trees, standing on the heights of the city's own bare-earth model."""
    folder = cache_dir() / "berlin" / "trees"

    def within(south: float, west: float, north: float, east: float) -> list[Crown]:
        box = (south, west, north, east)
        trees: list[tuple[str, float, float, float, float]] = []
        for type_name in TYPE_NAMES:
            pages = cached_pages(
                folder / type_name.split(":")[-1],
                box,
                "xml",
                lambda start, type_name=type_name: box_url(*box, type_name, start),
                lambda page: _count(page, "numberReturned"),
                allow_download,
            )
            trees.extend(parse_trees(pages))
        return stand_on_the_ground(trees, elevation)

    return TreesModel(within=within, source=SOURCE, attribution=ATTRIBUTION, leaves_when_surveyed=LEAVES_WHEN_SURVEYED)


def stand_on_the_ground(trees: list[tuple[str, float, float, float, float]], elevation: ElevationModel) -> list[Crown]:
    """Put each tree on the ground it stands on, and its crown on top of that.

    A tree the ground model has no height for — outside its coverage, a cell with no data — is left
    out rather than put at sea level, exactly as a building is (berlin_buildings.py).
    """
    if not trees:
        return []
    ground = np.asarray(elevation.sample([tree[2] for tree in trees], [tree[1] for tree in trees]), dtype=float)
    crowns = []
    for (tree_id, lon, lat, height_m, crown_width_m), ground_m in zip(trees, ground):
        if not np.isfinite(ground_m):
            continue
        width_m = crown_width_m if crown_width_m > 0 else CROWN_SHARE_OF_HEIGHT * height_m
        underside_m, top_m = crown_over(float(ground_m), height_m, width_m)
        crowns.append(Crown(id=tree_id, ring=disc_ring(lon, lat, max(width_m / 2, MIN_RADIUS_M)), underside_m=underside_m, top_m=top_m))
    return crowns


def box_url(south: float, west: float, north: float, east: float, type_name: str, start: int = 0) -> str:
    """One page of one of the register's layers in a box, in the city's own metres (EPSG:25833)."""
    (min_x, max_x), (min_y, max_y) = to_utm33([west, east], [south, north])
    query = [
        ("SERVICE", "WFS"),
        ("VERSION", "2.0.0"),
        ("REQUEST", "GetFeature"),
        ("TYPENAMES", type_name),
        ("COUNT", str(PAGE)),
        ("STARTINDEX", str(start)),
        ("SRSNAME", "urn:ogc:def:crs:EPSG::25833"),
        ("BBOX", f"{min_x:.1f},{min_y:.1f},{max_x:.1f},{max_y:.1f},urn:ogc:def:crs:EPSG::25833"),
    ]
    return SERVICE_URL + "?" + "&".join(f"{key}={value}" for key, value in query)


def _count(text: str, attribute: str) -> int:
    """How many trees a page holds, as the service itself says.

    A WFS answers a query it doesn't like with HTTP 200 and an exception document, which carries no
    count at all. Read as zero that is "there are no trees here", which the build would believe,
    cache for good, and draw a treeless city from. So a page without a count is an error.
    """
    counted = ET.fromstring(text).get(attribute)
    if counted is None:
        raise ValueError(f"Berlin's tree register answered without a {attribute}. It says: {' '.join(text.split())[:300]}")
    return int(counted)


def parse_trees(pages: list[str]) -> list[tuple[str, float, float, float, float]]:
    """(id, lon, lat, height, crown width) for every tree tall enough to shade anything.

    A tree the register has no height for is left out, the way a building the city could work no
    height out for is: there is nothing to draw and nothing to trace a ray past.
    """
    trees = []
    for page in pages:
        for member in ET.fromstring(page).findall(f"{{{WFS}}}member"):
            for feature in member:
                tree = _feature_tree(feature)
                if tree is not None:
                    trees.append(tree)
    return trees


def _feature_tree(feature: ET.Element) -> tuple[str, float, float, float, float] | None:
    height_m = _number(feature, "baumhoehe")
    if height_m is None or height_m < MIN_CROWN_M:
        return None
    position = feature.find(f"{{{LAYER}}}geom/{{{GML}}}Point/{{{GML}}}pos")
    if position is None or position.text is None:
        return None
    easting, northing = (float(value) for value in position.text.split()[:2])
    lon, lat = from_utm33(easting, northing)
    # Its own place, where the register gives no identifier: crowns are kept in a dictionary keyed
    # on this, so an empty name would quietly collapse every unnamed tree into one and the build
    # would report the smaller count as a fact.
    name = feature.get(f"{{{GML}}}id") or feature.findtext(f"{{{LAYER}}}gisid") or f"{lon:.6f},{lat:.6f}"
    return name, float(lon), float(lat), height_m, _number(feature, "kronedurch") or 0.0


def _number(feature: ET.Element, field: str) -> float | None:
    """One of the register's numbers, or None where it is empty: the city never measured it."""
    text = feature.findtext(f"{{{LAYER}}}{field}")
    if text is None or text.strip() == "":
        return None
    return float(text)

"""The trees along the course: the crowns that put a runner in leafy shade.

A tree here is a **crown**: one outline, with the top of the leaves over it and the underside of
them below. That is all the shade arithmetic needs, and it is the one thing both cities can say,
from data that could hardly be less alike — Berlin keeps a register of every street and park tree,
with its height and the width of its crown; New York has no heights at all in its tree register,
so its crowns come from the city's own land cover and the 2017 LiDAR that made it (berlin_trees.py,
nyc_trees.py). Each city's reader turns its own into this same plain thing, the way buildings.py
already does for the two cities' buildings.

**A crown is not a block.** A building blocks the sun from the ground up; a tree does not, and at
the low sun both races are run under that is the difference between a fact and a wrong answer: at
10 degrees a ray passes under a crown 3 m off the ground for the first 17 m of trees. So a crown
carries an underside as well as a top, and the ray has to be below the top where it goes in *and*
above the underside where it comes out (shade.py).

⚠️ **The underside is worked out, not measured.** No survey publishes where a crown starts. It is
one stated rule — the crown is as deep as it is wide, never less than a third of the tree and never
more than four fifths of it — written here once, said in the bundle's source note, and named in
PLAN.md D60. Everything else about a crown is the city's own number.

What this does not model: a leaf lets some light through and a wall does not, so "leafy shade" says
*that* a tree is between the runner and the sun and never how dark it will be — it is the poster's
halftone, never the solid teal of a building's shade (PLAN.md D28, D47). And every crown is as its
own city last recorded it: Berlin tree by tree in a register it keeps up to date, New York from a
scan flown in May 2017 with about half of it still leaf-off. Each model says which, in its
`leaves_when_surveyed`, and each course says what race day brings, in `course.yaml` (PLAN.md D60).
"""

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from geopace.buildings import DEFAULT_CHUNK_M, DEFAULT_CORRIDOR_M, corridor_boxes, distance_to_the_road, meters_per_degree
from geopace.provenance import Attribution, Source

# A crown lower than this shades nothing a runner would notice: a clipped hedge, a young whip in a
# tree pit. The same floor New York's own land cover uses for "tree canopy" (8 feet).
MIN_CROWN_M = 2.44
# A crown narrower than this is a sapling, or a single raster cell that survived the sieve.
MIN_RADIUS_M = 1.5
# How deep a crown is, as a share of the tree's height above the ground: never less than this and
# never more than the second. Between them it is as deep as the crown is wide, where the city says
# how wide that is. ⚠️ Worked out, not measured — the one invented number here (PLAN.md D60).
CROWN_DEPTH_SHARE = (1 / 3, 0.8)
# How many points a disc crown is drawn with. Eight reads as round at the size a tree is ever seen
# and is a third of the file a finer circle would be.
DISC_POINTS = 8


@dataclass(frozen=True)
class Crown:
    """One tree's leaves, or one patch of them: an outline with a top and an underside.

    Both heights are metres above sea level, in the same datum as the course line's `elevation_m`
    and as a building's `roof_m`, so the sun can be traced past a wall and a leaf in one go.
    """

    id: str  # the city's own identifier where it has one, so a crown can be traced back
    ring: np.ndarray  # (n, 2), columns lon and lat in degrees; the outline, not closed
    underside_m: float  # where the leaves start
    top_m: float  # where they end

    @property
    def depth_m(self) -> float:
        return self.top_m - self.underside_m


@dataclass(frozen=True)
class TreesModel:
    """One city's trees, as the pipeline reads them."""

    # (south, west, north, east) degrees -> every crown whose outline meets that box.
    within: Callable[[float, float, float, float], list[Crown]]
    source: Source
    attribution: Attribution
    # What the survey caught, in the runner's words: "flown with the leaves off, late February
    # 2021". Never the state on race day, which is a fact about the date and lives in course.yaml.
    leaves_when_surveyed: str


def crown_over(ground_m: float, height_m: float, crown_width_m: float | None = None) -> tuple[float, float]:
    """(underside, top) above sea level for a tree of this height standing on this ground.

    The top is the city's own number. The underside is the one worked-out value in this module:
    the crown is as deep as it is wide where the city says how wide, held between a third and four
    fifths of the tree's height so a narrow-crowned old tree doesn't come out as a lollipop and a
    young one doesn't come out as a solid block.
    """
    least, most = (share * height_m for share in CROWN_DEPTH_SHARE)
    wide = float(crown_width_m) if crown_width_m else most
    depth_m = min(max(wide, least), most)
    top_m = ground_m + height_m
    return top_m - depth_m, top_m


def disc_ring(lon: float, lat: float, radius_m: float, points: int = DISC_POINTS) -> np.ndarray:
    """A crown seen from above: a ring of `points` around (lon, lat), `radius_m` across."""
    per_lat, per_lon = meters_per_degree(lat)
    angles = np.arange(points) * (2 * np.pi / points)
    return np.column_stack([lon + radius_m * np.sin(angles) / per_lon, lat + radius_m * np.cos(angles) / per_lat])


def crowns_along(lat, lon, elevation_m, model: TreesModel, *, corridor_m: float = DEFAULT_CORRIDOR_M, reach_per_meter: float, chunk_m: float = DEFAULT_CHUNK_M) -> list[Crown]:
    """Every crown that can put this course in shade: near enough, and tall enough for its distance.

    One set, not two. Buildings are found twice — a narrow set that is drawn and a wide set that
    only shades (PLAN.md D58) — because a tower reaches the course from two kilometres away. A
    tree never does: at the 10-degree floor a crown reaches 5.7 times its height over the road, so
    a street tree 8 m up reaches 45 m and one of the Tiergarten's 25 m oaks reaches 143 m. Keeping
    exactly the trees that can reach the road, out to the buildings' own corridor, is both the set
    that shades and the set worth drawing — so the shadows on screen and the numbers on the strip
    cannot drift apart, and the file has no tree in it that could never shade anybody.
    """
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    road_m = np.asarray(elevation_m, dtype=float)
    kept: dict[str, Crown] = {}
    for box, chunk in corridor_boxes(lat, lon, corridor_m, chunk_m):
        road_lat, road_lon = lat[chunk], lon[chunk]
        lowest_road_m = float(road_m[chunk].min())
        for crown in model.within(*box):
            if crown.id in kept:
                continue
            away_m = distance_to_the_road(crown.ring, road_lat, road_lon)
            if away_m <= min(corridor_m, max(crown.top_m - lowest_road_m, 0.0) * reach_per_meter):
                kept[crown.id] = crown
    return list(kept.values())

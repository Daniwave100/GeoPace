"""White-model exporter: the corridor's buildings and trees as geometry the app can draw.

The White model is what GeoPace opens with when nobody has a key (PLAN.md D30): the city's real
buildings along the course as plain white blocks, with shadows cast by the sun at the moment the
runner reaches each kilometer. This module turns the buildings each city's reader found
(buildings.py) into the one file the app loads for them.

It lives beside the Course Bundle rather than inside it: a marathon's worth of building outlines
is many times everything else about a course put together, and nothing but the 3D scene ever
wants it. The bundle names it, counts it, and carries its credits, so the app knows it is there
and shows who the data belongs to whether or not the geometry has arrived.

The trees beside it are crowns, not blocks: a patch of leaves with a top and an underside, standing
off the ground (trees.py). They are here because the shade on the strip rests on them, and a shadow
on screen that no tree cast would be the one thing the keyless view must never do.

Two things happen here and nowhere else:
  - heights above sea level become heights above the WGS84 ellipsoid, with the same geoid model
    the course line uses (PLAN.md D51), so a block and the road it stands beside agree;
  - outlines lose the points that only say where a party wall is, which is most of the file's size.
"""

import json
from datetime import UTC, datetime
from pathlib import Path

import jsonschema
import numpy as np

from geopace import __version__
from geopace.buildings import DEFAULT_CORRIDOR_M, Building, BuildingsModel, buildings_along, simplify_ring
from geopace.bundle import credit
from geopace.elevation import GeoidModel
from geopace.trees import Crown, TreesModel

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schema" / "white-model.schema.json"
SCHEMA_VERSION = 2
FILE_NAME = "white-model.json"

# How far a point of an outline may sit from the wall it is on before it is dropped. A quarter of
# a meter is well inside what the outlines themselves are worth — New York states about +/- 2 feet
# for the footprints it draws from the air — and taking those points out is the single biggest
# saving in the file: a cadastre's outline carries points along a straight wall that a block on
# screen cannot show.
SIMPLIFY_M = 0.25
# Six decimal places is about 11 cm of longitude: finer than the outlines, and half the file size
# of writing every digit a float has.
DEGREE_DIGITS = 6


class WhiteModelInvalid(ValueError):
    """The White model doesn't match its schema. The message lists every problem."""


def build_white_model(bundle: dict, buildings: BuildingsModel, *, geoid: GeoidModel, corridor_m: float = DEFAULT_CORRIDOR_M, trees: TreesModel | None = None, crowns: list[Crown] | None = None) -> dict:
    """The buildings and trees along this bundle's own course line, as the app draws them.

    The course line is taken from the bundle rather than measured again, so the blocks stand
    beside exactly the road the app draws and the Ride rides. The crowns are handed in rather
    than found here: they are the same list the shade was worked out from, so a tree's shadow on
    screen and its leafy shade on the strip are the same tree (PLAN.md D60).
    """
    line = bundle["measured"]["course_line"]
    lat, lon = np.asarray(line["lat"], dtype=float), np.asarray(line["lon"], dtype=float)
    found = buildings_along(lat, lon, buildings, corridor_m=corridor_m)
    print(f"  buildings: {len(found)} within {corridor_m:.0f} m of the course")
    model = {
        "schema_version": SCHEMA_VERSION,
        "course_id": bundle["course_id"],
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "pipeline_version": __version__,
        "corridor_m": corridor_m,
        "simplified_m": SIMPLIFY_M,
        "buildings": _blocks_json(found, geoid),
        "sources": [buildings.source.to_json()],
        "attributions": [buildings.attribution.to_json()],
    }
    if trees is not None:
        model["trees"] = _crowns_json(crowns or [], geoid)
        model["sources"].append(trees.source.to_json())
        model["attributions"].append(trees.attribution.to_json())
        print(f"  trees: {len(crowns or [])} crowns drawn")
    validate_white_model(model)
    return model


def note_in_bundle(bundle: dict, model: dict, buildings: BuildingsModel, trees: TreesModel | None = None) -> None:
    """Say in the Course Bundle that these buildings and trees exist, and who they belong to.

    The credits go in the bundle as well as in the White model's own file: the app must show them
    whenever the data is on screen, and it reads the bundle first.
    """
    bundle["measured"]["white_model"] = {
        "file": FILE_NAME,
        "buildings": len(model["buildings"]["ring"]),
        "corridor_m": model["corridor_m"],
        **({"trees": len(model["trees"]["ring"])} if "trees" in model else {}),
    }
    credit(bundle, buildings.source, buildings.attribution)
    if trees is not None:
        credit(bundle, trees.source, trees.attribution)


def _blocks_json(found: list[Building], geoid: GeoidModel) -> dict:
    """Every block: its outline, the ground it stands on and its roof, above the ellipsoid."""
    if not found:
        return {"base_m": [], "roof_m": [], "ring": []}
    middles = np.array([building.ring.mean(axis=0) for building in found])
    sea_level_above_ellipsoid = np.asarray(geoid.offset(middles[:, 1], middles[:, 0]), dtype=float)
    if not np.all(np.isfinite(sea_level_above_ellipsoid)):
        bad = int(np.flatnonzero(~np.isfinite(sea_level_above_ellipsoid))[0])
        raise ValueError(f"The geoid model has no value at building {found[bad].id} ({middles[bad, 1]:.6f}, {middles[bad, 0]:.6f}). Does the model cover this city?")
    base, roof, rings = [], [], []
    for building, offset in zip(found, sea_level_above_ellipsoid):
        ring = simplify_ring(building.ring, SIMPLIFY_M)
        if len(ring) < 3:
            continue
        base.append(round(building.ground_m + float(offset), 2))
        # A city's own records can hold a roof a hair under its ground; a block is never inside out.
        roof.append(round(max(building.roof_m, building.ground_m) + float(offset), 2))
        rings.append([round(float(value), DEGREE_DIGITS) for point in ring for value in point])
    return {"base_m": base, "roof_m": roof, "ring": rings}


def _crowns_json(crowns: list[Crown], geoid: GeoidModel) -> dict:
    """Every crown: its outline, where the leaves start and where they end, above the ellipsoid.

    The same geoid step the blocks and the road get (PLAN.md D51), from the same model, so a
    crown cannot float over the street it stands on.
    """
    if not crowns:
        return {"underside_m": [], "top_m": [], "ring": []}
    middles = np.array([crown.ring.mean(axis=0) for crown in crowns])
    sea_level_above_ellipsoid = np.asarray(geoid.offset(middles[:, 1], middles[:, 0]), dtype=float)
    if not np.all(np.isfinite(sea_level_above_ellipsoid)):
        bad = int(np.flatnonzero(~np.isfinite(sea_level_above_ellipsoid))[0])
        raise ValueError(f"The geoid model has no value at crown {crowns[bad].id} ({middles[bad, 1]:.6f}, {middles[bad, 0]:.6f}). Does the model cover this city?")
    underside, top, rings = [], [], []
    for crown, offset in zip(crowns, sea_level_above_ellipsoid):
        ring = simplify_ring(crown.ring, SIMPLIFY_M)
        if len(ring) < 3:
            continue
        underside.append(round(crown.underside_m + float(offset), 2))
        top.append(round(max(crown.top_m, crown.underside_m) + float(offset), 2))
        rings.append([round(float(value), DEGREE_DIGITS) for point in ring for value in point])
    return {"underside_m": underside, "top_m": top, "ring": rings}


def load_schema() -> dict:
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def validate_white_model(model: dict) -> None:
    validator = jsonschema.Draft202012Validator(load_schema())
    problems = [f"{_path(error.absolute_path)}: {error.message}" for error in sorted(validator.iter_errors(model), key=lambda e: list(e.absolute_path))]
    if not problems:
        problems = _column_problems(model["buildings"], "buildings", "base_m", "roof_m")
        if not problems and "trees" in model:
            problems = _column_problems(model["trees"], "trees", "underside_m", "top_m")
    if problems:
        raise WhiteModelInvalid("The White model is invalid:\n  - " + "\n  - ".join(problems))


def _column_problems(blocks: dict, what: str, under: str, over: str) -> list[str]:
    lengths = {name: len(blocks[name]) for name in (under, over, "ring")}
    if len(set(lengths.values())) > 1:
        return [f"{what} columns have different lengths: {lengths}"]
    for i, (below, above) in enumerate(zip(blocks[under], blocks[over])):
        if above < below:
            return [f"{what}[{i}] has its {over} ({above} m) below its {under} ({below} m)"]
    for i, ring in enumerate(blocks["ring"]):
        if len(ring) % 2 != 0:
            return [f"{what}.ring[{i}] has {len(ring)} numbers, which is not a whole number of lon/lat pairs"]
    return []


def _path(parts) -> str:
    path = "white model"
    for part in parts:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return path


def write_white_model(model: dict, path: Path) -> None:
    validate_white_model(model)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

"""Command line: `uv run geopace build <course>` rebuilds data/derived/<course>/ from raw inputs."""

import argparse
import datetime as dt
import hashlib
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from geopace import berlin_buildings, berlin_dgm1, berlin_dom1, geoid_egm2008, nyc_buildings, nyc_dem, nyc_lidar, shade, white_model
from geopace.buildings import DEFAULT_CORRIDOR_M, BuildingsModel
from geopace.bundle import build_course_bundle, validate_bundle, write_bundle
from geopace.cache import cache_dir, download
from geopace.course_facts import CourseFacts, load_course_facts
from geopace.edition_facts import load_editions
from geopace.elevation import BridgeDeckModel, ElevationModel
from geopace.route import parse_gpx
from geopace.street_route import fetch_streets, trace_route

REPO = Path(__file__).resolve().parents[3]
COURSES = REPO / "data" / "courses"
DERIVED = REPO / "data" / "derived"


@dataclass(frozen=True)
class CourseData:
    """Which official data each course is built from."""

    elevation: Callable[..., ElevationModel]  # bare-earth ground model
    decks: Callable[..., BridgeDeckModel] | None = None  # surface data for bridge decks, if any
    # The city's buildings, for the White model (#7). None for a course with no building data.
    # Each city asks for what it needs: Berlin's blocks stand on the ground model the course line
    # uses, because no ground comes with its heights; New York's come with their own.
    buildings: Callable[[], BuildingsModel] | None = None


COURSE_DATA = {
    "berlin": CourseData(elevation=berlin_dgm1.elevation_model, decks=berlin_dom1.deck_model, buildings=lambda: berlin_buildings.buildings_model(berlin_dgm1.elevation_model())),
    "nyc": CourseData(elevation=nyc_dem.elevation_model, decks=nyc_lidar.deck_model, buildings=nyc_buildings.buildings_model),
}


def load_route(facts: CourseFacts, allow_download: bool = True) -> list[tuple[float, float]]:
    """The course as (lat, lon) vertices: the organizer's file, or waypoints traced on streets."""
    folder = cache_dir() / facts.id
    if facts.route_url:
        print(f"  route: {facts.route_url}")
        path = folder / "route.gpx"
        if not path.exists() and not allow_download:
            raise FileNotFoundError(f"The course file is not cached at {path}")
        return parse_gpx(download(facts.route_url, path).read_text(encoding="utf-8"))
    print(f"  route: {len(facts.route_waypoints)} waypoints from {facts.route_source}, traced on OpenStreetMap")
    # Name the cached streets after the waypoints, so moving a waypoint fetches a fresh corridor.
    key = hashlib.sha1(repr(facts.route_waypoints).encode()).hexdigest()[:12]
    streets = fetch_streets(facts.route_waypoints, folder / f"osm-streets-{key}.json", allow_download)
    return trace_route(streets, facts.route_waypoints)


def build(course_id: str) -> Path:
    print(f"Building the {course_id} Course Bundle")
    facts = load_course_facts(COURSES / course_id / "course.yaml")
    editions = load_editions(COURSES / course_id, facts.timezone)
    print(f"  editions: {', '.join(str(edition.edition) for edition in editions)}")
    route = load_route(facts)
    data = COURSE_DATA[course_id]
    elevation = data.elevation()
    # One worldwide geoid model for every course (PLAN.md D51).
    geoid = geoid_egm2008.geoid_model()
    bundle = build_course_bundle(
        facts,
        route,
        elevation,
        decks=data.decks() if data.decks else None,
        editions=editions,
        geoid=geoid,
    )

    out = DERIVED / course_id / "course-bundle.json"
    if data.buildings:
        # The White model is found along the bundle's own course line, so the blocks stand beside
        # exactly the road the app draws, and is written beside the bundle, which names it (#7).
        buildings = data.buildings()
        model = white_model.build_white_model(bundle, buildings, geoid=geoid)
        white_model.note_in_bundle(bundle, model, buildings)
        build_shade(bundle, buildings, editions)
        validate_bundle(bundle)
        white_out = out.parent / white_model.FILE_NAME
        white_model.write_white_model(model, white_out)
        print(f"  wrote {white_out.relative_to(REPO)} ({white_out.stat().st_size / 1024 / 1024:.1f} MB)")
    write_bundle(bundle, out)
    line = bundle["measured"]["course_line"]
    summary = bundle["measured"]["elevation_summary"]
    grades = line["grade"]
    print(f"  length {line['length_m'] / 1000:.3f} km (certified {facts.certified_distance_m / 1000:.3f} km)")
    print(f"  elevation {summary['min_m']:.1f}–{summary['max_m']:.1f} m, gain {summary['gain_m']:.0f} m, loss {summary['loss_m']:.0f} m")
    print(f"  steepest grade {max(grades):+.1%} / {min(grades):+.1%}")
    sea_level_above_ellipsoid = [
        above_ellipsoid - above_sea_level
        for above_ellipsoid, above_sea_level in zip(line["ellipsoid_height_m"], line["elevation_m"])
    ]
    print(
        f"  sea level is {min(sea_level_above_ellipsoid):+.2f} to {max(sea_level_above_ellipsoid):+.2f} m "
        "from the ellipsoid along the course (EGM2008; minus means below it)"
    )
    print(f"  wrote {out.relative_to(REPO)} ({out.stat().st_size / 1024:.0f} KB)")
    return out


def build_shade(bundle: dict, buildings: BuildingsModel, editions) -> None:
    """Which 10 m of road has the sun on it, every five minutes of race day (#9).

    The shade is worked out from a wider set of the same buildings than the White model draws —
    a tall building reaches the course from far outside the drawn corridor (PLAN.md D58) — and
    that set is never written anywhere: what the app gets is one bit per sample and step.

    The table is for the latest edition's race day. The app checks the day before it uses it.
    """
    line = bundle["measured"]["course_line"]
    lat, lon, elevation_m = line["lat"], line["lon"], line["elevation_m"]
    day = dt.date.fromisoformat(max(editions, key=lambda edition: edition.edition).date.day)
    for_shade = shade.shade_buildings(lat, lon, elevation_m, buildings)
    table = shade.shade_table(lat, lon, elevation_m, for_shade, day=day, timezone=bundle["course"]["timezone"])
    shade.note_in_bundle(bundle, table, buildings, counted=len(for_shade), corridor_m=DEFAULT_CORRIDOR_M, furthest_m=shade.FURTHEST_M)
    in_sun = table.in_sun
    print(
        f"  sun: {len(table.steps)} steps of {table.step_minutes} min on {day}, "
        f"{table.steps[0]:%H:%M} to {table.steps[-1]:%H:%M}, from {len(for_shade)} buildings"
    )
    print(f"  shade: {in_sun.mean():.0%} of the course-by-moment table is in the sun; {table.always_in_sun.sum()} samples are never shaded at any hour")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="geopace", description="GeoPace data pipeline")
    commands = parser.add_subparsers(dest="command", required=True)
    build_cmd = commands.add_parser("build", help="rebuild a course's Course Bundle from raw inputs")
    build_cmd.add_argument("course", choices=sorted(COURSE_DATA))
    args = parser.parse_args(argv)
    try:
        build(args.course)
    except ValueError as err:  # invalid facts, untraceable route, wrong route length, invalid bundle
        sys.exit(f"error: {err}")

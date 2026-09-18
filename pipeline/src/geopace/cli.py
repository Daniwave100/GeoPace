"""Command line: `uv run geopace build <course>` rebuilds data/derived/<course>/ from raw inputs."""

import argparse
import hashlib
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from geopace import berlin_dgm1, berlin_dom1, geoid_egm2008, nyc_dem, nyc_lidar
from geopace.bundle import build_course_bundle, write_bundle
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


COURSE_DATA = {
    "berlin": CourseData(elevation=berlin_dgm1.elevation_model, decks=berlin_dom1.deck_model),
    "nyc": CourseData(elevation=nyc_dem.elevation_model, decks=nyc_lidar.deck_model),
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
    bundle = build_course_bundle(
        facts,
        route,
        data.elevation(),
        decks=data.decks() if data.decks else None,
        editions=editions,
        # One worldwide geoid model for every course (PLAN.md D51).
        geoid=geoid_egm2008.geoid_model(),
    )

    out = DERIVED / course_id / "course-bundle.json"
    write_bundle(bundle, out)
    line = bundle["measured"]["course_line"]
    summary = bundle["measured"]["elevation_summary"]
    grades = line["grade"]
    print(f"  length {line['length_m'] / 1000:.3f} km (certified {facts.certified_distance_m / 1000:.3f} km)")
    print(f"  elevation {summary['min_m']:.1f}–{summary['max_m']:.1f} m, gain {summary['gain_m']:.0f} m, loss {summary['loss_m']:.0f} m")
    print(f"  steepest grade {max(grades):+.1%} / {min(grades):+.1%}")
    sea_level = [h - e for h, e in zip(line["ellipsoid_height_m"], line["elevation_m"])]
    side = "above" if min(sea_level) > 0 else "below"
    nearest, furthest = sorted([abs(min(sea_level)), abs(max(sea_level))])
    print(f"  sea level is {nearest:.2f}–{furthest:.2f} m {side} the ellipsoid along the course (EGM2008)")
    print(f"  wrote {out.relative_to(REPO)} ({out.stat().st_size / 1024:.0f} KB)")
    return out


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

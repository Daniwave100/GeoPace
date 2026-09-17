"""Command line: `uv run geopace build berlin` rebuilds data/derived/berlin/ from raw inputs."""

import argparse
import sys
from pathlib import Path

from geopace import berlin_dgm1
from geopace.bundle import build_course_bundle, write_bundle
from geopace.cache import cache_dir, download
from geopace.course_facts import load_course_facts
from geopace.route import parse_gpx

REPO = Path(__file__).resolve().parents[3]
COURSES = REPO / "data" / "courses"
DERIVED = REPO / "data" / "derived"

# Which official ground model each course uses.
ELEVATION_MODELS = {"berlin": berlin_dgm1.elevation_model}


def build(course_id: str) -> Path:
    print(f"Building the {course_id} Course Bundle")
    facts = load_course_facts(COURSES / course_id / "course.yaml")
    print(f"  route: {facts.route_url}")
    gpx = download(facts.route_url, cache_dir() / course_id / "route.gpx")
    route = parse_gpx(gpx.read_text(encoding="utf-8"))
    bundle = build_course_bundle(facts, route, ELEVATION_MODELS[course_id]())

    out = DERIVED / course_id / "course-bundle.json"
    write_bundle(bundle, out)
    line = bundle["measured"]["course_line"]
    summary = bundle["measured"]["elevation_summary"]
    grades = line["grade"]
    print(f"  length {line['length_m'] / 1000:.3f} km (certified {facts.certified_distance_m / 1000:.3f} km)")
    print(f"  elevation {summary['min_m']:.1f}–{summary['max_m']:.1f} m, gain {summary['gain_m']:.0f} m, loss {summary['loss_m']:.0f} m")
    print(f"  steepest grade {max(grades):+.1%} / {min(grades):+.1%}")
    print(f"  wrote {out.relative_to(REPO)} ({out.stat().st_size / 1024:.0f} KB)")
    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="geopace", description="GeoPace data pipeline")
    commands = parser.add_subparsers(dest="command", required=True)
    build_cmd = commands.add_parser("build", help="rebuild a course's Course Bundle from raw inputs")
    build_cmd.add_argument("course", choices=sorted(ELEVATION_MODELS))
    args = parser.parse_args(argv)
    try:
        build(args.course)
    except ValueError as err:  # invalid facts, wrong route length, invalid bundle
        sys.exit(f"error: {err}")

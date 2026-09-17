"""Hand-maintained course facts from data/courses/<id>/course.yaml.

Every fact about the world must say where it came from: a `source` URL and the date we
`accessed` it. Loading refuses a file that breaks this rule, so an unsourced fact can never
reach a Course Bundle.
"""

import datetime as dt
import re
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml


class CourseFactsInvalid(ValueError):
    """The course facts file is missing something or has a fact without a source."""


@dataclass(frozen=True)
class Waypoint:
    """A turn point of a course whose route is traced along streets, in words and coordinates."""

    lat: float
    lon: float
    label: str  # where this is, in words ("Fourth Avenue at 92nd Street")
    way: int | None = None  # put it on this OpenStreetMap way only (stacked roadways, bridge decks)


@dataclass(frozen=True)
class Landmark:
    name: str
    km: float
    source: str


@dataclass(frozen=True)
class Bridge:
    """A stretch where the course runs on a bridge deck, in km from the start."""

    name: str
    km_start: float
    km_end: float
    source: str
    # On a double-deck bridge, which deck the course uses: "upper" or "lower".
    deck: str | None = None


@dataclass(frozen=True)
class CourseFacts:
    id: str
    name: str
    city: str
    timezone: str  # IANA name, e.g. Europe/Berlin
    certified_distance_m: float
    # The route is either the organizer's course file (route_url) or turn points traced along
    # OpenStreetMap streets (route_waypoints). route_source is the page that documents it.
    route_url: str | None
    route_waypoints: list[Waypoint]
    route_source: str
    route_accessed: str
    route_edition: int
    start_lat: float
    start_lon: float
    landmarks: list[Landmark]
    bridges: list[Bridge]


def load_course_facts(path: Path) -> CourseFacts:
    with open(path, encoding="utf-8") as f:
        return parse_course_facts(yaml.safe_load(f))


def parse_course_facts(raw: dict) -> CourseFacts:
    problems: list[str] = []
    _check_sourced("the course", raw, problems)
    for key in ("certified_distance", "route", "start"):
        if key not in raw:
            problems.append(f"{key} is missing")
        else:
            _check_sourced(key, raw[key], problems)
    route = raw.get("route", {})
    if ("url" in route) == ("waypoints" in route):
        problems.append("route needs either a course file `url` or `waypoints` (not both)")
    for i, waypoint in enumerate(route.get("waypoints", [])):
        if not {"at", "lat", "lon"} <= set(waypoint):
            problems.append(f"route.waypoints[{i}] needs `at` (where it is, in words), `lat` and `lon`")
    for i, landmark in enumerate(raw.get("landmarks", [])):
        _check_sourced(f"landmarks[{i}] ({landmark.get('name', '?')})", landmark, problems)
    for i, bridge in enumerate(raw.get("bridges", [])):
        label = f"bridges[{i}] ({bridge.get('name', '?')})"
        _check_sourced(label, bridge, problems)
        if not bridge.get("km_start", 0) < bridge.get("km_end", 0):
            problems.append(f"{label} km_start must be before km_end")
        if bridge.get("deck") not in (None, "upper", "lower"):
            problems.append(f"{label} deck must be upper or lower, not {bridge['deck']!r}")
    if not _is_iana_timezone(raw.get("timezone")):
        problems.append(f"timezone {raw.get('timezone')!r} is not an IANA time zone name like Europe/Berlin")
    if problems:
        raise CourseFactsInvalid("Course facts are invalid:\n  - " + "\n  - ".join(problems))

    return CourseFacts(
        id=raw["id"],
        name=raw["name"],
        city=raw["city"],
        timezone=raw["timezone"],
        certified_distance_m=float(raw["certified_distance"]["meters"]),
        route_url=route.get("url"),
        route_waypoints=[
            Waypoint(lat=float(w["lat"]), lon=float(w["lon"]), label=w["at"], way=w.get("way"))
            for w in route.get("waypoints", [])
        ],
        route_source=route["source"],
        route_accessed=str(raw["route"]["accessed"]),
        route_edition=int(raw["route"]["edition"]),
        start_lat=float(raw["start"]["lat"]),
        start_lon=float(raw["start"]["lon"]),
        landmarks=[
            Landmark(name=landmark["name"], km=float(landmark["km"]), source=landmark["source"])
            for landmark in raw.get("landmarks", [])
        ],
        bridges=[
            Bridge(
                name=bridge["name"],
                km_start=float(bridge["km_start"]),
                km_end=float(bridge["km_end"]),
                source=bridge["source"],
                deck=bridge.get("deck"),
            )
            for bridge in raw.get("bridges", [])
        ],
    )


def _check_sourced(label: str, fact: dict, problems: list[str]) -> None:
    source = fact.get("source")
    if source is None:
        problems.append(f"{label} has no source")
    elif not re.match(r"^https?://\S+$", str(source)):
        problems.append(f"{label} source {source!r} is not a URL")

    accessed = fact.get("accessed")
    if accessed is None:
        problems.append(f"{label} has no accessed date")
    elif not isinstance(accessed, dt.date):  # YAML reads 2026-09-16 as a date
        try:
            dt.date.fromisoformat(str(accessed))
        except ValueError:
            problems.append(f"{label} accessed {accessed!r} is not a YYYY-MM-DD date")


def _is_iana_timezone(name) -> bool:
    if not isinstance(name, str) or "/" not in name:
        return False
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True

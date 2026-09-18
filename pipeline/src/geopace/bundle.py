"""Bundle writer: assembles pipeline outputs into a Course Bundle and validates it.

The Course Bundle is the one contract between this pipeline and the app. Its shape is defined
by schema/course-bundle.schema.json at the repo root, which the app validates against too.
"""

import json
from datetime import UTC, datetime
from pathlib import Path

import jsonschema

from geopace import __version__, difficulty
from geopace.course_facts import CourseFacts
from geopace.course_line import CourseLine, build_course_line
from geopace.edition_facts import EditionFacts
from geopace.elevation import BridgeDeckModel, ElevationModel
from geopace.provenance import Attribution, Source

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schema" / "course-bundle.schema.json"
SCHEMA_VERSION = 2

# Certified courses are measured along the shortest legal line a runner may take. A route file
# drawn along the streets runs a little long: more than 1% off (about 420 m on a marathon) means
# the wrong file. A route traced along street centre lines runs longer still, because it takes
# every corner wide and follows the middle of wide avenues and bridge ramps, so it gets more
# room before the length means the trace is wrong.
LENGTH_TOLERANCE = 0.01
TRACED_LENGTH_TOLERANCE = 0.025


OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright"


class BundleInvalid(ValueError):
    """The bundle doesn't match the Course Bundle schema. The message lists every problem."""


class CourseLengthMismatch(ValueError):
    """The route's measured length is too far from the certified distance."""


def build_course_bundle(
    facts: CourseFacts,
    route: list[tuple[float, float]],
    elevation: ElevationModel,
    decks: BridgeDeckModel | None = None,
    *,
    editions: list[EditionFacts],
) -> dict:
    line = build_course_line(route, elevation, bridges=facts.bridges, decks=decks)
    check_length(line.length_m, facts.certified_distance_m, traced=bool(facts.route_waypoints))
    if facts.route_url:
        route_source = Source(
            id="route",
            title=f"{facts.name} {facts.route_edition} course file (GPX)",
            url=facts.route_url,
            licence="Course geometry of public roads (facts only; file not redistributed)",
            accessed=facts.route_accessed,
        )
    else:
        route_source = Source(
            id="route",
            title=f"{facts.name} {facts.route_edition} course streets from the organizer, traced on OpenStreetMap",
            url=facts.route_source,
            licence="Which streets the course uses: facts from the organizer. Street geometry: OpenStreetMap (ODbL)",
            accessed=facts.route_accessed,
        )
    bundle = {
        "schema_version": SCHEMA_VERSION,
        "course_id": facts.id,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "pipeline_version": __version__,
        "course": {
            "name": facts.name,
            "city": facts.city,
            "timezone": facts.timezone,
            "certified_distance_m": facts.certified_distance_m,
            "start": {"lat": facts.start_lat, "lon": facts.start_lon},
            "landmarks": [{"name": mark.name, "km": mark.km, "source": mark.source} for mark in facts.landmarks],
        },
        "editions": [_edition_json(edition) for edition in editions],
        "measured": {
            "course_line": _course_line_json(line),
            "elevation_summary": _elevation_summary(line),
            "difficulty_model": difficulty.model_json(),
        },
        "sources": [route_source.to_json(), elevation.source.to_json()],
        "attributions": [
            Attribution(text=f"Course route: {facts.name}", url=route_source.url).to_json(),
            elevation.attribution.to_json(),
        ],
    }
    if decks is not None:
        bundle["sources"].append(decks.source.to_json())
        bundle["attributions"].append(decks.attribution.to_json())
    osm_uses = []
    if facts.route_waypoints:
        osm_uses.append("course streets")
    if any("openstreetmap.org" in bridge.source for bridge in facts.bridges):
        osm_uses.append("bridge locations")
    if osm_uses:
        uses = " and ".join(osm_uses)
        bundle["sources"].append(
            Source(
                id="openstreetmap",
                title=f"OpenStreetMap ({uses} along the course)",
                url=OSM_COPYRIGHT,
                licence="Open Database License (ODbL) 1.0",
                accessed=facts.route_accessed,
            ).to_json()
        )
        bundle["attributions"].append(Attribution(text=f"{uses.capitalize()}: © OpenStreetMap contributors", url=OSM_COPYRIGHT).to_json())
    validate_bundle(bundle)
    return bundle


def check_length(length_m: float, certified_m: float, traced: bool = False) -> None:
    tolerance = TRACED_LENGTH_TOLERANCE if traced else LENGTH_TOLERANCE
    off = (length_m - certified_m) / certified_m
    if abs(off) > tolerance:
        what = "traced route" if traced else "route file"
        raise CourseLengthMismatch(
            f"Route is {length_m:.0f} m but the certified distance is {certified_m:.0f} m "
            f"({off:+.1%}; tolerance is ±{tolerance:.1%}). Is the {what} right?"
        )


def _edition_json(edition: EditionFacts) -> dict:
    """An edition's facts as the app reads them. Optional parts are left out rather than null."""
    date = {"day": edition.date, "source": edition.date_source, "accessed": edition.date_accessed}
    if edition.date_note:
        date["note"] = edition.date_note
    out: dict = {"edition": edition.edition, "date": date}
    if edition.carried_over:
        out["carried_over"] = {"from_edition": edition.carried_over.from_edition, "reason": edition.carried_over.reason}
    out["waves"] = []
    for wave in edition.waves:
        wave_json = {
            "id": wave.id,
            "name": wave.name,
            "start_local": wave.start_local,
            "start": wave.start,
            "carried_over": wave.carried_over,
            "source": wave.source,
            "accessed": wave.accessed,
        }
        if wave.note:
            wave_json["note"] = wave.note
        out["waves"].append(wave_json)
    return out


def _course_line_json(line: CourseLine) -> dict:
    def rounded(values, digits):
        return [round(float(v), digits) for v in values]

    bearing = rounded(line.bearing_deg, 1)
    return {
        "spacing_m": line.spacing_m,
        "length_m": round(line.length_m, 1),
        "lat": rounded(line.lat, 6),
        "lon": rounded(line.lon, 6),
        "km": rounded(line.distance_m / 1000, 4),
        "elevation_m": rounded(line.elevation_m, 2),
        "grade": rounded(line.grade, 4),
        "difficulty": [None if d is None else round(d, 3) for d in line.difficulty],
        # 359.96 rounds to 360.0, which is the same direction as 0.
        "bearing_deg": [0.0 if b >= 360 else b for b in bearing],
    }


def _elevation_summary(line: CourseLine) -> dict:
    steps = [b - a for a, b in zip(line.elevation_m[:-1], line.elevation_m[1:])]
    return {
        "gain_m": round(sum(s for s in steps if s > 0), 1),
        "loss_m": round(-sum(s for s in steps if s < 0), 1),
        "min_m": round(float(min(line.elevation_m)), 2),
        "max_m": round(float(max(line.elevation_m)), 2),
    }


def load_schema() -> dict:
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def validate_bundle(bundle: dict) -> None:
    validator = jsonschema.Draft202012Validator(load_schema())
    problems = [
        f"{_path(error.absolute_path)}: {error.message}"
        for error in sorted(validator.iter_errors(bundle), key=lambda e: list(e.absolute_path))
    ]
    if not problems:
        problems = _column_problems(bundle["measured"]["course_line"])
    if problems:
        raise BundleInvalid("Course Bundle is invalid:\n  - " + "\n  - ".join(problems))


def _column_problems(line: dict) -> list[str]:
    columns = ["lat", "lon", "km", "elevation_m", "grade", "difficulty", "bearing_deg"]
    lengths = {name: len(line[name]) for name in columns}
    if len(set(lengths.values())) > 1:
        return [f"course_line columns have different lengths: {lengths}"]
    km = line["km"]
    for i in range(1, len(km)):
        if km[i] <= km[i - 1]:
            return [f"course_line.km must increase, but km[{i}] = {km[i]} follows {km[i - 1]}"]
    return []


def _path(parts) -> str:
    path = "bundle"
    for part in parts:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return path


def write_bundle(bundle: dict, path: Path) -> None:
    validate_bundle(bundle)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

"""Hand-maintained edition facts from data/courses/<id>/editions/<year>.yaml.

An edition is one year's running of a course: its date, its waves and its aid stations. Like course facts, every
fact says where it came from, and loading refuses a file that doesn't.

Wave times are written the way the organizer prints them: a wall-clock time ("09:10") in the
course's own time zone. The pipeline also works out the exact instant each one means, because
"09:10 in New York" is a different instant depending on whether the clocks have gone back yet,
and on Sunday 2026-11-01 they have, a few hours before the start.

Three kinds of honesty are built in:
  - A wave time copied from an earlier edition, because this one's isn't published yet, is marked
    `carried_over`, and the edition says from which edition and why. The app flags it to the runner.
  - A wave whose start time nobody has published has no time at all (never a guess), and a
    `note` that tells the runner why.
  - A race date the organizer hasn't stated for this edition is marked `confirmed: false`, with a
    `note` saying how we know it.

**Aid stations are the organizer's own list, in the organizer's own numbers.** A station is at
the kilometre the road sign says — 9 km on a course certified at 42.195 — and the course line the
app measures everything else along is a little longer than that (42.285 in Berlin, 42.688 in New
York, §5). So the file holds `km_marked`, exactly what the organizer published, and the pipeline
puts it on the course line by the same scaling the landmarks use (D20): the extra length is taken
as spread evenly, which is all anyone can say without a second survey. Both numbers reach the
app, because the sign the runner passes says the first one.

What a station serves is a short list from a fixed vocabulary, so that the fueling check can
reason about it — "a gel here, and the next water is at 17.5 km" is only a sentence the app can
say if "water" is a thing it knows and not a phrase. Anything the vocabulary can't hold (a brand,
a bottle handed out by a sponsor) goes in `detail`, which is shown and never reasoned about.

These files are edited by hand, so every mistake in one ends in a message that names it, never in
a Python traceback.
"""

import datetime as dt
import re
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

from geopace.provenance import check_sourced

WALL_CLOCK = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
WAVE_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# What a station can serve. A fixed vocabulary, because the fueling check reasons about it: a gel
# needs `water` near it, and "relying on a sports drink where there is none" is only a warning the
# app can give if it knows which stations have one.
#   water         drinking water, in cups
#   sports-drink  a carbohydrate or electrolyte drink
#   gel           an energy gel handed out on the course
#   fruit         fruit, usually bananas or oranges
#   tea           tea, hot or cold
#   refill        a runner's own bottle or hydration pack can be topped up here
#   own-bottle    a runner's own container, handed in beforehand, is waiting here
SERVES = ("water", "sports-drink", "gel", "fruit", "tea", "refill", "own-bottle")


class EditionFactsInvalid(ValueError):
    """The edition facts file is missing something or has a fact without a source."""


@dataclass(frozen=True)
class RaceDate:
    day: str  # local calendar date of the race, YYYY-MM-DD
    source: str
    accessed: str
    confirmed: bool = True  # False: the organizer hasn't stated this edition's date; see the note
    note: str | None = None  # shown to the runner, e.g. how the date is known


@dataclass(frozen=True)
class CarriedOver:
    """Why some of this edition's details are an earlier edition's: this one's aren't published yet."""

    from_edition: int
    reason: str  # shown to the runner next to every carried-over detail


@dataclass(frozen=True)
class Wave:
    """A group of runners with its own start time."""

    id: str
    name: str
    # Wall clock in the course's time zone, "HH:MM". None when the organizer hasn't published this
    # wave's time: the wave is still listed, but the app can't run a race clock for it.
    start_local: str | None
    start: str | None  # the same moment as ISO-8601 with its UTC offset, "2026-11-01T09:10:00-05:00"
    source: str
    accessed: str
    carried_over: bool = False  # copied from the edition named in EditionFacts.carried_over
    note: str | None = None  # shown to the runner; required when there is no start time


@dataclass(frozen=True)
class AidStation:
    """One refreshment point on the course, as the organizer lists it."""

    # Where the organizer says it is, in km on the certified course: what the road sign says.
    # bundle.py also puts it on the course line, which is a little longer (see the module note).
    km_marked: float
    # What the organizer calls it, in their own units: "9 km", "Mile 12".
    label: str
    # From SERVES, in the order they are listed. Never empty.
    serves: tuple[str, ...]
    source: str
    accessed: str
    # Anything the vocabulary can't hold, shown and never reasoned about: a brand, a sponsor's
    # bottle, "at the last table of the water supply".
    detail: str | None = None
    carried_over: bool = False  # copied from the edition named in EditionFacts.carried_over
    note: str | None = None  # for the runner


@dataclass(frozen=True)
class EditionFacts:
    edition: int  # which edition: the calendar year it is run in
    date: RaceDate
    waves: list[Wave]
    carried_over: CarriedOver | None = None
    # The organizer's refreshment points, in course order. Empty where nobody has published this
    # edition's yet: the app then has no Aid layer at all, rather than an invented one.
    aid_stations: tuple[AidStation, ...] = ()


def load_editions(course_folder: Path, timezone: str) -> list[EditionFacts]:
    """Every edition of one course, oldest first. `timezone` is the course's IANA zone."""
    files = sorted((course_folder / "editions").glob("*.yaml"))
    if not files:
        raise EditionFactsInvalid(f"{course_folder.name} has no edition facts: add {course_folder.name}/editions/<edition>.yaml")
    editions = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            edition = parse_edition_facts(yaml.safe_load(f), timezone)
        if path.stem != str(edition.edition):
            raise EditionFactsInvalid(f"{path.name} describes edition {edition.edition}: name the file {edition.edition}.yaml")
        editions.append(edition)
    return sorted(editions, key=lambda edition: edition.edition)


def parse_edition_facts(raw: dict | None, timezone: str) -> EditionFacts:
    """Check one edition's facts. `timezone` is the course's IANA zone, which wave times are in."""
    if not isinstance(raw, dict):
        raise EditionFactsInvalid("Edition facts are invalid:\n  - the file is empty, or isn't a block of `edition`, `date` and `waves`")

    # First find every problem, so one run of the pipeline lists them all...
    problems: list[str] = []
    edition = raw.get("edition")
    if not isinstance(edition, int):
        problems.append(f"edition {edition!r} is not a number like 2026")
        edition = None
    _check_date(raw.get("date"), edition, problems)
    _check_carried_over(raw.get("carried_over"), edition, problems)
    _check_waves(raw.get("waves"), raw.get("carried_over"), problems)
    _check_aid_stations(raw.get("aid_stations"), raw.get("carried_over"), problems)
    _check_something_is_carried_over(raw, problems)
    if problems:
        raise EditionFactsInvalid("Edition facts are invalid:\n  - " + "\n  - ".join(problems))

    # ...and only then build, from a file now known to be in shape.
    date, carried_over = raw["date"], raw.get("carried_over")
    day = _as_date(date["day"])
    return EditionFacts(
        edition=edition,
        date=RaceDate(
            day=day.isoformat(),
            source=date["source"],
            accessed=str(date["accessed"]),
            confirmed=date.get("confirmed", True),
            note=_text_or_none(date.get("note")),
        ),
        waves=[
            Wave(
                id=wave["id"],
                name=str(wave["name"]),
                start_local=wave["start_local"],
                start=_instant(day, wave["start_local"], timezone) if wave["start_local"] else None,
                source=wave["source"],
                accessed=str(wave["accessed"]),
                carried_over=wave.get("carried_over", False),
                note=_text_or_none(wave.get("note")),
            )
            for wave in raw["waves"]
        ],
        carried_over=CarriedOver(from_edition=carried_over["from_edition"], reason=carried_over["reason"].strip()) if carried_over else None,
        aid_stations=tuple(
            sorted(
                (
                    AidStation(
                        km_marked=float(station["km_marked"]),
                        label=str(station["label"]).strip(),
                        serves=tuple(station["serves"]),
                        source=station["source"],
                        accessed=str(station["accessed"]),
                        detail=_text_or_none(station.get("detail")),
                        carried_over=station.get("carried_over", False),
                        note=_text_or_none(station.get("note")),
                    )
                    for station in raw.get("aid_stations", []) or []
                ),
                key=lambda station: station.km_marked,
            )
        ),
    )


def _check_date(date, edition: int | None, problems: list[str]) -> None:
    if not isinstance(date, dict):
        problems.append("date is missing: it needs `day`, `source` and `accessed`")
        return
    check_sourced("date", date, problems)
    try:
        day = _as_date(date.get("day"))
    except ValueError:
        problems.append(f"date.day {date.get('day')!r} is not a YYYY-MM-DD date")
    else:
        if edition is not None and day.year != edition:
            problems.append(f"date.day {day.isoformat()} is not in {edition}")
    confirmed = date.get("confirmed", True)
    if not isinstance(confirmed, bool):
        problems.append(f"date.confirmed must be true or false, not {confirmed!r}")
    elif not confirmed and _text_or_none(date.get("note")) is None:
        problems.append("date is not confirmed, so it needs a `note` telling the runner how we know it")


def _check_carried_over(carried_over, edition: int | None, problems: list[str]) -> None:
    if carried_over is None:
        return
    if not isinstance(carried_over, dict):
        problems.append("carried_over must be a block with `from_edition` and `reason`")
        return
    from_edition = carried_over.get("from_edition")
    is_earlier = isinstance(from_edition, int) and edition is not None and from_edition < edition
    if not is_earlier:
        problems.append(f"carried_over.from_edition must be a year before {edition}")
    reason = carried_over.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        problems.append("carried_over needs a `reason` the runner can read")


def _check_waves(waves, carried_over, problems: list[str]) -> None:
    if not isinstance(waves, list):
        problems.append("waves must be a list of waves, each starting with a dash")
        return
    if not waves:
        problems.append("waves is empty: an edition needs at least one wave")
        return
    seen_ids: set[str] = set()
    for i, wave in enumerate(waves):
        if not isinstance(wave, dict):
            problems.append(f"waves[{i}] must be a block with `id`, `name` and `start_local`")
            continue
        label = f"waves[{i}] ({wave.get('name', '?')})"
        check_sourced(label, wave, problems)
        if not wave.get("name"):
            problems.append(f"{label} has no name")

        wave_id = wave.get("id")
        if not isinstance(wave_id, str) or not WAVE_ID.match(wave_id):
            problems.append(f"{label} id {wave_id!r} must be lower-case letters, digits and dashes, like wave-1")
        elif wave_id in seen_ids:
            problems.append(f"{label} id {wave_id!r} is already used by another wave")
        else:
            seen_ids.add(wave_id)

        is_carried_over = wave.get("carried_over", False)
        if not isinstance(is_carried_over, bool):
            problems.append(f"{label} carried_over must be true or false, not {is_carried_over!r}")
        elif is_carried_over and carried_over is None:
            problems.append(f"{label} is carried over, but the edition has no `carried_over` saying from which edition and why")

        if wave.get("start_local") is None:
            if _text_or_none(wave.get("note")) is None:
                problems.append(f"{label} has no start time, so it needs a `note` telling the runner why")
            if is_carried_over is True:
                problems.append(f"{label} is carried over but has no start time: there is nothing to carry over")
        else:
            _check_wall_clock(label, wave["start_local"], problems)

    blocks = [wave for wave in waves if isinstance(wave, dict)]
    if blocks and all(wave.get("start_local") is None for wave in blocks):
        problems.append("at least one wave needs a start time, or the app has no race clock to run")



def _check_something_is_carried_over(raw: dict, problems: list[str]) -> None:
    """An edition that explains a carry-over has to have something carried over: the reason is
    shown beside every such detail, and one with nothing to sit beside is a note nobody sees."""
    if raw.get("carried_over") is None:
        return
    lists = [raw.get("waves"), raw.get("aid_stations")]
    facts = [fact for group in lists if isinstance(group, list) for fact in group if isinstance(fact, dict)]
    if not any(fact.get("carried_over") is True for fact in facts):
        problems.append("the edition has `carried_over`, but nothing is marked `carried_over: true`")


def _check_aid_stations(stations, carried_over, problems: list[str]) -> None:
    """The organizer's refreshment points. An edition may have none; what it has must be whole."""
    if stations is None:
        return
    if not isinstance(stations, list):
        problems.append("aid_stations must be a list of stations, each starting with a dash")
        return
    seen: set[float] = set()
    for i, station in enumerate(stations):
        if not isinstance(station, dict):
            problems.append(f"aid_stations[{i}] must be a block with `km_marked`, `label` and `serves`")
            continue
        label = f"aid_stations[{i}] ({station.get('label', '?')})"
        check_sourced(label, station, problems)
        if not _text_or_none(station.get("label")):
            problems.append(f"{label} has no `label`: what the organizer calls it, like \"9 km\" or \"Mile 12\"")

        km = station.get("km_marked")
        if not isinstance(km, int | float) or isinstance(km, bool) or km < 0:
            problems.append(f"{label} km_marked {km!r} is not a distance in kilometres from the start")
        elif float(km) in seen:
            problems.append(f"{label} is at km {km}, where another station already is")
        else:
            seen.add(float(km))

        serves = station.get("serves")
        if not isinstance(serves, list) or not serves:
            problems.append(f"{label} needs `serves`: what it hands out, from {', '.join(SERVES)}")
        else:
            unknown = [item for item in serves if item not in SERVES]
            if unknown:
                problems.append(f"{label} serves {', '.join(map(str, unknown))}, which is not one of {', '.join(SERVES)}")
            if len(set(serves)) != len(serves):
                problems.append(f"{label} lists something twice in `serves`")

        is_carried_over = station.get("carried_over", False)
        if not isinstance(is_carried_over, bool):
            problems.append(f"{label} carried_over must be true or false, not {is_carried_over!r}")
        elif is_carried_over and carried_over is None:
            problems.append(f"{label} is carried over, but the edition has no `carried_over` saying from which edition and why")


def _check_wall_clock(label: str, value, problems: list[str]) -> None:
    if isinstance(value, int) and not isinstance(value, bool):
        # YAML reads an unquoted 10:20 as a base-60 number (620). Say what it probably meant.
        problems.append(
            f"{label} start_local {value} is a number, not a time: YAML misreads an unquoted time of day. "
            f'Write it in quotes, like "{value // 60:02d}:{value % 60:02d}"'
        )
    elif not isinstance(value, str) or not WALL_CLOCK.match(value):
        problems.append(f'{label} start_local {value!r} is not a 24-hour time of day in quotes, like "09:10"')


def _as_date(value) -> dt.date:
    """YAML reads 2026-11-01 as a date already; a quoted one arrives as text. Raises ValueError."""
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value))


def _instant(day: dt.date, wall_clock: str, timezone: str) -> str:
    """The moment the clocks in `timezone` read `wall_clock` on `day`, with its UTC offset."""
    hour, minute = (int(part) for part in wall_clock.split(":"))
    return dt.datetime(day.year, day.month, day.day, hour, minute, tzinfo=ZoneInfo(timezone)).isoformat()


def _text_or_none(value) -> str | None:
    """Text with the space around it removed, or None if there is nothing left."""
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None

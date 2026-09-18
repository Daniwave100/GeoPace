"""Hand-maintained edition facts from data/courses/<id>/editions/<year>.yaml.

An edition is one year's running of a course: its date and its waves. Like course facts, every
fact says where it came from, and loading refuses a file that doesn't.

Wave times are written the way the organizer prints them: a wall-clock time ("09:10") in the
course's own time zone. The pipeline also works out the exact instant each one means, because
"09:10 in New York" is a different instant depending on whether the clocks have gone back yet,
and on Sunday 2026-11-01 they have, a few hours before the start.

Two kinds of honesty are built in:
  - A detail copied from an earlier edition, because this year's isn't published yet, is marked
    `carried_over`, and the edition says from which year and why. The app flags it to the runner.
  - A wave whose start time nobody has published has no time at all (never a guess), and a
    `note` that tells the runner why.
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


class EditionFactsInvalid(ValueError):
    """The edition facts file is missing something or has a fact without a source."""


@dataclass(frozen=True)
class CarriedOver:
    """Why some of this edition's details are an earlier edition's: this year's aren't published yet."""

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
class EditionFacts:
    edition: int  # the year
    date: str  # local calendar date of the race, YYYY-MM-DD
    date_source: str
    date_accessed: str
    date_note: str | None  # shown to the runner, e.g. how the date is known
    waves: list[Wave]
    carried_over: CarriedOver | None = None


def load_editions(course_folder: Path, timezone: str) -> list[EditionFacts]:
    """Every edition of one course, oldest first. `timezone` is the course's IANA zone."""
    files = sorted((course_folder / "editions").glob("*.yaml"))
    if not files:
        raise EditionFactsInvalid(f"{course_folder.name} has no edition facts: add {course_folder.name}/editions/<year>.yaml")
    editions = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            edition = parse_edition_facts(yaml.safe_load(f), timezone)
        if path.stem != str(edition.edition):
            raise EditionFactsInvalid(f"{path.name} describes edition {edition.edition}: name the file {edition.edition}.yaml")
        editions.append(edition)
    return sorted(editions, key=lambda edition: edition.edition)


def parse_edition_facts(raw: dict, timezone: str) -> EditionFacts:
    """Check one edition's facts. `timezone` is the course's IANA zone, which wave times are in."""
    problems: list[str] = []
    year = raw.get("edition")
    if not isinstance(year, int):
        problems.append(f"edition {year!r} is not a year like 2026")

    day = _check_date(raw.get("date"), year, problems)
    carried_over = raw.get("carried_over")
    if carried_over is not None:
        if not isinstance(carried_over.get("from_edition"), int) or not isinstance(year, int) or carried_over["from_edition"] >= year:
            problems.append(f"carried_over.from_edition must be a year before {year}")
        if not str(carried_over.get("reason") or "").strip():
            problems.append("carried_over needs a `reason` the runner can read")

    waves = raw.get("waves") or []
    if not waves:
        problems.append("waves is empty: an edition needs at least one wave")
    seen_ids: set[str] = set()
    for i, wave in enumerate(waves):
        label = f"waves[{i}] ({wave.get('name', '?')})"
        check_sourced(label, wave, problems)
        if not wave.get("name"):
            problems.append(f"{label} has no name")
        wave_id = wave.get("id")
        if not isinstance(wave_id, str) or not WAVE_ID.match(wave_id):
            problems.append(f"{label} id {wave_id!r} must be lower-case letters, digits and dashes, like wave-1")
        elif wave_id in seen_ids:
            problems.append(f"{label} id {wave_id!r} is already used by another wave")
        seen_ids.add(wave_id)
        if wave.get("start_local") is None:
            if not str(wave.get("note") or "").strip():
                problems.append(f"{label} has no start time, so it needs a `note` telling the runner why")
        else:
            _check_wall_clock(label, wave["start_local"], problems)
        if wave.get("carried_over") and carried_over is None:
            problems.append(f"{label} is carried over, but the edition has no `carried_over` saying from which edition and why")
    if waves and all(wave.get("start_local") is None for wave in waves):
        problems.append("at least one wave needs a start time, or the app has no race clock to run")
    if carried_over is not None and not any(wave.get("carried_over") for wave in waves):
        problems.append("the edition has `carried_over`, but no wave is marked `carried_over: true`")
    if problems:
        raise EditionFactsInvalid("Edition facts are invalid:\n  - " + "\n  - ".join(problems))

    return EditionFacts(
        edition=year,
        date=day.isoformat(),
        date_source=raw["date"]["source"],
        date_accessed=str(raw["date"]["accessed"]),
        date_note=_text_or_none(raw["date"].get("note")),
        waves=[
            Wave(
                id=wave["id"],
                name=str(wave["name"]),
                start_local=wave["start_local"],
                start=_instant(day, wave["start_local"], timezone) if wave["start_local"] else None,
                source=wave["source"],
                accessed=str(wave["accessed"]),
                carried_over=bool(wave.get("carried_over", False)),
                note=_text_or_none(wave.get("note")),
            )
            for wave in waves
        ],
        carried_over=(
            CarriedOver(from_edition=carried_over["from_edition"], reason=carried_over["reason"].strip())
            if carried_over is not None
            else None
        ),
    )


def _check_date(date: dict | None, year, problems: list[str]) -> dt.date | None:
    if not isinstance(date, dict):
        problems.append("date is missing: it needs `day`, `source` and `accessed`")
        return None
    check_sourced("date", date, problems)
    day = date.get("day")
    if not isinstance(day, dt.date):  # YAML reads 2026-11-01 as a date; a quoted one arrives as text
        try:
            day = dt.date.fromisoformat(str(day))
        except ValueError:
            problems.append(f"date.day {date.get('day')!r} is not a YYYY-MM-DD date")
            return None
    if isinstance(year, int) and day.year != year:
        problems.append(f"date.day {day.isoformat()} is not in {year}")
    return day


def _check_wall_clock(label: str, value, problems: list[str]) -> None:
    if isinstance(value, int) and not isinstance(value, bool):
        # YAML reads an unquoted 10:20 as a base-60 number (620). Say what it probably meant.
        problems.append(
            f"{label} start_local {value} is a number, not a time: YAML misreads an unquoted time of day. "
            f'Write it in quotes, like "{value // 60:02d}:{value % 60:02d}"'
        )
    elif not isinstance(value, str) or not WALL_CLOCK.match(value):
        problems.append(f'{label} start_local {value!r} is not a 24-hour time of day in quotes, like "09:10"')


def _instant(day: dt.date, wall_clock: str, timezone: str) -> str:
    """The moment the clocks in `timezone` read `wall_clock` on `day`, with its UTC offset."""
    hour, minute = (int(part) for part in wall_clock.split(":"))
    return dt.datetime(day.year, day.month, day.day, hour, minute, tzinfo=ZoneInfo(timezone)).isoformat()


def _text_or_none(value) -> str | None:
    return str(value).strip() or None if value is not None else None

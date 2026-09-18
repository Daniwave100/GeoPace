"""Where data came from: sources (datasets we used) and attributions (credits we must show)."""

import datetime as dt
import re
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Source:
    id: str
    title: str
    url: str
    licence: str
    accessed: str  # YYYY-MM-DD
    note: str | None = None

    def to_json(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass(frozen=True)
class Attribution:
    text: str
    url: str

    def to_json(self) -> dict:
        return asdict(self)


def check_sourced(label: str, fact: dict, problems: list[str]) -> None:
    """The project's rule for hand-maintained facts: a `source` URL and the date we `accessed` it."""
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

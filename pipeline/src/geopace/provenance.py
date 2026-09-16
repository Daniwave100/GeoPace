"""Where data came from: sources (datasets we used) and attributions (credits we must show)."""

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

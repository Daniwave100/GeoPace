"""Small synthetic inputs shared by the pipeline tests (no downloads)."""

import math

import numpy as np
import pytest

from geopace.edition_facts import EditionFacts, parse_edition_facts
from geopace.provenance import Attribution, Source
from geopace.elevation import BridgeDeckModel, ElevationModel

EARTH_RADIUS_M = 6_371_008.8


def straight_north_route(length_m: float, start=(52.5, 13.4), step_m: float = 250.0):
    """A straight route heading due north, as (lat, lon) vertices every step_m."""
    lat0, lon0 = start
    n = int(length_m // step_m)
    lats = [lat0 + math.degrees(i * step_m / EARTH_RADIUS_M) for i in range(n + 1)]
    return [(lat, lon0) for lat in lats]


def meters_north_of(lat, start_lat):
    return np.radians(np.asarray(lat) - start_lat) * EARTH_RADIUS_M


def synthetic_elevation(sample):
    """Wrap a (lat, lon) -> meters function as an elevation model with made-up provenance."""
    return ElevationModel(
        sample=sample,
        source=Source(
            id="synthetic-dem",
            title="Synthetic ground model",
            url="https://example.org/dem",
            licence="test data",
            accessed="2026-09-16",
        ),
        attribution=Attribution(text="Synthetic DEM", url="https://example.org/dem"),
    )


def synthetic_decks(returns):
    """Wrap a (lat, lon) -> [deck heights near each point] function as a bridge deck model."""
    return BridgeDeckModel(
        returns=returns,
        source=Source(
            id="synthetic-lidar",
            title="Synthetic bridge-deck returns",
            url="https://example.org/lidar",
            licence="test data",
            accessed="2026-09-17",
        ),
        attribution=Attribution(text="Synthetic LiDAR", url="https://example.org/lidar"),
    )


def synthetic_editions() -> list[EditionFacts]:
    """One made-up edition, for tests that need a complete bundle but aren't about editions."""
    source = {"source": "https://example.org/race-day", "accessed": "2026-09-18"}
    raw = {
        "edition": 2026,
        "date": {"day": "2026-09-27", **source},
        "waves": [{"id": "wave-1", "name": "Wave 1", "start_local": "09:00", **source}],
    }
    return [parse_edition_facts(raw, timezone="Europe/Berlin")]


@pytest.fixture
def synthetic_facts():
    source = {"source": "https://example.org/synthetic", "accessed": "2026-09-16"}
    return {
        "id": "synthetic",
        "name": "Synthetic Marathon",
        "city": "Testville",
        "timezone": "Europe/Berlin",
        **source,
        "certified_distance": {"meters": 5000, **source},
        "route": {"url": "https://example.org/synthetic.gpx", "edition": 2026, **source},
        "start": {"lat": 52.5, "lon": 13.4, **source},
        "landmarks": [{"name": "Turnaround", "km": 2.5, **source}],
    }


@pytest.fixture
def synthetic_edition():
    source = {"source": "https://example.org/race-day", "accessed": "2026-09-18"}
    return {
        "edition": 2026,
        "date": {"day": "2026-11-01", **source},
        "waves": [
            {"id": "wave-1", "name": "Wave 1", "start_local": "09:10", **source},
            {"id": "wave-2", "name": "Wave 2", "start_local": "09:45", **source},
        ],
    }

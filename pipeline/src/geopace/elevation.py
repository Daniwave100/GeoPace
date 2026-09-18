"""The interfaces every elevation source provides (Berlin DGM1, NYC DEM and LiDAR, the geoid, synthetic test data)."""

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from geopace.provenance import Attribution, Source

# (lat degrees, lon degrees) arrays -> ground elevation in meters, same shape.
SampleFn = Callable[[np.ndarray, np.ndarray], np.ndarray]

# (lat degrees, lon degrees) arrays -> for each point, the heights in meters of every
# bridge-deck return found near it (an empty array where there is no deck).
DeckReturnsFn = Callable[[np.ndarray, np.ndarray], list[np.ndarray]]


@dataclass(frozen=True)
class ElevationModel:
    """Bare-earth ground: buildings, trees and bridges removed."""

    sample: SampleFn
    source: Source
    attribution: Attribution


@dataclass(frozen=True)
class BridgeDeckModel:
    """Surface data (LiDAR) that still has the bridge decks a bare-earth model leaves out."""

    returns: DeckReturnsFn
    source: Source
    attribution: Attribution


@dataclass(frozen=True)
class GeoidModel:
    """How far sea level, where a survey's heights count from, sits above the WGS84 ellipsoid,
    where a 3D globe's heights count from. Tens of meters, and different from place to place."""

    # (lat degrees, lon degrees) arrays -> meters to add to a height above sea level to get the
    # height above the ellipsoid, same shape. Negative where sea level is below the ellipsoid.
    offset: SampleFn
    source: Source
    attribution: Attribution

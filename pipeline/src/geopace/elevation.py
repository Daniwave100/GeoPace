"""The interfaces every elevation source provides (Berlin DGM1, NYC DEM and LiDAR, synthetic test data)."""

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

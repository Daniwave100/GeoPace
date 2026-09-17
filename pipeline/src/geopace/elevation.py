"""The interface every elevation model (Berlin DGM1, NYC DEM, synthetic test terrain) provides."""

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from geopace.provenance import Attribution, Source

# (lat degrees, lon degrees) arrays -> ground elevation in meters, same shape.
SampleFn = Callable[[np.ndarray, np.ndarray], np.ndarray]


@dataclass(frozen=True)
class ElevationModel:
    sample: SampleFn
    source: Source
    attribution: Attribution

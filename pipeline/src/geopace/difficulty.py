"""Grade-based difficulty from a published model of the energy cost of running on slopes.

Minetti et al. (2002), "Energy cost of walking and running at extreme uphill and downhill
slopes", Journal of Applied Physiology 93(3):1039-1046. Their fitted polynomial gives the
energy cost of running Cr (J per kg per m) at gradient i (rise over run), measured for
i between -0.45 and +0.45. Outside that range the polynomial is not valid, so we return None.
"""

import numpy as np

NAME = "Minetti et al. 2002 energy cost of running"
SOURCE_URL = "https://doi.org/10.1152/japplphysiol.00103.2002"
DESCRIPTION = (
    "Energy cost of running at this grade divided by the cost on flat ground "
    "(1.0 = flat; 1.5 = 50% more energy per meter). Valid for grades from -45% to +45%."
)
VALID_GRADE_MIN = -0.45
VALID_GRADE_MAX = 0.45


def running_cost(i: np.ndarray) -> np.ndarray:
    """Minetti 2002 running cost in J/kg/m at gradient i."""
    return 155.4 * i**5 - 30.4 * i**4 - 43.3 * i**3 + 46.3 * i**2 + 19.5 * i + 3.6


FLAT_COST = 3.6  # running_cost(0)


def difficulty_factor(grade: np.ndarray) -> list[float | None]:
    """Cost relative to flat ground per sample, or None where the grade is outside the model."""
    grade = np.asarray(grade, dtype=float)
    factor = running_cost(grade) / FLAT_COST
    valid = (grade >= VALID_GRADE_MIN) & (grade <= VALID_GRADE_MAX)
    return [float(f) if ok else None for f, ok in zip(factor, valid)]


def model_json() -> dict:
    return {
        "name": NAME,
        "description": DESCRIPTION,
        "source": SOURCE_URL,
        "valid_grade_min": VALID_GRADE_MIN,
        "valid_grade_max": VALID_GRADE_MAX,
    }

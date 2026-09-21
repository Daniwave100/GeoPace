"""Shade along the course: for every 10 m of road and every five minutes of race day, is the sun
on it or isn't it?

The answer is binary, and that is the whole design (PLAN.md D58). Not "60% of this kilometre is
in the sun" — a share of a kilometre is an artefact of chopping the course into kilometres — but
sun, shade, sun, shade, sample by sample, at the moment the runner gets there.

The geometry is one line: a building of height h standing d away blocks the sun while the sun is
lower than atan(h / d). Everything else here is bookkeeping around it.

  - **The sun ray.** From a course sample, the sun is a direction: a bearing to walk along and a
    rise of tan(altitude) for every metre walked. A block stops it if the ray gets inside the
    block's outline while it is still under the block's roof. Since the ray only climbs, it is
    enough to ask that at the point it first crosses the outline.

  - **Which buildings are asked.** A block's reach is h / tan(sun), so with a floor of 10 degrees
    on the sun we model, 5.7 times its height: 113 m for an ordinary 20 m building, 2.7 km for
    New York's tallest. The White model draws 150 m either side of the course because that is
    what a runner sees from the road; shade is worked out from a wider set that is never drawn
    (buildings.shade_buildings).

  - **The floor.** Under 10 degrees a city street is in shadow whatever we compute, so those
    moments are left out of the table and answered "no direct sun", stated rather than worked
    out. It is also what bounds the reach above: without a floor, a building at sunrise reaches
    the horizon.

  - **The road can be above a roof.** In New York three samples on the Queensboro's lower deck
    sit over a building beside the bridge, whose outline holds the road's plan position without
    standing over the road at all (PLAN.md §10). A roof that clears the road by less than a
    lorry's headroom is that, not a runner indoors, and is ignored. A roof that really is over
    the road — Berlin's course runs through the Brandenburg Gate, 21 m up — shades it at every
    hour, which is right.

What this does not model: trees (a third state, #10), the far side of the street (the course is
one line and no road width is known), cloud (every number here assumes a clear sky), and the
height of a runner (the answer is for the road surface).
"""

import base64
import datetime as dt
import math
from dataclasses import dataclass

import numpy as np

from geopace.buildings import DEFAULT_CHUNK_M, DEFAULT_CORRIDOR_M, Building, BuildingsModel, corridor_boxes, distance_to_the_road, inside_ring, meters_per_degree
from geopace.bundle import credit
from geopace.provenance import Source
from geopace.sun import day_steps, steps_above, sun_position

# Where the sun itself comes from. Public domain (a work of the US government), and named in the
# bundle's own sources so a runner can go and read the equations.
SOLAR_SOURCE = Source(
    id="noaa-solar",
    title="NOAA Solar Calculator (US National Oceanic and Atmospheric Administration): the equations for the sun's position",
    url="https://gml.noaa.gov/grad/solcalc/calcdetails.html",
    licence="Work of the US government: public domain",
    accessed="2026-09-20",
    note="Geometric position, without the bending of light near the horizon: what casts a shadow.",
)

# The lowest sun shade is worked out for. Berlin is above it from 08:15 to 17:40 on race day and
# New York from 07:30 to 15:45 (EST — the clocks go back that morning), which brackets both
# races. Below it the answer is "no direct sun", stated rather than computed (PLAN.md D58).
SUN_FLOOR_DEG = 10.0
# How far a building of one metre reaches at that floor: 1 / tan(10 degrees) = 5.67.
REACH_PER_METER = 1 / math.tan(math.radians(SUN_FLOOR_DEG))
# Five minutes of race day is finer than the arrival time a runner can plan to.
DEFAULT_STEP_MINUTES = 5
# How far a roof has to clear the road before the road is taken to run under it. A lorry needs
# about four metres; two is a record's outline overlapping a road it doesn't stand over.
UNDER_A_ROOF_M = 4.0
# Pairs of (sample, moment) worked out in one go. Only memory: each pair costs a few numbers per
# wall of the building being asked about.
CHUNK = 2_000_000
# Where the wide set's bands are cut, beyond the corridor. Each band is one query per chunk of
# course, and the city keeps back everything too short to reach the course from the band's near
# edge: over 26 m past 150 m, 53 m past 300, 88 m past 500, 176 m past 1 km, 353 m past 2 km.
BAND_EDGES_M = (300.0, 500.0, 1000.0, 2000.0)
# The furthest anything on either course can reach: New York's tallest on the course is 472 m,
# which is 2.7 km at the floor. Past this nothing is asked for.
FURTHEST_M = 2700.0


@dataclass(frozen=True)
class ShadeTable:
    """Every course sample by every five minutes we model: is the sun on it?"""

    # The moments, in the course's own time zone, evenly spaced and all above the floor.
    steps: list[dt.datetime]
    step_minutes: int
    floor_deg: float
    # Where the sun is at each step over the reference place (the start line), for the app's words.
    reference: tuple[float, float]
    altitude_deg: np.ndarray
    azimuth_deg: np.ndarray
    # (samples, steps): True where the sun reaches that sample at that moment.
    in_sun: np.ndarray

    @property
    def always_in_sun(self) -> np.ndarray:
        """The time-independent column: never shaded at any hour we model — the bridges and the
        wide avenues (PLAN.md D58). The app works this out again from the table it is sent."""
        return self.in_sun.all(axis=1)

    def to_json(self) -> dict:
        """The table as the Course Bundle carries it: the steps, the sun, and the bits.

        One bit per sample and step, packed sample by sample so a row starts on a byte: the app
        reads sample i, step t as bit (7 - t % 8) of byte i * bytes_per_sample + t // 8.
        """
        packed = np.packbits(self.in_sun, axis=1)  # rows are padded with zeros to a whole byte
        return {
            "step_minutes": self.step_minutes,
            "first_step": self.steps[0].isoformat(),
            "steps": len(self.steps),
            "samples": int(self.in_sun.shape[0]),
            "floor_deg": self.floor_deg,
            "reference": {"lat": round(self.reference[0], 6), "lon": round(self.reference[1], 6)},
            "altitude_deg": [round(float(value), 2) for value in self.altitude_deg],
            "azimuth_deg": [round(float(value), 2) for value in self.azimuth_deg],
            "bytes_per_sample": int(packed.shape[1]),
            "in_sun": base64.b64encode(packed.tobytes()).decode("ascii"),
        }


def shade_table(
    lat,
    lon,
    elevation_m,
    buildings: list[Building],
    *,
    day: dt.date,
    timezone: str,
    step_minutes: int = DEFAULT_STEP_MINUTES,
    floor_deg: float = SUN_FLOOR_DEG,
) -> ShadeTable:
    """The whole course through race day: which samples have the sun on them, five minutes apart.

    The steps are the moments race day's sun stands at least `floor_deg` over the start line —
    all of daylight worth modelling, not just the race window, so a runner who types in their own
    start time is answered too. The sun itself is worked out at each sample's own place, which
    over 20 km of city is a fifth of a degree different from the start line's.
    """
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    reference = (float(lat[0]), float(lon[0]))  # the start line
    steps, altitude_ref, azimuth_ref = steps_above(day_steps(day, timezone, step_minutes), *reference, floor_deg=floor_deg)
    if not steps:
        raise ValueError(f"The sun never reaches {floor_deg:.0f} degrees over ({reference[0]:.4f}, {reference[1]:.4f}) on {day}: there is no shade to work out.")
    _check_evenly_spaced(steps, step_minutes)
    when = np.array([step.timestamp() for step in steps])
    altitude, azimuth = sun_position(when[None, :], lat[:, None], lon[:, None])
    return ShadeTable(
        steps=steps,
        step_minutes=step_minutes,
        floor_deg=floor_deg,
        reference=reference,
        altitude_deg=altitude_ref,
        azimuth_deg=azimuth_ref,
        in_sun=sunlit(lat, lon, elevation_m, buildings, altitude, azimuth),
    )


def sunlit(lat, lon, elevation_m, buildings: list[Building], altitude_deg, azimuth_deg) -> np.ndarray:
    """(samples, moments) — True where no building stands between that sample and the sun.

    `altitude_deg` and `azimuth_deg` are the sun at each sample and moment, the same shape as the
    answer. Heights (`elevation_m` and each building's `roof_m`) are metres above sea level in one
    datum, which is what the pipeline's two building readers already give.
    """
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    road_m = np.asarray(elevation_m, dtype=float)
    altitude = np.broadcast_to(np.asarray(altitude_deg, dtype=float), (len(lat), np.shape(altitude_deg)[-1]))
    azimuth = np.broadcast_to(np.asarray(azimuth_deg, dtype=float), altitude.shape)
    lit = np.ones(altitude.shape, dtype=bool)

    # A flat frame in metres east and north of the middle of the course: good to centimetres over
    # a city, and every distance and bearing below is a subtraction in it.
    lat0, lon0 = float(lat.mean()), float(lon.mean())
    per_lat, per_lon = meters_per_degree(lat0)
    x, y = (lon - lon0) * per_lon, (lat - lat0) * per_lat
    # How far the sun ray climbs for every metre it travels, and which way it goes.
    rise = np.tan(np.radians(altitude))
    east, north = np.sin(np.radians(azimuth)), np.cos(np.radians(azimuth))
    lowest_rise = max(float(rise.min()), 1e-6)

    for building in buildings:
        ring_x = (building.ring[:, 0] - lon0) * per_lon
        ring_y = (building.ring[:, 1] - lat0) * per_lat
        over_the_road = building.roof_m - road_m  # how far its roof stands over each sample
        # Furthest this block could reach any sample, with the lowest sun we are asked about.
        near = _within(x, y, ring_x, ring_y, over_the_road / lowest_rise)
        candidates = np.flatnonzero(near & (over_the_road > 0) & lit.any(axis=1))
        if len(candidates) == 0:
            continue
        # A sample inside the outline is under the roof, or the outline is only overlapping a road
        # it doesn't stand over (the Queensboro's lower deck).
        indoors = inside_ring(building.ring, lat[candidates], lon[candidates])
        under_the_roof = candidates[indoors & (over_the_road[candidates] >= UNDER_A_ROOF_M)]
        lit[under_the_roof] = False
        candidates = candidates[~indoors]
        if len(candidates) == 0:
            continue
        away = _distance_to_ring(x[candidates], y[candidates], ring_x, ring_y)
        reach = over_the_road[candidates, None] / rise[candidates]
        maybe = np.flatnonzero(lit[candidates] & (away[:, None] < reach))
        for piece in range(0, len(maybe), CHUNK):
            pairs = maybe[piece : piece + CHUNK]
            sample = candidates[pairs // altitude.shape[1]]
            entry = _ray_entry(x[sample], y[sample], east[candidates].ravel()[pairs], north[candidates].ravel()[pairs], ring_x, ring_y)
            blocked = entry < reach.ravel()[pairs]
            step = pairs % altitude.shape[1]
            lit[sample[blocked], step[blocked]] = False
    return lit


def _within(x: np.ndarray, y: np.ndarray, ring_x: np.ndarray, ring_y: np.ndarray, reach: np.ndarray) -> np.ndarray:
    """Which samples are close enough to the outline's box to be worth measuring properly."""
    away_x = np.maximum(np.maximum(ring_x.min() - x, x - ring_x.max()), 0)
    away_y = np.maximum(np.maximum(ring_y.min() - y, y - ring_y.max()), 0)
    return np.hypot(away_x, away_y) < reach


def _distance_to_ring(x: np.ndarray, y: np.ndarray, ring_x: np.ndarray, ring_y: np.ndarray) -> np.ndarray:
    """How far each point is from the outline itself, in metres (0 on it)."""
    closest = np.full(x.shape, np.inf)
    for i in range(len(ring_x)):
        x1, y1, x2, y2 = ring_x[i - 1], ring_y[i - 1], ring_x[i], ring_y[i]  # -1 closes the ring
        dx, dy = x2 - x1, y2 - y1
        length_squared = dx * dx + dy * dy
        along = 0.0 if length_squared == 0 else np.clip(((x - x1) * dx + (y - y1) * dy) / length_squared, 0, 1)
        closest = np.minimum(closest, np.hypot(x - (x1 + along * dx), y - (y1 + along * dy)))
    return closest


def _ray_entry(ox: np.ndarray, oy: np.ndarray, east: np.ndarray, north: np.ndarray, ring_x: np.ndarray, ring_y: np.ndarray) -> np.ndarray:
    """How far along each ray the outline is first crossed, in metres; infinity where it is missed.

    The ray leaves (ox, oy) towards the sun. A wall runs from a to b, so the crossing is where
    o + r * u meets a + s * d for some r >= 0 and s between 0 and 1: two lines, one division.
    """
    entry = np.full(ox.shape, np.inf)
    for i in range(len(ring_x)):
        ax, ay = ring_x[i - 1], ring_y[i - 1]
        dx, dy = ring_x[i] - ax, ring_y[i] - ay
        denominator = east * dy - north * dx  # zero where the ray runs along the wall
        with np.errstate(divide="ignore", invalid="ignore"):
            wx, wy = ax - ox, ay - oy
            r = (wx * dy - wy * dx) / denominator
            s = (wx * north - wy * east) / denominator
        crosses = np.isfinite(r) & (denominator != 0) & (r >= 0) & (s >= 0) & (s <= 1)
        entry = np.where(crosses, np.minimum(entry, r), entry)
    return entry


def _check_evenly_spaced(steps: list[dt.datetime], step_minutes: int) -> None:
    """The bundle carries the first step and the gap, so the app can count the rest. A clock that
    goes back inside the window would break that; at these latitudes it never does, and this says
    so out loud rather than leaving it to be noticed as a wrong shadow."""
    gap = dt.timedelta(minutes=step_minutes)
    for earlier, later in zip(steps, steps[1:]):
        if later - earlier != gap:
            raise ValueError(f"The steps we model are not {step_minutes} minutes apart: {earlier.isoformat()} to {later.isoformat()}. Do the clocks change in the middle of this day's sunlight?")


def shade_buildings(lat, lon, elevation_m, model: BuildingsModel, *, corridor_m: float = DEFAULT_CORRIDOR_M, furthest_m: float = FURTHEST_M) -> list[Building]:
    """Every building that could put the course in shade — a wider set than the White model draws.

    The corridor the blocks on screen are drawn from is sized for what a runner sees from the
    road, and it cannot see what shades them: on race morning the sun is 14.6 degrees in Berlin
    and 16.5 in New York, where the tallest block on each course throws a shadow 461 m and
    1,595 m long. So: keep every building within the corridor, and beyond it keep one only if it
    is tall enough to reach the course from there — at the 10-degree floor, one metre of height
    for every 5.7 m of distance (PLAN.md D58).

    This set is never drawn and never shipped. It costs build time and cache, and what reaches
    the app is the same table of bits whatever the corridor.
    """
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    road_m = np.asarray(elevation_m, dtype=float)
    kept: dict[str, Building] = {}
    for inner, outer in _bands(corridor_m, furthest_m):
        least_height_m = inner / REACH_PER_METER if inner > 0 else 0.0
        found = 0
        # A wide band's boxes are mostly padding, so they are asked about in longer chunks of
        # course: the same city comes back either way, in a few requests instead of dozens.
        for box, chunk in corridor_boxes(lat, lon, corridor_m=outer, chunk_m=max(DEFAULT_CHUNK_M, 4 * outer)):
            road_lat, road_lon = lat[chunk], lon[chunk]
            lowest_road_m = float(road_m[chunk].min())
            for building in model.within(*box, least_height_m):
                if building.id in kept:
                    continue
                away_m = distance_to_the_road(building.ring, road_lat, road_lon)
                if away_m <= max(corridor_m, (building.roof_m - lowest_road_m) * REACH_PER_METER):
                    kept[building.id] = building
                    found += 1
        print(f"  shade: {found} buildings {inner:.0f}-{outer:.0f} m from the course" + (f", over {least_height_m:.0f} m tall" if least_height_m else ""))
    return list(kept.values())


def _bands(corridor_m: float, furthest_m: float) -> list[tuple[float, float]]:
    """The corridor, and then the bands out to the furthest anything can reach."""
    edges = [0.0, corridor_m] + [edge for edge in BAND_EDGES_M if corridor_m < edge < furthest_m] + [furthest_m]
    return list(zip(edges, edges[1:]))


def note_in_bundle(bundle: dict, table: ShadeTable, buildings: BuildingsModel, *, counted: int, corridor_m: float, furthest_m: float) -> None:
    """Put the table in the Course Bundle, and name what it was worked out from.

    The buildings are credited whether or not the White model drew them: the answer on screen
    rests on them either way, and the wider set is the same city's data.
    """
    sun = table.to_json()
    sun["buildings"] = {
        "counted": counted,
        "within_m": corridor_m,
        "furthest_m": furthest_m,
        "reach_per_meter": round(REACH_PER_METER, 2),
    }
    bundle["measured"]["sun"] = sun
    credit(bundle, buildings.source, buildings.attribution)
    credit(bundle, SOLAR_SOURCE)

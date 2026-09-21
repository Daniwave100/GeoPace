"""Where the sun is, for a place and an instant, and which moments of a race day we model.

This is the NOAA Solar Calculator's algorithm, the same equations the US National Oceanic and
Atmospheric Administration publishes as a spreadsheet:
https://gml.noaa.gov/grad/solcalc/calcdetails.html — well under a tenth of a degree for the years
GeoPace cares about, and short enough to read. The app carries the same equations in TypeScript
(app/src/core/solar.ts) for the 3D scene's own sun, so a test on each side keeps the shade this
module works out and the shadows on screen from drifting apart.

Angles follow the project's convention: degrees, and a bearing is clockwise from true north, so
the sun's azimuth can be compared with the course line's own heading.

Altitude is *geometric* — no atmospheric refraction. That is what casts a shadow, and shadows are
what this is for; a refracted "apparent" sun would put them a little wrong near the horizon.

Time is the trap, not the astronomy. Every moment here is an aware datetime in the course's own
IANA zone, and a race day is counted from local midnight to local midnight: **US daylight saving
ends on Sunday 1 November 2026**, very likely New York's race day, so that day is 25 hours long
and 09:10 on the start line is 14:10 UTC.
"""

import datetime as dt
from zoneinfo import ZoneInfo

import numpy as np

SECONDS_PER_DAY = 86_400
UNIX_EPOCH_AS_JULIAN_DAY = 2_440_587.5
J2000 = 2_451_545
DAYS_PER_JULIAN_CENTURY = 36_525


def sun_position(unix_seconds, lat, lon) -> tuple[np.ndarray, np.ndarray]:
    """(altitude, azimuth) in degrees, for every combination the arguments broadcast to.

    The shade builder asks this for a whole course of samples across a morning of steps at once:
    `sun_position(when[None, :], lat[:, None], lon[:, None])` gives a sample-by-step answer.
    """
    when = np.asarray(unix_seconds, dtype=float)
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    century = _julian_century(when)
    declination = np.radians(_declination_deg(century))
    hour_angle_deg = _hour_angle_deg(when, century, lon)
    hour_angle = np.radians(hour_angle_deg)
    phi = np.radians(lat)

    cos_zenith = np.sin(phi) * np.sin(declination) + np.cos(phi) * np.cos(declination) * np.cos(hour_angle)
    zenith = np.arccos(np.clip(cos_zenith, -1, 1))
    return 90 - np.degrees(zenith), _azimuth_deg(phi, declination, zenith, hour_angle_deg)


def day_steps(day: dt.date, timezone: str, step_minutes: int) -> list[dt.datetime]:
    """Every step of one local day, from local midnight to the next, as aware datetimes.

    A day is not always 24 hours: on the morning the clocks go back it is 25, and both passes of
    the repeated hour are here, each with its own UTC offset.
    """
    zone = ZoneInfo(timezone)
    start = dt.datetime(day.year, day.month, day.day, tzinfo=zone)
    end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), tzinfo=zone)
    step = dt.timedelta(minutes=step_minutes)
    # In UTC: subtracting two datetimes that share a zone object subtracts the wall clocks, which
    # is a day short of an hour on the morning the clocks go back.
    count = round((end.astimezone(dt.UTC) - start.astimezone(dt.UTC)) / step)
    # Counted from the start in UTC and put back into the zone, so a repeated or skipped hour
    # comes out as the clocks really read it rather than as two identical local times.
    return [(start.astimezone(dt.UTC) + i * step).astimezone(zone) for i in range(count)]


def steps_above(steps: list[dt.datetime], lat: float, lon: float, floor_deg: float) -> tuple[list[dt.datetime], np.ndarray, np.ndarray]:
    """The steps whose sun stands at least `floor_deg` over this place, with where the sun is.

    Below the floor a city street is in shadow whatever we compute, so those moments are answered
    with "no direct sun", stated rather than worked out (PLAN.md D58), and never reach the table.
    """
    altitude, azimuth = sun_position(np.array([step.timestamp() for step in steps]), lat, lon)
    high = np.flatnonzero(altitude >= floor_deg)
    return [steps[i] for i in high], altitude[high], azimuth[high]


def _hour_angle_deg(when: np.ndarray, century: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """How far the sun is from due south, in degrees of the Earth's own turning: negative before
    solar noon, positive after, 15 degrees an hour. Where the clock, the calendar and the
    longitude meet."""
    minutes_utc = (when % SECONDS_PER_DAY) / 60
    # Sundials and clocks disagree by up to ~16 minutes over the year (the equation of time), and
    # every degree of longitude east moves solar noon four minutes earlier.
    solar_minutes = (minutes_utc + _equation_of_time_minutes(century) + 4 * lon) % 1440
    return solar_minutes / 4 - 180


def _declination_deg(century: np.ndarray) -> np.ndarray:
    """The sun's angle north (+) or south (-) of the equator: 0 at the equinoxes, +/-23.44 at the solstices."""
    obliquity = np.radians(_obliquity_deg(century))
    return np.degrees(np.arcsin(np.sin(obliquity) * np.sin(np.radians(_apparent_longitude_deg(century)))))


def _equation_of_time_minutes(century: np.ndarray) -> np.ndarray:
    """Clock time minus sundial time, in minutes."""
    mean_long = np.radians(_mean_longitude_deg(century))
    mean_anomaly = np.radians(_mean_anomaly_deg(century))
    eccentricity = _eccentricity(century)
    y = np.tan(np.radians(_obliquity_deg(century)) / 2) ** 2
    return 4 * np.degrees(
        y * np.sin(2 * mean_long)
        - 2 * eccentricity * np.sin(mean_anomaly)
        + 4 * eccentricity * y * np.sin(mean_anomaly) * np.cos(2 * mean_long)
        - 0.5 * y * y * np.sin(4 * mean_long)
        - 1.25 * eccentricity * eccentricity * np.sin(2 * mean_anomaly)
    )


def _azimuth_deg(phi: np.ndarray, declination: np.ndarray, zenith: np.ndarray, hour_angle_deg: np.ndarray) -> np.ndarray:
    sin_zenith = np.sin(zenith)
    with np.errstate(divide="ignore", invalid="ignore"):
        cos_from_south = np.clip((np.sin(phi) * np.cos(zenith) - np.sin(declination)) / (np.cos(phi) * sin_zenith), -1, 1)
    from_south = np.degrees(np.arccos(cos_from_south))
    # Morning (a negative hour angle) puts the sun east of south, afternoon west of south.
    azimuth = np.where(hour_angle_deg > 0, (from_south + 180) % 360, (540 - from_south) % 360)
    # Straight overhead or straight below, every direction is the same direction.
    return np.where(np.abs(sin_zenith) < 1e-12, 180.0, azimuth)


def _apparent_longitude_deg(century: np.ndarray) -> np.ndarray:
    true_long = _mean_longitude_deg(century) + _equation_of_centre_deg(century)
    return true_long - 0.00569 - 0.00478 * np.sin(np.radians(125.04 - 1934.136 * century))


def _equation_of_centre_deg(century: np.ndarray) -> np.ndarray:
    m = np.radians(_mean_anomaly_deg(century))
    return np.sin(m) * (1.914602 - century * (0.004817 + 0.000014 * century)) + np.sin(2 * m) * (0.019993 - 0.000101 * century) + np.sin(3 * m) * 0.000289


def _obliquity_deg(century: np.ndarray) -> np.ndarray:
    """The tilt of the Earth's axis, with the small wobble the moon gives it."""
    mean = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60
    return mean + 0.00256 * np.cos(np.radians(125.04 - 1934.136 * century))


def _mean_longitude_deg(century: np.ndarray) -> np.ndarray:
    return (280.46646 + century * (36000.76983 + century * 0.0003032)) % 360


def _mean_anomaly_deg(century: np.ndarray) -> np.ndarray:
    return 357.52911 + century * (35999.05029 - 0.0001537 * century)


def _eccentricity(century: np.ndarray) -> np.ndarray:
    return 0.016708634 - century * (0.000042037 + 0.0000001267 * century)


def _julian_century(when: np.ndarray) -> np.ndarray:
    """Centuries since noon on 2000-01-01 UTC, the moment the series above are expanded around."""
    return (when / SECONDS_PER_DAY + UNIX_EPOCH_AS_JULIAN_DAY - J2000) / DAYS_PER_JULIAN_CENTURY

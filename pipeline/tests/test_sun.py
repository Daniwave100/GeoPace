"""Seam: an instant and a place -> where the sun is; a race day -> the five-minute steps we model.

Every expected number here comes from someone else's almanac, never from re-running this code:
the US Naval Observatory's own API (https://aa.usno.navy.mil/data/api), asked on 2026-09-20 for
the two race mornings. Its `hc` is the geometric altitude of the sun's centre and `zn` its
bearing, which is exactly what a shadow is cast from.

The trap these tests keep shut is the clock, not the astronomy: **US daylight saving ends on
Sunday 1 November 2026**, which is very likely New York's race day, so 09:10 on the start line is
14:10 UTC and not 13:10. A pipeline that reads race day in the wrong offset puts the sun an hour
out, which is 15 degrees of sky and a completely different side of the street.
"""

import datetime as dt
from zoneinfo import ZoneInfo

import numpy as np
import pytest

from geopace.sun import day_steps, steps_above, sun_position

# (when, lat, lon, altitude, azimuth) from the USNO almanac API, 2026-09-20.
QUEENSBORO = (40.7568, -73.9545)
BERLIN = (52.5163, 13.3777)
USNO = [
    # New York race morning, the first wave's own start time: 09:10 EST (not EDT — the clocks
    # went back at 02:00 that morning).
    ("2026-11-01T14:10:00Z", *QUEENSBORO, 24.762527, 139.709705),
    # The same afternoon at 16:00 EST, with the sun under the 10 degrees we model shade above.
    ("2026-11-01T21:00:00Z", *QUEENSBORO, 8.218513, 242.509179),
    # Berlin race morning, 09:15 CEST, and the same day at 13:00 CEST.
    ("2026-09-27T07:15:00Z", *BERLIN, 18.673696, 119.429322),
    ("2026-09-27T11:00:00Z", *BERLIN, 35.747429, 180.773072),
]
# How far from the Naval Observatory's answer we allow. The two are different expansions of the
# same orbit, so they part company in the third decimal of a degree, not the second.
TOLERANCE_DEG = 0.05

# The altitude of the sun's centre when its upper edge touches the horizon, once the atmosphere
# has bent the light: the definition every published sunrise and sunset time is worked out at.
HORIZON_DEG = -0.833


def unix(when: str) -> float:
    return dt.datetime.fromisoformat(when).timestamp()


@pytest.mark.parametrize("when,lat,lon,altitude,azimuth", USNO)
def test_the_sun_is_where_the_naval_observatory_says_it_is(when, lat, lon, altitude, azimuth):
    got_altitude, got_azimuth = sun_position(unix(when), lat, lon)

    assert got_altitude == pytest.approx(altitude, abs=TOLERANCE_DEG)
    assert got_azimuth == pytest.approx(azimuth, abs=TOLERANCE_DEG)


def test_the_sun_rises_and_sets_when_the_almanac_says_it_does():
    """Published rise and set times, which pin the whole chain: the date, the zone and the sun.

    USNO, 2026-09-20: New York 06:26 and 16:52 on 1 November (EST); Berlin 07:01 and 18:53 on
    27 September (CEST).
    """
    for day, zone, place, rise, sets in [
        (dt.date(2026, 11, 1), "America/New_York", QUEENSBORO, "06:26", "16:52"),
        (dt.date(2026, 9, 27), "Europe/Berlin", BERLIN, "07:01", "18:53"),
    ]:
        minute_by_minute = day_steps(day, zone, step_minutes=1)
        altitude, _ = sun_position(np.array([step.timestamp() for step in minute_by_minute]), *place)
        up = np.flatnonzero(altitude > HORIZON_DEG)

        assert minute_by_minute[up[0]].strftime("%H:%M") in _a_minute_either_side(rise)
        assert minute_by_minute[up[-1]].strftime("%H:%M") in _a_minute_either_side(sets)


def test_race_day_in_new_york_is_twenty_five_hours_long():
    """The morning the clocks go back. A day counted in local hours would lose an hour of sun."""
    steps = day_steps(dt.date(2026, 11, 1), "America/New_York", step_minutes=5)

    assert len(steps) == 25 * 12
    # The first wave's start, as the runner's start card prints it, is 14:10 UTC that day.
    nine_ten = [step for step in steps if step.strftime("%H:%M") == "09:10"]
    assert len(nine_ten) == 1
    assert nine_ten[0].astimezone(dt.UTC).strftime("%H:%M") == "14:10"
    assert nine_ten[0].utcoffset() == dt.timedelta(hours=-5)
    # The hour that happens twice is there twice, each with its own offset.
    one_thirty = [step for step in steps if step.strftime("%H:%M") == "01:30"]
    assert [step.utcoffset() for step in one_thirty] == [dt.timedelta(hours=-4), dt.timedelta(hours=-5)]


def test_a_day_of_steps_starts_and_ends_at_local_midnight():
    steps = day_steps(dt.date(2026, 9, 27), "Europe/Berlin", step_minutes=5)

    assert len(steps) == 24 * 12
    assert steps[0] == dt.datetime(2026, 9, 27, 0, 0, tzinfo=ZoneInfo("Europe/Berlin"))
    assert steps[-1].strftime("%H:%M") == "23:55"
    assert all((later - earlier) == dt.timedelta(minutes=5) for earlier, later in zip(steps, steps[1:]))


def test_the_steps_we_model_are_the_ones_with_the_sun_high_enough():
    """Shade is only worked out above a floor: under it a city street is in shadow whatever we
    compute, so the answer there is stated rather than worked out (PLAN.md D58)."""
    steps, altitude, azimuth = steps_above(day_steps(dt.date(2026, 9, 27), "Europe/Berlin", 5), *BERLIN, floor_deg=10)

    assert len(steps) == altitude.shape[1] == azimuth.shape[1]
    assert altitude.min() >= 10
    # Berlin's sun clears 10 degrees in the middle of the morning and drops back in the evening,
    # bracketing a race that starts at 08:45 and is over by mid-afternoon.
    assert steps[0].strftime("%H:%M") == "08:15"
    assert steps[-1].strftime("%H:%M") == "17:40"
    # The sun swings from the east, through south at midday, to the west: never backwards.
    assert np.all(np.diff(azimuth[0]) > 0)
    assert azimuth[0, 0] < 180 < azimuth[0, -1]


def test_the_floor_is_asked_of_every_place_on_the_course_not_just_the_first():
    """A marathon is 20 km across, and the sun stands lower at the far end of it.

    New York's start line is the southernmost point of its course, and so the sunniest: asked only
    there, the table's last column shipped a worked-out answer for 4,041 samples whose own sun was
    under the floor. Asked of every place, the window closes when the *dimmest* end of the course
    falls under it.
    """
    day = day_steps(dt.date(2026, 11, 1), "America/New_York", 5)
    staten_island, the_bronx = (40.603, -74.065), (40.815, -73.926)

    at_the_start, _, _ = steps_above(day, *staten_island, floor_deg=10)
    the_whole_course, altitude, _ = steps_above(day, [staten_island[0], the_bronx[0]], [staten_island[1], the_bronx[1]], floor_deg=10)

    assert altitude.shape[0] == 2
    assert altitude.min() >= 10  # every place, at every step in the table
    assert len(the_whole_course) < len(at_the_start)
    assert the_whole_course[-1] < at_the_start[-1]


def test_new_yorks_window_is_an_hour_earlier_than_a_summer_clock_would_say():
    """The day the clocks go back is the whole reason this is pinned down.

    Read in EDT the window comes out as 08:30 to 16:45, which is what PLAN.md D58 first said; on
    the real race-day clock (EST) the sun clears 10 degrees at 07:30 and drops back at 15:45. The
    difference matters to a runner: the last waves start at 11:30, so a slow race really does run
    out of modelled sun before the finish.
    """
    steps, altitude, _ = steps_above(day_steps(dt.date(2026, 11, 1), "America/New_York", 5), *QUEENSBORO, floor_deg=10)

    assert steps[0].strftime("%H:%M") == "07:30"
    assert steps[-1].strftime("%H:%M") == "15:45"
    assert all(step.utcoffset() == dt.timedelta(hours=-5) for step in steps)
    assert altitude.max() == pytest.approx(34.7, abs=0.1)  # the highest the sun gets that day


def test_the_sun_is_worked_out_for_many_places_and_many_moments_at_once():
    """The shade builder asks for a course of samples across a morning of steps in one go."""
    lat = np.array([[52.5], [40.7]])
    when = np.array([[unix("2026-09-27T07:15:00Z"), unix("2026-09-27T11:00:00Z")]])
    altitude, azimuth = sun_position(when, lat, np.array([[13.4], [-74.0]]))

    assert altitude.shape == azimuth.shape == (2, 2)
    one_at_a_time = [sun_position(when[0, t], lat[s, 0], [13.4, -74.0][s]) for s in range(2) for t in range(2)]
    assert altitude.ravel() == pytest.approx([one[0] for one in one_at_a_time])
    assert azimuth.ravel() == pytest.approx([one[1] for one in one_at_a_time])


def _a_minute_either_side(clock: str) -> set[str]:
    """Published rise and set times are whole minutes, and ours is the first step past the edge."""
    when = dt.datetime.strptime(clock, "%H:%M")
    return {(when + dt.timedelta(minutes=step)).strftime("%H:%M") for step in (-1, 0, 1)}

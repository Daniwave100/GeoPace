"""Seam: a course, the city's buildings and where the sun is -> is this sample in the sun?

The answer is binary, sample by sample and moment by moment (PLAN.md D58): every 10 m of road
either has the sun on it or doesn't, at the moment the runner gets there. These tests use one or
two made-up blocks with the sun at an angle chosen so the answer can be worked out on paper.

Geometry, in one line: a building of height h standing d away blocks the sun while the sun is
below atan(h / d). So a block's reach is h / tan(sun), and with the 10-degree floor we model
above, that is 5.7 times its height.
"""

import base64
import datetime as dt
import json
from pathlib import Path

import numpy as np
import pytest

from geopace.buildings import Building, BuildingsModel, buildings_along, meters_per_degree
from geopace.provenance import Attribution, Source
from geopace.shade import REACH_PER_METER, SUN_FLOOR_DEG, UNDER_A_ROOF_M, shade_buildings, shade_table, sunlit
from geopace.sun import sun_position

SOURCE = Source(id="made-up-city", title="A made-up city's buildings", url="https://example.org/buildings", licence="test data", accessed="2026-09-20")
ATTRIBUTION = Attribution(text="Buildings: a made-up city", url="https://example.org/buildings")

ORIGIN = (52.5, 13.4)  # a flat piece of Berlin to put the made-up city on
PER_LAT, PER_LON = meters_per_degree(ORIGIN[0])


def at(east_m: float, north_m: float) -> tuple[float, float]:
    """(lat, lon) this many metres east and north of the origin."""
    return ORIGIN[0] + north_m / PER_LAT, ORIGIN[1] + east_m / PER_LON


def block(east_m: float, north_m: float, width_m: float, depth_m: float, height_m: float, ground_m: float = 0.0, name: str = "block") -> Building:
    """A square-cornered block, `east_m`/`north_m` from the origin at its middle."""
    corners = [(-width_m / 2, -depth_m / 2), (width_m / 2, -depth_m / 2), (width_m / 2, depth_m / 2), (-width_m / 2, depth_m / 2)]
    ring = np.array([at(east_m + dx, north_m + dy)[::-1] for dx, dy in corners])  # (lon, lat)
    return Building(id=name, ring=ring, ground_m=ground_m, roof_m=ground_m + height_m)


def road_north(length_m: float = 200.0, spacing_m: float = 10.0, east_m: float = 0.0, height_m: float = 0.0):
    """A straight course running north past the origin, as (lat, lon, elevation) columns."""
    north = np.arange(-length_m / 2, length_m / 2 + spacing_m, spacing_m)
    places = [at(east_m, north_m) for north_m in north]
    return np.array([lat for lat, _ in places]), np.array([lon for _, lon in places]), np.full(len(north), height_m), north


def one_sun(altitude_deg: float, azimuth_deg: float, samples: int):
    """The same sun over every sample, as the one step of a one-step table."""
    return np.full((samples, 1), altitude_deg), np.full((samples, 1), azimuth_deg)


class TestOneBlockAndOneSun:
    def test_a_block_shades_exactly_the_road_behind_it(self):
        """A 20 m block 10 m east of the road, sun due east at 45 degrees. Its shadow reaches 20 m
        west — over the road — and is as wide as the block, so exactly the road beside it is dark."""
        lat, lon, elevation, north = road_north()
        blocks = [block(east_m=20, north_m=0, width_m=20, depth_m=25, height_m=20)]  # its west wall is 10 m from the road

        lit = sunlit(lat, lon, elevation, blocks, *one_sun(45, 90, len(lat)))[:, 0]

        assert list(north[~lit]) == [-10.0, 0.0, 10.0]  # the samples beside the block, and no others

    def test_the_sun_climbing_over_the_block_puts_the_road_back_in_the_sun(self):
        """The same block and the same road. At 45 degrees the shadow is 20 m long and crosses the
        road; at 70 degrees it is 7 m long and stops short of it."""
        lat, lon, elevation, _ = road_north()
        blocks = [block(east_m=20, north_m=0, width_m=20, depth_m=25, height_m=20)]

        assert not sunlit(lat, lon, elevation, blocks, *one_sun(45, 90, len(lat)))[:, 0].all()
        assert sunlit(lat, lon, elevation, blocks, *one_sun(70, 90, len(lat)))[:, 0].all()

    def test_a_block_on_the_far_side_of_the_sun_shades_nothing(self):
        """The block is east of the road; with the sun in the west it can only shade its own back."""
        lat, lon, elevation, _ = road_north()
        blocks = [block(east_m=20, north_m=0, width_m=20, depth_m=25, height_m=20)]

        assert sunlit(lat, lon, elevation, blocks, *one_sun(45, 270, len(lat))).all()

    def test_a_block_lower_than_the_road_it_stands_beside_shades_nothing(self):
        """A bridge deck runs above the roofs beside it: the road is 30 m up, the block is 20 m."""
        lat, lon, elevation, _ = road_north(height_m=30)
        blocks = [block(east_m=20, north_m=0, width_m=20, depth_m=25, height_m=20)]

        assert sunlit(lat, lon, elevation, blocks, *one_sun(20, 90, len(lat))).all()


class TestTheReachOfATallBuildingFurtherOut:
    """PLAN.md D58: shade is worked out from a wider set of buildings than the White model draws,
    because a tall building reaches the course from far outside the 150 m corridor."""

    def test_a_tower_outside_the_corridor_shades_the_road_and_the_same_tower_beyond_its_reach_does_not(self):
        lat, lon, elevation, _ = road_north()
        sun = one_sun(SUN_FLOOR_DEG, 90, len(lat))  # the lowest sun we model, where reach is longest
        reach_m = 100 * REACH_PER_METER  # a 100 m tower reaches 567 m at 10 degrees

        inside_its_reach = [block(east_m=reach_m - 50, north_m=0, width_m=40, depth_m=400, height_m=100)]
        beyond_its_reach = [block(east_m=reach_m + 50, north_m=0, width_m=40, depth_m=400, height_m=100)]

        assert not sunlit(lat, lon, elevation, inside_its_reach, *sun).all()
        assert sunlit(lat, lon, elevation, beyond_its_reach, *sun).all()
        assert reach_m == pytest.approx(567, abs=1)


class TestTheRoadCanBeAboveARoof:
    """PLAN.md §10: in New York three samples sit over a roof 2 m below them, because the course
    is on the Queensboro's lower deck and a building beside the bridge is under it. In Berlin the
    course really does run through the Brandenburg Gate, 21 m over its head."""

    def test_a_roof_that_clears_the_road_by_two_metres_does_not_make_the_runner_indoors(self):
        lat, lon, elevation, _ = road_north()
        under_the_deck = [block(east_m=0, north_m=0, width_m=60, depth_m=65, height_m=2)]

        assert sunlit(lat, lon, elevation, under_the_deck, *one_sun(45, 90, len(lat))).all()

    def test_a_roof_the_road_runs_under_shades_it_whatever_the_sun_is_doing(self):
        lat, lon, elevation, north = road_north()
        gate = [block(east_m=0, north_m=0, width_m=60, depth_m=25, height_m=21)]

        for azimuth in (90, 180, 270):
            lit = sunlit(lat, lon, elevation, gate, *one_sun(80, azimuth, len(lat)))[:, 0]
            assert list(north[~lit]) == [-10.0, 0.0, 10.0]

    def test_the_headroom_a_road_needs_is_more_than_a_person(self):
        """Two metres of clearance is a record's outline overlapping a road it doesn't stand over;
        a road that really passes under a building has room for a lorry."""
        assert 3 <= UNDER_A_ROOF_M <= 6


class TestATableOfEveryFiveMinutes:
    def test_it_covers_race_day_from_when_the_sun_clears_the_floor_to_when_it_drops_back(self):
        lat, lon, elevation, _ = road_north()
        table = shade_table(lat, lon, elevation, [], day=dt.date(2026, 9, 27), timezone="Europe/Berlin", step_minutes=5)

        assert table.steps[0].strftime("%H:%M") == "08:15"
        assert table.steps[-1].strftime("%H:%M") == "17:40"
        assert table.altitude_deg.min() >= SUN_FLOOR_DEG
        assert table.in_sun.shape == (len(lat), len(table.steps))
        assert table.in_sun.all()  # no buildings, no shade

    def test_the_flag_for_a_place_that_is_never_shaded_is_true_in_the_open_and_false_in_a_canyon(self):
        """The time-independent column the owner asked for: what is notorious for having no shade."""
        lat, lon, elevation, north = road_north()
        # Walls both sides of the road for the northern half of it, nothing on the southern half.
        canyon = [block(east_m=20, north_m=50, width_m=20, depth_m=105, height_m=40), block(east_m=-20, north_m=50, width_m=20, depth_m=105, height_m=40)]
        table = shade_table(lat, lon, elevation, canyon, day=dt.date(2026, 9, 27), timezone="Europe/Berlin", step_minutes=5)

        in_the_open = north < -20
        in_the_canyon = north > 20
        assert table.always_in_sun[in_the_open].all()
        assert not table.always_in_sun[in_the_canyon].any()

    def test_the_table_packs_into_bits_the_app_can_read_back(self):
        lat, lon, elevation, _ = road_north(length_m=50)
        wall = [block(east_m=20, north_m=0, width_m=20, depth_m=205, height_m=40)]
        table = shade_table(lat, lon, elevation, wall, day=dt.date(2026, 9, 27), timezone="Europe/Berlin", step_minutes=5)

        packed = table.to_json()
        bits = np.unpackbits(np.frombuffer(_from_base64(packed["in_sun"]), dtype=np.uint8).reshape(len(lat), -1), axis=1)

        assert packed["bytes_per_sample"] == -(-len(table.steps) // 8)
        assert np.array_equal(bits[:, : len(table.steps)], table.in_sun)
        assert not bits[:, len(table.steps) :].any()  # the spare bits at the end of a row are zero


def _from_base64(text: str) -> bytes:
    import base64

    return base64.b64decode(text)


class TestTheWiderSetShadeIsWorkedOutFrom:
    """PLAN.md D58: keep every building within the corridor, and beyond it only one tall enough to
    reach the course from there — at the 10-degree floor, a metre of height per 5.7 m of distance."""

    def fake_city(self, buildings: list[Building]):
        """A buildings model that answers from a list, the way a city's service would: only what
        meets the box, and only what is at least as tall as it was asked for."""
        asked: list[tuple[float, float]] = []

        def within(south, west, north, east, min_height_m=0.0):
            asked.append(min_height_m)
            return [
                b
                for b in buildings
                if (b.roof_m - b.ground_m) >= min_height_m
                and b.ring[:, 1].max() >= south
                and b.ring[:, 1].min() <= north
                and b.ring[:, 0].max() >= west
                and b.ring[:, 0].min() <= east
            ]

        return BuildingsModel(within=within, source=SOURCE, attribution=ATTRIBUTION), asked

    def test_it_keeps_the_corridor_whole_and_only_what_reaches_the_course_beyond_it(self):
        lat, lon, elevation, _ = road_north(length_m=400)
        city = [
            block(east_m=60, north_m=0, width_m=20, depth_m=20, height_m=6, name="in the corridor"),
            block(east_m=200, north_m=0, width_m=20, depth_m=20, height_m=20, name="ordinary, too far"),  # reaches 113 m
            block(east_m=400, north_m=0, width_m=20, depth_m=20, height_m=100, name="tall enough"),  # reaches 567 m
            block(east_m=700, north_m=0, width_m=20, depth_m=20, height_m=100, name="tall, beyond its reach"),
            block(east_m=2500, north_m=0, width_m=40, depth_m=40, height_m=470, name="a tower miles away"),  # reaches 2.7 km
        ]
        model, asked = self.fake_city(city)

        kept = {b.id for b in shade_buildings(lat, lon, elevation, model)}

        assert kept == {"in the corridor", "tall enough", "a tower miles away"}
        # The city is never asked for what it would only send to be thrown away: past the corridor
        # every band asks for a height, and the furthest asks for the tallest.
        assert min(asked) == 0.0
        assert sorted({round(height) for height in asked if height}) == [26, 53, 88, 176, 353]

    def test_the_white_model_still_draws_the_corridor_alone(self):
        """The wide set is for shade only: what is drawn is what a runner can see from the road."""
        lat, lon, elevation, _ = road_north(length_m=400)
        city = [block(east_m=400, north_m=0, width_m=20, depth_m=20, height_m=100, name="tall enough")]
        model, _ = self.fake_city(city)

        assert [b.id for b in shade_buildings(lat, lon, elevation, model)] == ["tall enough"]
        assert buildings_along(lat, lon, model) == []


class TestTheCommittedTables:
    """What the app actually loads: data/derived/<course>/course-bundle.json, committed, so these
    run everywhere with no cache and no downloads."""

    REPO = Path(__file__).parents[2]
    EVERY = 20  # every twentieth sample: enough of both courses to be sure, quick enough for a test

    def bundle(self, course: str) -> dict:
        return json.loads((self.REPO / "data" / "derived" / course / "course-bundle.json").read_text(encoding="utf-8"))

    def white_model(self, course: str) -> dict:
        return json.loads((self.REPO / "data" / "derived" / course / "white-model.json").read_text(encoding="utf-8"))

    def unpacked(self, sun: dict) -> np.ndarray:
        rows = np.frombuffer(base64.b64decode(sun["in_sun"]), dtype=np.uint8).reshape(sun["samples"], -1)
        return np.unpackbits(rows, axis=1)[:, : sun["steps"]].astype(bool)

    @pytest.mark.parametrize("course", ["berlin", "nyc"])
    def test_the_table_has_a_row_for_every_course_sample_and_a_column_for_every_step(self, course):
        bundle = self.bundle(course)
        sun = bundle["measured"]["sun"]

        assert sun["samples"] == len(bundle["measured"]["course_line"]["km"])
        assert len(sun["altitude_deg"]) == len(sun["azimuth_deg"]) == sun["steps"]
        assert self.unpacked(sun).shape == (sun["samples"], sun["steps"])
        assert min(sun["altitude_deg"]) >= sun["floor_deg"]

    @pytest.mark.parametrize("course", ["berlin", "nyc"])
    def test_the_wide_set_shade_was_worked_out_from_was_never_drawn(self, course):
        """PLAN.md D58: shade sees further than the White model draws, and that set never ships.
        What is drawn is the corridor alone (test_white_model.py checks every block against it)."""
        bundle = self.bundle(course)
        sun, white = bundle["measured"]["sun"], bundle["measured"]["white_model"]

        assert sun["buildings"]["counted"] > white["buildings"]
        assert sun["buildings"]["within_m"] == white["corridor_m"]
        assert sun["buildings"]["furthest_m"] > white["corridor_m"]
        assert len(self.white_model(course)["buildings"]["ring"]) == white["buildings"]

    @pytest.mark.parametrize("course", ["berlin", "nyc"])
    def test_the_blocks_on_screen_cast_the_shade_the_table_says_they_do(self, course):
        """The ticket's own acceptance, as a test: the White model's shadows and the numbers agree.

        The map draws the corridor's blocks and the sun moves over them; the strip draws the
        table. So the shade those same blocks cast is worked out again here, from the committed
        White model itself, and has to be the table's own answer — except where the table knows
        about a tall building outside the drawn corridor, which is the one way the two may differ
        and only ever adds shade.
        """
        bundle = self.bundle(course)
        sun, line = bundle["measured"]["sun"], bundle["measured"]["course_line"]
        blocks = self.white_model(course)["buildings"]
        drawn = [
            Building(id=str(i), ring=np.asarray(ring, dtype=float).reshape(-1, 2), ground_m=blocks["base_m"][i], roof_m=blocks["roof_m"][i])
            for i, ring in enumerate(blocks["ring"])
        ]
        take = slice(None, None, self.EVERY)
        lat, lon = np.array(line["lat"])[take], np.array(line["lon"])[take]
        # The White model's heights count from the ellipsoid, so the road's matching column is used.
        road_m = np.array(line["ellipsoid_height_m"])[take]
        first = dt.datetime.fromisoformat(sun["first_step"]).timestamp()
        when = first + np.arange(sun["steps"]) * sun["step_minutes"] * 60
        altitude, azimuth = sun_position(when[None, :], lat[:, None], lon[:, None])

        on_screen = sunlit(lat, lon, road_m, drawn, altitude, azimuth)
        in_the_table = self.unpacked(sun)[take]
        shade_only_on_screen = (~on_screen & in_the_table).mean()
        shade_only_in_the_table = (on_screen & ~in_the_table).mean()

        # Nothing the map shadows may be missing from the table, bar the odd sample at a shadow's
        # edge: the file's outlines are simplified by 0.25 m and its heights rounded to the centimetre.
        assert shade_only_on_screen < 0.001, f"{course}: the map shadows {shade_only_on_screen:.2%} of samples the table calls sunlit"
        assert (on_screen == in_the_table).mean() > 0.985
        # And the wider set really does add shade the drawn corridor can't see: New York's towers
        # reach the course from outside it, where Berlin has almost nothing tall enough to.
        if course == "nyc":
            assert shade_only_in_the_table > 0.001

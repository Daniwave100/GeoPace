"""Seam: a course, the city's trees and where the sun is -> is this sample in leafy shade?

The third state (PLAN.md D58, D60): shade a runner only gets while the leaves are on. These tests
put one or two made-up crowns beside a made-up road, with the sun at an angle chosen so the answer
can be worked out on paper — the same shape as test_shade.py's, which does it for buildings.

The one thing a crown does that a wall does not: it starts above the ground. At a low sun the
light comes in underneath it, which is why a crown carries an underside and the ray has to be over
that underside where it leaves the outline.
"""

import base64
import datetime as dt
import json
from pathlib import Path

import numpy as np
import pytest

from geopace.bundle import BundleInvalid, validate_bundle
from geopace.provenance import Attribution, Source
from geopace.shade import REACH_PER_METER, leaf_shaded, shade_table, sunlit
from geopace.sun import sun_position
from geopace.trees import CROWN_DEPTH_SHARE, Crown, TreesModel, crown_over, crowns_along, disc_ring
from test_shade import at, block, one_sun, road_north

SOURCE = Source(id="made-up-trees", title="A made-up city's trees", url="https://example.org/trees", licence="test data", accessed="2026-09-21")
ATTRIBUTION = Attribution(text="Trees: a made-up city", url="https://example.org/trees")


def crown(east_m: float, north_m: float, radius_m: float, top_m: float, underside_m: float, name: str = "crown") -> Crown:
    """A round crown, `east_m`/`north_m` from the origin, its heights above sea level."""
    lat, lon = at(east_m, north_m)
    return Crown(id=name, ring=disc_ring(lon, lat, radius_m), underside_m=underside_m, top_m=top_m)


class TestACrownIsNotAWall:
    def test_a_crown_shades_the_road_behind_it_the_way_a_building_would(self):
        """A crown topping out at 20 m, 10 m east of the road, sun due east at 45 degrees: its
        shadow reaches 20 m west, over the road."""
        lat, lon, elevation, north = road_north()
        trees = [crown(east_m=20, north_m=0, radius_m=10, top_m=20, underside_m=6)]

        shaded = leaf_shaded(lat, lon, elevation, trees, *one_sun(45, 90, len(lat)))[:, 0]

        assert shaded[north == 0][0]
        assert not shaded[north == -60][0]  # well up the road, past the end of the shadow

    def test_the_sun_low_enough_comes_in_under_the_crown(self):
        """The difference between a tree and a wall. The same crown, 30 m east of the road, with
        its leaves from 6 m up. At 25 degrees the ray is 14 m up as it leaves the crown, under the
        20 m top and over the 6 m underside: shade. At 8 degrees it is 5.6 m up at the far side —
        it has passed beneath the leaves — where a solid block of the same outline would still
        stop it."""
        lat, lon, elevation, north = road_north()
        here = north == 0
        leafy = [crown(east_m=30, north_m=0, radius_m=10, top_m=20, underside_m=6)]
        solid = [block(east_m=30, north_m=0, width_m=20, depth_m=20, height_m=20)]

        assert leaf_shaded(lat, lon, elevation, leafy, *one_sun(25, 90, len(lat)))[here, 0][0]
        assert not leaf_shaded(lat, lon, elevation, leafy, *one_sun(8, 90, len(lat)))[here, 0][0]
        assert not sunlit(lat, lon, elevation, solid, *one_sun(8, 90, len(lat)))[here, 0][0]

    def test_a_runner_under_the_crown_is_in_leafy_shade_whatever_the_sun_is_doing(self):
        """A crown 4 m across over the road, with the sun nearly overhead: the sample under it is
        shaded from every side, and at 80 degrees the shadow reaches only 2.5 m past the leaves,
        so its neighbours ten metres up and down the road are not."""
        lat, lon, elevation, north = road_north()
        over_the_road = [crown(east_m=0, north_m=0, radius_m=4, top_m=14, underside_m=4)]

        for azimuth in (90, 180, 270):
            shaded = leaf_shaded(lat, lon, elevation, over_the_road, *one_sun(80, azimuth, len(lat)))[:, 0]
            assert list(north[shaded]) == [0.0]

    def test_a_crown_whose_leaves_start_under_the_road_is_not_over_it_at_all(self):
        """A tree down a bank beside a viaduct: its outline holds the road's plan position, but the
        runner is above the leaves, not under them."""
        lat, lon, elevation, _ = road_north(height_m=20)
        below = [crown(east_m=0, north_m=0, radius_m=8, top_m=14, underside_m=4)]

        assert not leaf_shaded(lat, lon, elevation, below, *one_sun(45, 90, len(lat))).any()


class TestABuildingWinsWhereBothApply:
    """PLAN.md D60: shade you get whatever the trees do is the stronger claim, and the one drawn
    solid. Where a wall and a crown both stand between the runner and the sun, the answer is
    shade, not leafy shade."""

    def test_the_wall_takes_the_sample_and_the_crown_is_left_with_nothing_to_say(self):
        lat, lon, elevation, north = road_north()
        here = north == 0
        wall = [block(east_m=20, north_m=0, width_m=20, depth_m=25, height_m=20)]
        trees = [crown(east_m=12, north_m=0, radius_m=4, top_m=12, underside_m=4)]
        sun = one_sun(45, 90, len(lat))

        in_sun = sunlit(lat, lon, elevation, wall, *sun)
        leafy = leaf_shaded(lat, lon, elevation, trees, *sun, in_sun=in_sun)

        assert not in_sun[here, 0][0]  # the wall has it
        assert not leafy[here, 0][0]  # so the crown says nothing about it
        assert not (leafy & ~in_sun).any()  # and nowhere at all is both

    def test_a_crown_on_its_own_shades_what_no_wall_reaches(self):
        lat, lon, elevation, north = road_north()
        here = north == 0
        trees = [crown(east_m=12, north_m=0, radius_m=4, top_m=12, underside_m=4)]
        sun = one_sun(45, 90, len(lat))

        in_sun = sunlit(lat, lon, elevation, [], *sun)
        leafy = leaf_shaded(lat, lon, elevation, trees, *sun, in_sun=in_sun)

        assert in_sun.all()
        assert leafy[here, 0][0]


class TestHowDeepACrownIs:
    """⚠️ The one worked-out number in the tree model: no survey says where a crown starts."""

    def test_it_is_as_deep_as_it_is_wide_between_a_third_and_four_fifths_of_the_tree(self):
        least, most = CROWN_DEPTH_SHARE
        underside, top = crown_over(ground_m=30.0, height_m=20.0, crown_width_m=12.0)

        assert top == pytest.approx(50.0)
        assert top - underside == pytest.approx(12.0)
        assert least * 20 <= top - underside <= most * 20

    def test_a_narrow_crown_never_comes_out_as_a_lollipop_and_a_wide_one_never_as_a_block(self):
        least, most = CROWN_DEPTH_SHARE
        narrow = crown_over(ground_m=0.0, height_m=18.0, crown_width_m=1.0)
        wide = crown_over(ground_m=0.0, height_m=18.0, crown_width_m=40.0)

        assert narrow[1] - narrow[0] == pytest.approx(least * 18)
        assert wide[1] - wide[0] == pytest.approx(most * 18)

    def test_with_no_width_at_all_the_crown_is_as_deep_as_it_can_be(self):
        """New York's crowns come from a raster that says nothing about a single tree's width, so
        the deepest crown the rule allows is the one that claims least about where light gets in."""
        underside, top = crown_over(ground_m=0.0, height_m=15.0)

        assert top - underside == pytest.approx(CROWN_DEPTH_SHARE[1] * 15)


class TestTheTreesAlongTheCourse:
    def fake_city(self, crowns: list[Crown]) -> TreesModel:
        def within(south, west, north, east):
            return [c for c in crowns if c.ring[:, 1].max() >= south and c.ring[:, 1].min() <= north and c.ring[:, 0].max() >= west and c.ring[:, 0].min() <= east]

        return TreesModel(within=within, source=SOURCE, attribution=ATTRIBUTION, leaves_when_surveyed="made up")

    def test_a_crown_is_kept_only_while_it_can_still_reach_the_road(self):
        """PLAN.md D60: the trees that shade and the trees that are drawn are the same trees, and
        both are the ones tall enough for their distance. A 12 m crown reaches 68 m at the floor."""
        lat, lon, elevation, _ = road_north(length_m=400)
        city = [
            crown(east_m=20, north_m=0, radius_m=5, top_m=12, underside_m=4, name="on the pavement"),
            crown(east_m=100, north_m=0, radius_m=5, top_m=12, underside_m=4, name="too short for that distance"),
            crown(east_m=100, north_m=0, radius_m=5, top_m=25, underside_m=8, name="tall enough for it"),
            crown(east_m=400, north_m=0, radius_m=5, top_m=40, underside_m=8, name="beyond the corridor"),
        ]

        kept = {c.id for c in crowns_along(lat, lon, elevation, self.fake_city(city), corridor_m=150.0, reach_per_meter=REACH_PER_METER)}

        assert kept == {"on the pavement", "tall enough for it"}


class TestTheTableTheBundleCarries:
    def test_the_third_state_is_a_second_column_of_bits_the_app_can_read_back(self):
        lat, lon, elevation, _ = road_north(length_m=50)
        trees = [crown(east_m=12, north_m=0, radius_m=6, top_m=14, underside_m=5, name=f"t{i}") for i in range(-3, 4)]
        table = shade_table(lat, lon, elevation, [], crowns=trees, day=dt.date(2026, 9, 27), timezone="Europe/Berlin")

        packed = table.to_json()
        rows = np.frombuffer(base64.b64decode(packed["in_leaf_shade"]), dtype=np.uint8).reshape(len(lat), -1)
        bits = np.unpackbits(rows, axis=1)[:, : len(table.steps)].astype(bool)

        assert table.in_leaf_shade.any()
        assert np.array_equal(bits, table.in_leaf_shade)

    def test_a_course_with_no_tree_data_ships_no_column_at_all(self):
        """Rather than a field of zeros, which would read as "we looked and there are no trees"."""
        lat, lon, elevation, _ = road_north(length_m=50)
        table = shade_table(lat, lon, elevation, [], day=dt.date(2026, 9, 27), timezone="Europe/Berlin")

        assert "in_leaf_shade" not in table.to_json()
        assert not table.in_leaf_shade.any()

    def test_a_road_under_trees_is_not_a_road_with_no_shade_at_any_hour(self):
        """The time-independent claim is the strongest thing the layer says. Leaves count in it."""
        lat, lon, elevation, north = road_north(length_m=100)
        avenue = [crown(east_m=0, north_m=float(metres), radius_m=7, top_m=15, underside_m=5, name=f"t{metres}") for metres in range(-50, 60, 10)]

        bare = shade_table(lat, lon, elevation, [], day=dt.date(2026, 9, 27), timezone="Europe/Berlin")
        leafy = shade_table(lat, lon, elevation, [], crowns=avenue, day=dt.date(2026, 9, 27), timezone="Europe/Berlin")

        assert bare.always_in_sun.all()
        assert not leafy.always_in_sun.any()
        assert leafy.in_sun.all()  # no building shades any of it; every bit of that is the leaves


class TestTheCommittedCrowns:
    """What the app actually loads: data/derived/<course>/, committed, so these run everywhere with
    no cache and no downloads."""

    REPO = Path(__file__).parents[2]
    EVERY = 20  # every twentieth sample: enough of both courses to be sure, quick enough for a test

    def bundle(self, course: str) -> dict:
        return json.loads((self.REPO / "data" / "derived" / course / "course-bundle.json").read_text(encoding="utf-8"))

    def white_model(self, course: str) -> dict:
        return json.loads((self.REPO / "data" / "derived" / course / "white-model.json").read_text(encoding="utf-8"))

    def unpacked(self, sun: dict, field: str) -> np.ndarray:
        rows = np.frombuffer(base64.b64decode(sun[field]), dtype=np.uint8).reshape(sun["samples"], -1)
        return np.unpackbits(rows, axis=1)[:, : sun["steps"]].astype(bool)

    @pytest.mark.parametrize("course", ["berlin", "nyc"])
    def test_both_courses_carry_a_third_state_and_a_wall_always_wins(self, course):
        bundle = self.bundle(course)
        sun = bundle["measured"]["sun"]

        in_sun = self.unpacked(sun, "in_sun")
        leafy = self.unpacked(sun, "in_leaf_shade")

        assert leafy.any(), f"{course} has no leafy shade at all"
        assert not (leafy & ~in_sun).any(), f"{course} calls something both a building's shade and a tree's"

    @pytest.mark.parametrize("course", ["berlin", "nyc"])
    def test_the_trees_that_shade_are_the_trees_that_are_drawn(self, course):
        """Unlike the buildings there is one set, not two (PLAN.md D60): a tree never reaches the
        course from outside the corridor, so a shadow on screen and a band on the strip cannot be
        different trees."""
        bundle = self.bundle(course)
        trees, white = bundle["measured"]["sun"]["trees"], bundle["measured"]["white_model"]

        assert trees["counted"] == white["trees"] == len(self.white_model(course)["trees"]["ring"])
        assert trees["within_m"] == white["corridor_m"]

    @pytest.mark.parametrize("course", ["berlin", "nyc"])
    def test_every_crown_says_where_its_leaves_start_and_never_hangs_upside_down(self, course):
        crowns = self.white_model(course)["trees"]

        underside = np.array(crowns["underside_m"])
        top = np.array(crowns["top_m"])
        assert len(underside) == len(top) == len(crowns["ring"]) > 0
        assert (top >= underside).all()
        # A crown is a crown, not a block from the ground up: it always has some air under it.
        assert (top - underside > 0).all()

    @pytest.mark.parametrize("course", ["berlin", "nyc"])
    def test_the_leaves_are_credited_and_the_noncommercial_canopy_is_nowhere_near_it(self, course):
        """PLAN.md D58: New York's newest 6-inch canopy (TNC / University of Vermont, 2021) is
        CC BY-NC-SA, which is not an open licence and would infect the repo. Nothing may ship on it."""
        bundle = self.bundle(course)
        sources = bundle["sources"]
        licences = " ".join(source["licence"] for source in sources)
        everything = json.dumps(bundle) + json.dumps(self.white_model(course))

        assert bundle["measured"]["sun"]["trees"]["leaves_when_surveyed"]
        assert bundle["course"]["leaves"]["source"].startswith("http")
        assert any("tree" in source["id"] or "land-cover" in source["id"] for source in sources), f"{course} does not name where its trees came from"
        assert all(source["licence"] and source["url"].startswith("http") for source in sources)
        assert "NonCommercial" not in licences and "BY-NC" not in licences
        assert "zenodo" not in everything.lower()

    def test_a_leafy_column_of_the_wrong_size_is_refused_before_it_is_written(self):
        """Reading past the end of the bits gives zeros, which read as "no tree"; a mis-strided
        column would put a tree's shade where there is no tree. The app checks the same thing."""
        bundle = self.bundle("berlin")
        bundle["measured"]["sun"]["in_leaf_shade"] = bundle["measured"]["sun"]["in_leaf_shade"][:400]

        with pytest.raises(BundleInvalid, match="in_leaf_shade is"):
            validate_bundle(bundle)

    @pytest.mark.parametrize("course", ["berlin", "nyc"])
    def test_the_crowns_on_screen_cast_the_leafy_shade_the_table_says_they_do(self, course):
        """The same acceptance #9 asks of the buildings, asked of the trees: what the map draws and
        what the strip says are one answer, because both are these crowns."""
        bundle = self.bundle(course)
        sun, line = bundle["measured"]["sun"], bundle["measured"]["course_line"]
        drawn = self.white_model(course)["trees"]
        crowns = [
            Crown(id=str(i), ring=np.asarray(ring, dtype=float).reshape(-1, 2), underside_m=drawn["underside_m"][i], top_m=drawn["top_m"][i])
            for i, ring in enumerate(drawn["ring"])
        ]
        take = slice(None, None, self.EVERY)
        lat, lon = np.array(line["lat"])[take], np.array(line["lon"])[take]
        # The White model's heights count from the ellipsoid, so the road's matching column is used.
        road_m = np.array(line["ellipsoid_height_m"])[take]
        first = dt.datetime.fromisoformat(sun["first_step"]).timestamp()
        when = first + np.arange(sun["steps"]) * sun["step_minutes"] * 60
        altitude, azimuth = sun_position(when[None, :], lat[:, None], lon[:, None])
        in_sun = self.unpacked(sun, "in_sun")[take]

        on_screen = leaf_shaded(lat, lon, road_m, crowns, altitude, azimuth, in_sun=in_sun)
        in_the_table = self.unpacked(sun, "in_leaf_shade")[take]

        assert (on_screen == in_the_table).mean() > 0.99, f"{course}: the crowns drawn and the table disagree"

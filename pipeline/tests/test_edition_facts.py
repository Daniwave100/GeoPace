"""Hand-maintained edition facts: one year's date and waves, each with its source.

The trap this file pins down: wave times are wall-clock times in the course's time zone, and
New York's 2026 race is on the morning US clocks go back.
"""

from pathlib import Path

import pytest
import yaml

from geopace.edition_facts import EditionFactsInvalid, load_editions, parse_edition_facts

COURSES = Path(__file__).parents[2] / "data" / "courses"


def test_a_wave_start_becomes_an_instant_in_the_courses_time_zone(synthetic_edition):
    edition = parse_edition_facts(synthetic_edition, timezone="America/New_York")

    assert edition.edition == 2026
    assert edition.date.day == "2026-11-01"
    # US daylight saving ends at 02:00 on Sunday 2026-11-01, hours before the start, so 09:10 in
    # New York is EST (UTC-5), not the EDT (UTC-4) the day before was on.
    assert [(w.id, w.start_local, w.start) for w in edition.waves] == [
        ("wave-1", "09:10", "2026-11-01T09:10:00-05:00"),
        ("wave-2", "09:45", "2026-11-01T09:45:00-05:00"),
    ]


def test_a_wave_time_yaml_misread_as_a_number_is_rejected_with_advice(synthetic_edition):
    # YAML reads an unquoted 10:20 as the base-60 number 620, not as a time of day.
    synthetic_edition["waves"][1]["start_local"] = 620

    with pytest.raises(EditionFactsInvalid, match=r'waves\[1\] \(Wave 2\) start_local 620 .*in quotes.*"10:20"'):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_a_wave_time_that_is_not_a_time_of_day_is_rejected(synthetic_edition):
    synthetic_edition["waves"][0]["start_local"] = "25:10"

    with pytest.raises(EditionFactsInvalid, match=r"waves\[0\] \(Wave 1\) start_local '25:10'"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_a_carried_over_wave_says_which_edition_it_was_copied_from_and_why(synthetic_edition):
    synthetic_edition["carried_over"] = {"from_edition": 2025, "reason": "The 2026 wave times aren't published yet."}
    synthetic_edition["waves"][1]["carried_over"] = True

    edition = parse_edition_facts(synthetic_edition, timezone="America/New_York")

    assert (edition.carried_over.from_edition, edition.carried_over.reason) == (2025, "The 2026 wave times aren't published yet.")
    assert [wave.carried_over for wave in edition.waves] == [False, True]


def test_a_carried_over_wave_with_no_reason_given_is_rejected(synthetic_edition):
    synthetic_edition["waves"][1]["carried_over"] = True

    with pytest.raises(EditionFactsInvalid, match=r"waves\[1\] \(Wave 2\) is carried over, but the edition has no `carried_over`"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_carried_over_details_must_come_from_an_earlier_edition(synthetic_edition):
    synthetic_edition["carried_over"] = {"from_edition": 2026, "reason": "Copied."}
    synthetic_edition["waves"][1]["carried_over"] = True

    with pytest.raises(EditionFactsInvalid, match=r"carried_over.from_edition must be a year before 2026"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_a_wave_whose_start_time_is_not_published_has_no_instant_and_says_why(synthetic_edition):
    synthetic_edition["waves"][1] |= {"start_local": None, "note": "The organizer gives a time only for the first wave."}

    edition = parse_edition_facts(synthetic_edition, timezone="America/New_York")

    unpublished = edition.waves[1]
    assert (unpublished.start_local, unpublished.start) == (None, None)
    assert unpublished.note == "The organizer gives a time only for the first wave."


def test_a_wave_with_no_start_time_and_no_explanation_is_rejected(synthetic_edition):
    synthetic_edition["waves"][1]["start_local"] = None

    with pytest.raises(EditionFactsInvalid, match=r"waves\[1\] \(Wave 2\) has no start time, so it needs a `note`"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_an_edition_with_no_timed_wave_is_rejected(synthetic_edition):
    for wave in synthetic_edition["waves"]:
        wave |= {"start_local": None, "note": "Not published."}

    with pytest.raises(EditionFactsInvalid, match=r"at least one wave needs a start time"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_a_wave_without_a_source_is_rejected(synthetic_edition):
    del synthetic_edition["waves"][0]["source"]
    del synthetic_edition["date"]["accessed"]

    with pytest.raises(EditionFactsInvalid) as err:
        parse_edition_facts(synthetic_edition, timezone="America/New_York")
    assert "waves[0] (Wave 1) has no source" in str(err.value)
    assert "date has no accessed date" in str(err.value)


def test_a_file_with_parts_missing_is_rejected_by_name_not_with_a_crash(synthetic_edition):
    del synthetic_edition["date"]
    synthetic_edition["waves"] = []

    with pytest.raises(EditionFactsInvalid) as err:
        parse_edition_facts(synthetic_edition, timezone="America/New_York")
    assert "date is missing" in str(err.value)
    assert "waves is empty" in str(err.value)


def test_two_waves_cannot_share_an_id(synthetic_edition):
    synthetic_edition["waves"][1]["id"] = "wave-1"

    with pytest.raises(EditionFactsInvalid, match=r"waves\[1\] \(Wave 2\) id 'wave-1' is already used"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_the_race_date_must_fall_in_the_editions_year(synthetic_edition):
    synthetic_edition["date"]["day"] = "2025-11-02"

    with pytest.raises(EditionFactsInvalid, match=r"date.day 2025-11-02 is not in 2026"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_editions_load_from_a_course_folder_oldest_first(synthetic_edition, tmp_path):
    folder = tmp_path / "editions"
    folder.mkdir()
    earlier = synthetic_edition | {"edition": 2025, "date": synthetic_edition["date"] | {"day": "2025-11-02"}}
    (folder / "2026.yaml").write_text(yaml.safe_dump(synthetic_edition))
    (folder / "2025.yaml").write_text(yaml.safe_dump(earlier))

    editions = load_editions(tmp_path, timezone="America/New_York")

    assert [edition.edition for edition in editions] == [2025, 2026]
    # 2 November 2025 was also the morning the clocks went back.
    assert editions[0].waves[0].start == "2025-11-02T09:10:00-05:00"


def test_a_file_named_for_a_different_year_than_it_describes_is_rejected(synthetic_edition, tmp_path):
    (tmp_path / "editions").mkdir()
    (tmp_path / "editions" / "2027.yaml").write_text(yaml.safe_dump(synthetic_edition))

    with pytest.raises(EditionFactsInvalid, match=r"2027.yaml describes edition 2026"):
        load_editions(tmp_path, timezone="America/New_York")


def test_a_course_with_no_edition_facts_is_rejected(tmp_path):
    with pytest.raises(EditionFactsInvalid, match=r"no edition facts"):
        load_editions(tmp_path, timezone="America/New_York")


def test_berlin_2026_loads_with_every_timed_wave_on_summer_time():
    [edition] = [e for e in load_editions(COURSES / "berlin", timezone="Europe/Berlin") if e.edition == 2026]

    assert edition.date.day == "2026-09-27"
    timed = [wave for wave in edition.waves if wave.start is not None]
    # Late September in Berlin is CEST, UTC+2.
    assert timed and all(wave.start.endswith("+02:00") for wave in timed)
    assert all(wave.note for wave in edition.waves if wave.start is None)


def test_nyc_2026_is_the_morning_the_clocks_go_back_so_every_wave_is_on_standard_time():
    [edition] = [e for e in load_editions(COURSES / "nyc", timezone="America/New_York") if e.edition == 2026]

    assert edition.date.day == "2026-11-01"
    # EST (UTC-5). A day earlier, or a naive conversion, would say EDT (UTC-4): an hour of sun out.
    assert edition.waves and all(wave.start.endswith("-05:00") for wave in edition.waves)


@pytest.mark.parametrize(
    "damage, complaint",
    [
        (lambda e: e.update(carried_over="from 2025"), r"carried_over must be a block with `from_edition` and `reason`"),
        (lambda e: e.update(carried_over={"from_edition": 2025, "reason": 5}), r"carried_over needs a `reason` the runner can read"),
        (lambda e: e.update(waves="wave-1 at 09:10"), r"waves must be a list"),
        (lambda e: e["waves"].append("wave-3 at 10:20"), r"waves\[2\] must be a block with `id`, `name` and `start_local`"),
        (lambda e: e["waves"][0].update(id=["wave-1"]), r"waves\[0\] \(Wave 1\) id \['wave-1'\] must be lower-case"),
        (lambda e: e["waves"][0].update(carried_over="false"), r"waves\[0\] \(Wave 1\) carried_over must be true or false, not 'false'"),
        (lambda e: e.update(date="2026-11-01"), r"date is missing"),
    ],
)
def test_a_file_in_the_wrong_shape_is_explained_not_crashed_on(synthetic_edition, damage, complaint):
    damage(synthetic_edition)

    with pytest.raises(EditionFactsInvalid, match=complaint):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_an_empty_file_is_explained_not_crashed_on():
    with pytest.raises(EditionFactsInvalid, match=r"the file is empty"):
        parse_edition_facts(None, timezone="America/New_York")


def test_a_wave_with_no_start_time_cannot_be_carried_over(synthetic_edition):
    # There is nothing to carry over: the flag would grey out a time that isn't there.
    synthetic_edition["carried_over"] = {"from_edition": 2025, "reason": "Not published yet."}
    synthetic_edition["waves"][0]["carried_over"] = True
    synthetic_edition["waves"][1] |= {"start_local": None, "note": "Not published.", "carried_over": True}

    with pytest.raises(EditionFactsInvalid, match=r"waves\[1\] \(Wave 2\) is carried over but has no start time"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_a_date_the_organizer_has_not_confirmed_says_so_and_why(synthetic_edition):
    synthetic_edition["date"] |= {"confirmed": False, "note": "From the rule that the race is on the first Sunday in November."}

    edition = parse_edition_facts(synthetic_edition, timezone="America/New_York")

    assert edition.date.confirmed is False
    assert edition.date.note == "From the rule that the race is on the first Sunday in November."


def test_a_date_is_confirmed_unless_the_file_says_otherwise(synthetic_edition):
    assert parse_edition_facts(synthetic_edition, timezone="America/New_York").date.confirmed is True


def test_an_unconfirmed_date_with_no_explanation_is_rejected(synthetic_edition):
    synthetic_edition["date"]["confirmed"] = False

    with pytest.raises(EditionFactsInvalid, match=r"date is not confirmed, so it needs a `note`"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


# ── The organizer's aid stations ────────────────────────────────────────────────────────────


def with_stations(edition: dict, *stations: dict) -> dict:
    source = {"source": "https://example.org/course", "accessed": "2026-09-21"}
    edition["aid_stations"] = [{**source, **station} for station in stations]
    return edition


def test_stations_come_back_in_course_order_whatever_order_they_are_written_in(synthetic_edition):
    raw = with_stations(
        synthetic_edition,
        {"km_marked": 15, "label": "15 km", "serves": ["water", "sports-drink"], "detail": "Maurten DRINK MIX 160"},
        {"km_marked": 5, "label": "5 km", "serves": ["water"]},
    )

    stations = parse_edition_facts(raw, timezone="America/New_York").aid_stations

    assert [(s.km_marked, s.label, s.serves) for s in stations] == [
        (5.0, "5 km", ("water",)),
        (15.0, "15 km", ("water", "sports-drink")),
    ]
    assert stations[1].detail == "Maurten DRINK MIX 160"


def test_an_edition_with_no_stations_published_yet_simply_has_none(synthetic_edition):
    """Never an invented list: the app then has no Aid layer for that course at all."""
    assert parse_edition_facts(synthetic_edition, timezone="America/New_York").aid_stations == ()


def test_a_station_serving_something_the_app_has_never_heard_of_is_rejected(synthetic_edition):
    # The vocabulary is fixed because the fueling check reasons about it: "the next water" is only
    # a sentence the app can say if "water" is a thing it knows and not a phrase.
    raw = with_stations(synthetic_edition, {"km_marked": 5, "label": "5 km", "serves": ["water", "espresso"]})

    with pytest.raises(EditionFactsInvalid, match=r"aid_stations\[0\] \(5 km\) serves espresso, which is not one of water"):
        parse_edition_facts(raw, timezone="America/New_York")


def test_a_station_that_serves_nothing_is_rejected(synthetic_edition):
    raw = with_stations(synthetic_edition, {"km_marked": 5, "label": "5 km", "serves": []})

    with pytest.raises(EditionFactsInvalid, match=r"aid_stations\[0\] \(5 km\) needs `serves`"):
        parse_edition_facts(raw, timezone="America/New_York")


def test_a_station_without_a_source_is_rejected(synthetic_edition):
    synthetic_edition["aid_stations"] = [{"km_marked": 5, "label": "5 km", "serves": ["water"]}]

    with pytest.raises(EditionFactsInvalid, match=r"aid_stations\[0\] \(5 km\) has no source"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")


def test_two_stations_cannot_stand_at_the_same_kilometre(synthetic_edition):
    raw = with_stations(
        synthetic_edition,
        {"km_marked": 5, "label": "5 km", "serves": ["water"]},
        {"km_marked": 5, "label": "5 km again", "serves": ["gel"]},
    )

    with pytest.raises(EditionFactsInvalid, match=r"aid_stations\[1\] \(5 km again\) is at km 5, where another station already is"):
        parse_edition_facts(raw, timezone="America/New_York")


def test_a_carried_over_station_needs_the_edition_to_say_from_where_and_why(synthetic_edition):
    raw = with_stations(synthetic_edition, {"km_marked": 5, "label": "5 km", "serves": ["water"], "carried_over": True})

    with pytest.raises(EditionFactsInvalid, match=r"aid_stations\[0\] \(5 km\) is carried over, but the edition has no `carried_over`"):
        parse_edition_facts(raw, timezone="America/New_York")


def test_stations_alone_can_be_what_a_carry_over_explains(synthetic_edition):
    """The waves may be this year's while the refreshment list is last year's, which is exactly
    New York: the organizer publishes the stations late."""
    raw = with_stations(synthetic_edition, {"km_marked": 5, "label": "5 km", "serves": ["water"], "carried_over": True})
    raw["carried_over"] = {"from_edition": 2025, "reason": "The 2026 refreshment list is not published yet."}

    edition = parse_edition_facts(raw, timezone="America/New_York")

    assert edition.aid_stations[0].carried_over is True
    assert [w.carried_over for w in edition.waves] == [False, False]


def test_an_edition_that_explains_a_carry_over_with_nothing_carried_over_is_rejected(synthetic_edition):
    synthetic_edition["carried_over"] = {"from_edition": 2025, "reason": "Not published yet."}

    with pytest.raises(EditionFactsInvalid, match="nothing is marked `carried_over: true`"):
        parse_edition_facts(synthetic_edition, timezone="America/New_York")

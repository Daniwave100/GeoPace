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
    assert edition.date == "2026-11-01"
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

    assert edition.date == "2026-09-27"
    timed = [wave for wave in edition.waves if wave.start is not None]
    # Late September in Berlin is CEST, UTC+2.
    assert timed and all(wave.start.endswith("+02:00") for wave in timed)
    assert all(wave.note for wave in edition.waves if wave.start is None)


def test_nyc_2026_is_the_morning_the_clocks_go_back_so_every_wave_is_on_standard_time():
    [edition] = [e for e in load_editions(COURSES / "nyc", timezone="America/New_York") if e.edition == 2026]

    assert edition.date == "2026-11-01"
    # EST (UTC-5). A day earlier, or a naive conversion, would say EDT (UTC-4): an hour of sun out.
    assert edition.waves and all(wave.start.endswith("-05:00") for wave in edition.waves)
    assert all(not wave.carried_over or edition.carried_over for wave in edition.waves)

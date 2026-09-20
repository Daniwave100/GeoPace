"""The download cache: a read that drops is tried again, and never leaves half a file.

A city's own service is free and busy, and one build asks it for a marathon's worth of boxes:
before this, a read that timed out an hour in threw the whole build away (PLAN.md §8).
"""

import io
import urllib.error

import pytest

from geopace import cache


class FakeAnswer(io.BytesIO):
    """What urlopen gives back: a context manager the copier can read from."""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


@pytest.fixture(autouse=True)
def no_waiting(monkeypatch):
    monkeypatch.setattr(cache, "PAUSE_S", 0.0)


def openers(*answers):
    """A stand-in urlopen that gives each answer in turn; an exception is raised instead."""
    asked = []

    def urlopen(request, timeout=None):
        asked.append(request.full_url)
        answer = answers[min(len(asked), len(answers)) - 1]
        if isinstance(answer, Exception):
            raise answer
        return FakeAnswer(answer)

    return urlopen, asked


def test_a_whole_file_is_downloaded_once_and_then_read_from_the_cache(tmp_path, monkeypatch):
    urlopen, asked = openers(b"the city's answer")
    monkeypatch.setattr(cache.urllib.request, "urlopen", urlopen)
    dest = tmp_path / "box.xml"

    assert cache.download("https://example.org/box", dest).read_bytes() == b"the city's answer"
    cache.download("https://example.org/box", dest)  # already there: not asked for again

    assert asked == ["https://example.org/box"]


def test_a_read_that_times_out_is_tried_again(tmp_path, monkeypatch):
    urlopen, asked = openers(TimeoutError("the read operation timed out"), TimeoutError("again"), b"at last")
    monkeypatch.setattr(cache.urllib.request, "urlopen", urlopen)
    dest = tmp_path / "box.xml"

    assert cache.download("https://example.org/box", dest).read_bytes() == b"at last"
    assert len(asked) == 3


def test_half_a_file_is_never_left_where_a_whole_one_goes(tmp_path, monkeypatch):
    """A build stopped and started again has to pick up where it left off, not on a torn file."""
    urlopen, _ = openers(TimeoutError("dropped"))
    monkeypatch.setattr(cache.urllib.request, "urlopen", urlopen)
    dest = tmp_path / "box.xml"

    with pytest.raises(TimeoutError):
        cache.download("https://example.org/box", dest)

    assert not dest.exists()
    assert list(tmp_path.iterdir()) == []  # no .part left behind either


def test_it_gives_up_after_a_few_goes_rather_than_asking_for_ever(tmp_path, monkeypatch):
    urlopen, asked = openers(TimeoutError("down"))
    monkeypatch.setattr(cache.urllib.request, "urlopen", urlopen)

    with pytest.raises(TimeoutError):
        cache.download("https://example.org/box", tmp_path / "box.xml")

    assert len(asked) == cache.ATTEMPTS


def test_a_refusal_is_not_tried_again_because_the_answer_would_be_the_same(tmp_path, monkeypatch):
    refused = urllib.error.HTTPError("https://example.org/box", 403, "Forbidden", {}, None)
    urlopen, asked = openers(refused)
    monkeypatch.setattr(cache.urllib.request, "urlopen", urlopen)

    with pytest.raises(urllib.error.HTTPError):
        cache.download("https://example.org/box", tmp_path / "box.xml")

    assert len(asked) == 1

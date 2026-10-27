"""Local download cache for raw inputs. Never committed (see .gitignore)."""

import os
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "GeoPace-pipeline/0.1 (+https://github.com/Daniwave100/GeoPace)"

# A city's own service is free and busy, and a build asks it for a marathon's worth of boxes: one
# read that times out an hour in would otherwise throw away the whole build. Tried again, waiting
# a little longer each time. A refusal is not retried: asking again would get the same answer.
ATTEMPTS = 4
PAUSE_S = 3.0
# A stream that only drips is a stall too. Berlin's building service was seen to deliver a 4 MB
# page in four seconds to a fresh connection while the build's own stream of the same page had
# been dripping for forty minutes, a few bytes at a time: too slow to ever finish, too lively for
# the socket's timeout to fire (#43). So the answer is read a piece at a time, and a window this
# long that brings in less than STALL_BYTES is a stall: the connection is dropped and the page
# asked for again, afresh. A slow link is not a drip: half a kilobyte a second clears the bar.
# A stream that goes silent altogether is the socket's to catch: STALL_S is its timeout too, for
# each read. The window is checked as a piece lands, so a drip is given up on within two windows.
STALL_S = 120.0
STALL_BYTES = 64 * 1024
PIECE = 64 * 1024


def cache_dir() -> Path:
    """pipeline/.cache by default; set GEOPACE_CACHE_DIR to put it elsewhere."""
    default = Path(__file__).resolve().parents[2] / ".cache"
    path = Path(os.environ.get("GEOPACE_CACHE_DIR", default))
    path.mkdir(parents=True, exist_ok=True)
    return path


def download(url: str, dest: Path) -> Path:
    """Download url to dest unless it's already cached. Writes to a .part file first.

    A read that times out or drops is tried again; half a file is never left where a whole one
    goes, so a build that is stopped and started again picks up where it left off.
    """
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=STALL_S) as response, open(partial, "wb") as out:
                _copy_unless_it_stalls(response, out)
            partial.rename(dest)
            return dest
        except (TimeoutError, urllib.error.URLError, ConnectionError) as trouble:
            partial.unlink(missing_ok=True)
            if attempt == ATTEMPTS or isinstance(trouble, urllib.error.HTTPError):
                raise
            print(f"  retrying ({attempt} of {ATTEMPTS - 1}): {trouble}")
            time.sleep(PAUSE_S * attempt)
    raise AssertionError("unreachable")


def _copy_unless_it_stalls(response, out) -> None:
    """Copy the answer to the file a piece at a time, and give up on a stream that only drips."""
    window_started, window_bytes = time.monotonic(), 0
    while True:
        piece = response.read1(PIECE)  # whatever has arrived, up to a piece; empty at the end
        if not piece:
            return
        out.write(piece)
        window_bytes += len(piece)
        now = time.monotonic()
        if now - window_started >= STALL_S:
            if window_bytes < STALL_BYTES:
                raise TimeoutError(f"the stream stalled: {window_bytes} bytes in {now - window_started:.0f} s")
            window_started, window_bytes = now, 0

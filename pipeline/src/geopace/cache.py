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
            with urllib.request.urlopen(request, timeout=120) as response, open(partial, "wb") as out:
                shutil.copyfileobj(response, out)
            partial.rename(dest)
            return dest
        except (TimeoutError, urllib.error.URLError, ConnectionError) as trouble:
            partial.unlink(missing_ok=True)
            if attempt == ATTEMPTS or isinstance(trouble, urllib.error.HTTPError):
                raise
            print(f"  retrying ({attempt} of {ATTEMPTS - 1}): {trouble}")
            time.sleep(PAUSE_S * attempt)
    raise AssertionError("unreachable")

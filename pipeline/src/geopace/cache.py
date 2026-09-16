"""Local download cache for raw inputs. Never committed (see .gitignore)."""

import os
import shutil
import urllib.request
from pathlib import Path

USER_AGENT = "GeoPace-pipeline/0.1 (+https://github.com/Daniwave100/GeoPace)"


def cache_dir() -> Path:
    """pipeline/.cache by default; set GEOPACE_CACHE_DIR to put it elsewhere."""
    default = Path(__file__).resolve().parents[2] / ".cache"
    path = Path(os.environ.get("GEOPACE_CACHE_DIR", default))
    path.mkdir(parents=True, exist_ok=True)
    return path


def download(url: str, dest: Path) -> Path:
    """Download url to dest unless it's already cached. Writes to a .part file first."""
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, open(partial, "wb") as out:
        shutil.copyfileobj(response, out)
    partial.rename(dest)
    return dest

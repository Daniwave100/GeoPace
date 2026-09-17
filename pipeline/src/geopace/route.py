"""Route ingest: read a course file into (lat, lon) vertices.

Any <ele> values in the file are ignored on purpose: GPS elevation is too noisy to use.
Elevation comes from an official terrain model instead (see course_line.py).
"""

import xml.etree.ElementTree as ET


def parse_gpx(text: str) -> list[tuple[float, float]]:
    root = ET.fromstring(text)
    points = [
        (float(pt.attrib["lat"]), float(pt.attrib["lon"]))
        for pt in root.iter()
        if pt.tag.rsplit("}", 1)[-1] == "trkpt"  # ignore the XML namespace prefix
    ]
    if not points:
        raise ValueError("The GPX file has no track points (<trkpt>)")
    return points

"""GeoPace data pipeline: turns raw course inputs into committed Course Bundles."""

__version__ = "0.1.0"


def main() -> None:
    from geopace.cli import main as cli_main

    cli_main()

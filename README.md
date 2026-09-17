# GeoPace

Plan a marathon before you run it: the real course on a 3D globe, with a terrain-corrected
elevation profile that shows where it's actually hard.

> **Unofficial — not affiliated with any race organizer.** Early work in progress: Berlin only for now.

## Run the app

You need [Node.js](https://nodejs.org/) 22.12 or newer. No Python, account, or API key.

```sh
cd app && npm install && npm run dev
```

Then open http://localhost:5173.

The map and terrain are free, keyless services (OpenStreetMap tiles, Re:Earth Terrain), so the
app needs an internet connection.

## Rebuild the course data (optional)

The app reads prepared **Course Bundles** that are committed in `data/derived/`. You only need
this if you change the course facts or the pipeline. It needs [uv](https://docs.astral.sh/uv/).

```sh
cd pipeline && uv run geopace build berlin
```

The first run downloads the official course file and about 300 MB of Berlin terrain tiles into
`pipeline/.cache/` (never committed). Later runs reuse the cache.

## Tests

```sh
cd pipeline && uv run pytest     # pipeline (the real-data check runs only once the cache exists)
cd app && npm test               # app
cd app && npm run typecheck
```

## How it fits together

```
data/courses/berlin/course.yaml   hand-maintained course facts, each with a source URL
        │
pipeline/ (Python)                route → evenly spaced samples → official terrain heights
        │                          → bridges spanned → smoothed → grade → difficulty
        ▼
data/derived/berlin/course-bundle.json   committed; must match schema/course-bundle.schema.json
        │
app/ (TypeScript + CesiumJS)      validates the bundle, draws the route and the profile
```

- **Elevation** comes from Berlin's official 1 m ground model, never GPS. It is smoothed before
  grade is computed. The ground model leaves out bridge decks, so bridges listed in the course
  facts are carried straight across.
- **Difficulty** is the energy cost of running at that grade compared with flat ground, from
  [Minetti et al. 2002](https://doi.org/10.1152/japplphysiol.00103.2002). It isn't shown for
  grades outside that model's valid range.

## Data sources

| Data | Source | Licence |
|------|--------|---------|
| Berlin course route | [BMW BERLIN-MARATHON course file (2025)](https://www.bmw-berlin-marathon.com/en/your-race/course/) | Course geometry only; file not redistributed |
| Berlin elevation | [Geoportal Berlin, ATKIS® DGM1](https://gdi.berlin.de/data/dgm1/atom/) | [dl-de/zero-2.0](https://www.govdata.de/dl-de/zero-2-0) |
| Bridge locations | [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL |
| Map tiles | [OpenStreetMap](https://www.openstreetmap.org/copyright) ([tile policy](https://operations.osmfoundation.org/policies/tiles/)) | ODbL |
| 3D terrain | [Re:Earth Terrain](https://terrain.reearth.land/) · [Mapterhorn](https://mapterhorn.com/attribution) | CC BY 4.0 |

See [PLAN.md](PLAN.md) for scope, decisions, and the roadmap.

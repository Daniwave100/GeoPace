# GeoPace

Plan a marathon before you run it: the real course on a 3D globe, with a terrain-corrected
elevation profile that shows where it's actually hard.

> **Unofficial — not affiliated with any race organizer.** Early work in progress: Berlin and New York City.

## Run the app

You need [Node.js](https://nodejs.org/) 22.12 or newer. No Python, account, or API key.

```sh
cd app && npm install && npm run dev
```

Then open http://localhost:5173 and pick a course: **Berlin** or **New York City**.

Set **your race plan** (the edition, your start wave, and a goal as a finish time or a pace per
km), then drag the **kilometre strip** under the map, click it, or use the arrow keys. The runner
on the map, the time of day, the elapsed time and the sun all move together, in the race's own
time zone whatever zone your computer is in (the map dims as the sun gets low). Your plan is remembered in your browser and goes
nowhere else.

Times assume an even pace, and the app says so. Where a start time is the last edition's because
this one's isn't published, every time that rests on it is greyed and marked **carried over**, with
the reason; a race date the organizer hasn't stated yet is marked **not confirmed**. A wave whose
start time nobody has published is never filled with a guess: pick it and type in **your own start
time**, from your start card. You can do the same on any wave, and your own time always wins.

The map and terrain are free, keyless services (OpenStreetMap tiles, Re:Earth Terrain), so the
app needs an internet connection.

## Design mockups

The app's look isn't chosen yet. Three clickable directions show the same course, race plan and
layers three different ways; with the app running, open http://localhost:5173/mockups/ and try
each one:

- **A · Roadbook** — a survey sheet: the course runs down the page as a route card, and what
  runners say is written in the margin in purple pencil.
- **B · Race poster** — black, white and the blue line painted down a marathon course. Huge
  numerals on a strict grid; solid is measured, hollow is hearsay.
- **C · Field instrument** — a well log: stacked tracks, one crosshair, and the value under the
  cursor in every track's header.

Drag the kilometre strip (or focus it and use the arrow keys, Page Up/Down, Home/End): the
readout, the clock, and the sun and shadows on the street model move together. Elevation, grade,
difficulty and landmarks are real; sun exposure, wind, aid stations and runner reports are
invented placeholders and are marked as samples wherever they appear. The street model's
buildings are invented too, but its light is not: the sun is computed for that spot at the minute
you would get there.

## Rebuild the course data (optional)

The app reads prepared **Course Bundles** that are committed in `data/derived/`. You only need
this if you change the course facts or the pipeline. It needs [uv](https://docs.astral.sh/uv/).

```sh
cd pipeline && uv run geopace build berlin
cd pipeline && uv run geopace build nyc
```

The first run downloads the raw inputs into `pipeline/.cache/` (never committed): for Berlin the
official course file and about 300 MB of terrain tiles; for NYC the streets along the course, the
1-ft elevation model block by block, and the LiDAR points around each bridge. Only the corridor
along the course is ever fetched, never the whole city. Later runs reuse the cache.

## Tests

```sh
cd pipeline && uv run pytest     # pipeline (the real-data check runs only once the cache exists)
cd app && npm test               # app
cd app && npm run typecheck
```

## How it fits together

```
data/courses/<course>/course.yaml   hand-maintained course facts, each with a source URL
data/courses/<course>/editions/     one file per edition: the race date and the start waves
        │
pipeline/ (Python)                  route → evenly spaced samples → official terrain heights
        │                            → bridge decks → smoothed → grade → difficulty
        ▼
data/derived/<course>/course-bundle.json   committed; must match schema/course-bundle.schema.json
        │
app/ (TypeScript + CesiumJS)        validates the bundle, draws the route and the profile,
                                    and times your race along it
```

- **The route** is the organizer's own course file where there is one (Berlin). New York publishes
  none you can download, so its course facts list the turn points — taken from the city's official
  list of closed course streets — and the pipeline traces them along OpenStreetMap streets. That
  line is checked street by street against the city's list, and its start line comes from the
  course's USATF certification, which records how far apart the start and finish are.
- **Elevation** comes from each city's official ground model, never GPS. It is smoothed before
  grade is computed.
- **Bridges** are missing from those models: they are bare-earth, so a bridge reads as the water
  underneath (New York's start on the Verrazzano would sit at sea level). Berlin's low, flat city
  bridges are carried straight across. New York's are measured from the 2017 city LiDAR, using the
  returns classified as bridge deck — including which of the two decks runners actually use: the
  Verrazzano's upper level, the Queensboro's lower level.
- **Race dates and start waves** are written down per edition from the organizer's own pages. Wave
  times are local wall-clock times; the pipeline turns each into an exact instant in the course's
  time zone, and the app works it out again independently, so the two check each other. That
  matters in New York, where the 2026 race falls on the morning the clocks go back.
- **Difficulty** is the energy cost of running at that grade compared with flat ground, from
  [Minetti et al. 2002](https://doi.org/10.1152/japplphysiol.00103.2002). It isn't shown for
  grades outside that model's valid range.

## Data sources

| Data | Source | Licence |
|------|--------|---------|
| Berlin course route | [BMW BERLIN-MARATHON course file (2025)](https://www.bmw-berlin-marathon.com/en/your-race/course/) | Course geometry only; file not redistributed |
| Berlin elevation | [Geoportal Berlin, ATKIS® DGM1](https://gdi.berlin.de/data/dgm1/atom/) | [dl-de/zero-2.0](https://www.govdata.de/dl-de/zero-2-0) |
| NYC course streets | [City of New York course street closures (2025)](https://www.nyc.gov/assets/cecm/downloads/pdf/marathon-street-closures-no-parking-2025.pdf) · [NYRR](https://www.nyrr.org/tcsnycmarathon/race-day/the-course) | Facts about which streets the course uses |
| Berlin race date and first start | [BMW BERLIN-MARATHON race day page](https://www.bmw-berlin-marathon.com/en/your-race/race-day-for-runners) | Facts, paraphrased |
| NYC race-date rule and 2025 wave times (carried over) | [NYRR 2025 runner guide](https://webassets.nyrr.org/nyrrwebsiteassets/TCSNYCM25_RunnerGuide_Mobile_M.pdf) | Facts, paraphrased |
| NYC start line | [USATF course certification NY22001JHP](https://certifiedroadraces.com/certificate/?type=l&id=NY22001JHP) | Published measurement of the certified course |
| NYC elevation | [2017 NYC 1-ft bare-earth DEM](https://www.fisheries.noaa.gov/inport/item/64732) (City of New York, via NOAA Digital Coast) | [NYC Open Data: no usage restrictions](https://opendata.cityofnewyork.us/faq/) |
| NYC bridge decks | [2017 NYC Topobathymetric LiDAR](https://www.fisheries.noaa.gov/inport/item/64728) (City of New York, via NOAA Digital Coast) | as above |
| Street geometry, bridge locations | [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL |
| Map tiles | [OpenStreetMap](https://www.openstreetmap.org/copyright) ([tile policy](https://operations.osmfoundation.org/policies/tiles/)) | ODbL |
| 3D terrain | [Re:Earth Terrain](https://terrain.reearth.land/) · [Mapterhorn](https://mapterhorn.com/attribution) | CC BY 4.0 |

See [PLAN.md](PLAN.md) for scope, decisions, and the roadmap.

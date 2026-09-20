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

The app opens on **Explore**: the city from above with the course on it as a blue line, moved like any
maps app (drag, scroll, Ctrl + drag to tilt; or focus the map and use the arrow keys and + / −). Nothing
is drawn on the ground — it is plain paper — and either side of the course stands the **white model**: the
city's real buildings, from each city's own open data, as plain white blocks. Their shadows are the shadows
that will be there on race day, because the geometry is ours and the sun is worked out for the minute you
reach each kilometre. Zoom in and watch them swing as you drag the strip. Laid
over the map: the distance as one giant numeral, the time of day, the elapsed time, and **one
sentence** about where you are ("Climbing 4%. Ed Koch Queensboro Bridge in 600 m. Sun on your left.").
Along the bottom is the **strip**, the whole course as one line: drag it, click it, or use the arrow
keys, and the runner on the map, the clock, the sentence and the sun all move together, in the race's
own time zone whatever zone your computer is in.

Switch **Hills** on and three things happen at once: every climb and descent is marked on the course
line (yellow fading to deep red going up, aqua fading to deep teal coming down: the darker, the
steeper) with a label saying how steep and how long it is, the strip gains its Grade and Effort rows, and the sentence
says what the road is doing under you. Switch it off and all three go. **Show everything** opens every
row. Where the survey has no height (the middle of the Verrazzano's main span),
the map, the strip and the sentence all say **not measured here** instead of drawing a guess.

Drag the strip's **top edge** to make its rows taller or to give the map the room. On the map,
**Full map** (or F) gives it the whole screen and **Straight down** (or B) looks from directly above
like a paper map.

Press **Ride the course**, on the map, and the runner is carried from the start to the finish as a
time-lapse past each **Stop** (the start, every landmark, the big climbs, the finish): seen from above at one
smooth pace, about a minute and a half for the whole course. The button becomes a player: where the Ride is
among the Stops, **Back** to the Stop just passed, play or pause (the **space bar** does the same),
which camera, and the way back to the map; and scrubbing the strip moves the Ride. Two cameras, switched whenever you like: **From above**, and **On the
road**, which follows a few metres up and behind like the lead vehicle's camera, at a gentler
time-lapse that slows at each Stop and into corners: ten to twelve minutes for the whole course. The readout, the sentence, the layer that is on and the sun keep up. **Drag the map and the camera is
yours to turn**: it orbits the runner, scrolling moves in and out, and the Ride plays on — the two cameras
give their place to **Go back to cinematic**, which hands the camera back to the Ride. If your system asks for reduced motion, nothing glides:
the Ride steps from Stop to Stop. **Back to the map** returns to Explore.

**Your race plan** opens from the banner: the edition, your start wave, and a goal as a finish time
or a pace, with a table of splits whose rows jump the runner there. The banner also switches between
**km and miles** (everything follows: feet, pace per mile, splits per mile) and between **light and
dark**. Your plan and your choices are remembered in your browser and go nowhere else.

Times assume an even pace, and the app says so. Where a start time is the last edition's because
this one's isn't published, every time that rests on it is greyed and marked **carried over**, with
the reason; a race date the organizer hasn't stated yet is marked **not confirmed**. A wave whose
start time nobody has published is never filled with a guess: pick it and type in **your own start
time**, from your start card. You can do the same on any wave, and your own time always wins.

**Buildings** and **Shadows** are two switches on the map, under "Make it photoreal". Shadows are the
expensive part of a 3D scene: they are as good as the engine will give, and either of the two can be
turned off on a computer that can't spare the work.

The ground's shape comes from a free, keyless terrain service (Re:Earth Terrain), so the app needs an
internet connection for it. If it can't be reached, the course, the strip, the layers and the Ride all
still work, over flat ground. The buildings come from GeoPace's own committed files and need nothing.

### Make it photoreal (optional)

Press **Make it photoreal** on the map to see the course over Google's photographed 3D city. That
imagery needs a key, and GeoPace can't come with one, so it uses yours. The panel says where to get
one, roughly how long it takes and what it costs:

- a **Cesium ion token** is free for personal, non-commercial use and takes about five minutes;
- a **Google Maps key** needs a Google Cloud project with billing switched on; the first 1,000
  loads a month are free, then Google charges $6.00 per 1,000. (Checked 2026-09-18; the panel links
  each provider's own page.)

Your key stays in your browser. It is never written to GeoPace's files, and it is sent only to the
provider it belongs to; **Forget my key** removes it. Everything else works without a key, and if
the imagery can't be had (a refused key, a used-up allowance, no connection) you are back on the
plain map with a message saying why. Photoreal is for looking at: its shadows were there when the
city was photographed, so GeoPace's numbers never come from it — which is exactly why the white model
exists, and why it steps aside while the photographed city is on screen.

Over the imagery the course is drawn at the road's own height, from GeoPace's own survey data, so
it stays on the road as you move the camera: under the trees in Central Park, and on the deck the
runners actually use on the Queensboro Bridge.

## Design mockups

The app's look was chosen from three clickable directions that show the same course, race plan and
layers three different ways. **B · Race poster** won, with the Field instrument's charts. They are
still there to look at; with the app running, open http://localhost:5173/mockups/:

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
1-ft elevation model block by block, and the LiDAR points around each bridge. Both also fetch their
city's buildings, a kilometre of course at a time, and the worldwide geoid grid (80 MB, fetched
once). Only the corridor along the course is ever fetched, never the whole city. Later runs reuse
the cache.

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
        │                            → height above the ellipsoid, for the 3D scene
        ▼
data/derived/<course>/course-bundle.json   committed; must match schema/course-bundle.schema.json
data/derived/<course>/white-model.json     committed; the buildings along the course, as blocks
        │                                  (schema/white-model.schema.json; the bundle names it)
        ▼
app/ (TypeScript + CesiumJS)        validates the bundle, draws the route and the profile,
                                    stands the city's buildings beside it with real shadows,
                                    and times your race along it
```

- **The route** is the organizer's own course file where there is one (Berlin). New York publishes
  none you can download, so its course facts list the turn points — taken from the city's official
  list of closed course streets — and the pipeline traces them along OpenStreetMap streets. That
  line is checked street by street against the city's list, and its start line comes from the
  course's USATF certification, which records how far apart the start and finish are.
- **Elevation** comes from each city's official ground model, never GPS. It is smoothed before
  grade is computed.
- **The buildings** are each city's own: Berlin's published building heights, worked out by the city
  from its LoD2 3D models and laid on the cadastre's outlines; New York's Building Footprints, whose
  roof heights are kept current and so know about a decade of towers the 2017 LiDAR doesn't. Each is
  read only within 150 m of the course and written as one file beside the bundle — about 3 MB a city,
  committed, so the app needs nothing at run time. A block is flat-topped: where a city publishes the
  ridge of a pitched roof, the block stands as tall as the ridge. Nothing is drawn on the ground they
  stand on: no map, photographed or otherwise, only the design's own paper and the shadows.
- **Bridges** are missing from those models: they are bare-earth, so a bridge reads as the water
  underneath (New York's start on the Verrazzano would sit at sea level). Berlin's are read from the
  city's surface model, which still has them. New York's are measured from the 2017 city LiDAR, using the
  returns classified as bridge deck — including which of the two decks runners actually use: the
  Verrazzano's upper level, the Queensboro's lower level.
- **The height the 3D scene needs** is not the height a runner is told. Surveys count from sea level;
  a 3D globe counts from a smooth mathematical surface, the ellipsoid, which sea level sits 32.5 m
  under in New York and 39.5 m over in Berlin. The pipeline adds that difference to every point from a
  published worldwide model (EGM2008), so the app can draw the course at the road's own height over
  photoreal imagery without ever measuring anything off Google's surface.
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
| Berlin bridge decks | [Geoportal Berlin, ATKIS® DOM1](https://gdi.berlin.de/data/dom/atom/) | [dl-de/zero-2.0](https://www.govdata.de/dl-de/zero-2-0) |
| NYC course streets | [City of New York course street closures (2025)](https://www.nyc.gov/assets/cecm/downloads/pdf/marathon-street-closures-no-parking-2025.pdf) · [NYRR](https://www.nyrr.org/tcsnycmarathon/race-day/the-course) | Facts about which streets the course uses |
| Berlin race date and first start | [BMW BERLIN-MARATHON race day page](https://www.bmw-berlin-marathon.com/en/your-race/race-day-for-runners) | Facts, paraphrased |
| NYC race-date rule and 2025 wave times (carried over) | [NYRR 2025 runner guide](https://webassets.nyrr.org/nyrrwebsiteassets/TCSNYCM25_RunnerGuide_Mobile_M.pdf) | Facts, paraphrased |
| NYC start line | [USATF course certification NY22001JHP](https://certifiedroadraces.com/certificate/?type=l&id=NY22001JHP) | Published measurement of the certified course |
| NYC elevation | [2017 NYC 1-ft bare-earth DEM](https://www.fisheries.noaa.gov/inport/item/64732) (City of New York, via NOAA Digital Coast) | [NYC Open Data: no usage restrictions](https://opendata.cityofnewyork.us/faq/) |
| NYC bridge decks | [2017 NYC Topobathymetric LiDAR](https://www.fisheries.noaa.gov/inport/item/64728) (City of New York, via NOAA Digital Coast) | as above |
| Height above the ellipsoid, both cities | [EGM2008 geoid model](https://earth-info.nga.mil/index.php?dir=wgs84&action=wgs84) (U.S. National Geospatial-Intelligence Agency), as the [PROJ project's GeoTIFF](https://cdn.proj.org/us_nga_egm08_25.tif) | Public domain |
| Street geometry, bridge locations | [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL |
| Map tiles | [OpenStreetMap](https://www.openstreetmap.org/copyright) ([tile policy](https://operations.osmfoundation.org/policies/tiles/)) | ODbL |
| 3D terrain | [Re:Earth Terrain](https://terrain.reearth.land/) · [Mapterhorn](https://mapterhorn.com/attribution) | CC BY 4.0 |
| Photoreal 3D city (optional, with your own key) | [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles), direct or through [Cesium ion](https://cesium.com/platform/cesium-ion/pricing/) | [Google's Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies): display only, never stored; Google's logo and data credits stay on the map |

See [PLAN.md](PLAN.md) for scope, decisions, and the roadmap.

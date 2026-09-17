# GeoPace — Master Plan

> The single source of truth for **what** GeoPace is, **what's decided**, and **what's next**.
> Edit this file whenever a decision changes. Every decision records *why*, so it can be
> revisited deliberately instead of silently drifting.
>
> Status legend: ✅ decided · 🟡 open (needs a decision) · 🔍 fact still to verify · ⛔ ruled out

---

## 1. Vision

An open-source app for planning a marathon **before** you run it.

A runner picks a course and gets a 3D flyover of the real city with accurate race-day sun and
shadows, plus every planning layer that today lives scattered across race PDFs, forum posts, and
word of mouth: where the hills actually hurt, where you'll be in direct sun and at what clock
time, which way the wind usually blows on that date, whether the aid stations line up with your
fueling plan, which turns cost you distance, where the crowd disappears, what the pavement is
like, and where your watch will lie to you.

**The rally driver's roadbook, applied to road racing.**

**Who it's for:** marathon runners 2–8 weeks before a race, when obsessive course research is the
norm and the available information is bad. Secondary: their spectators.

**Why it doesn't exist:** organizers publish a static elevation chart and a PDF map. Strava and
Garmin analyze what you *did*, not what you're *about to do*. Nobody joins terrain, solar
geometry, weather climatology, and race logistics into one planning surface — and nobody treats
courses as community-maintained open data.

**Owner's goal:** a genuinely good open-source project that earns recognition (GitHub stars).
Success for v1 = a few hundred stars within a few months of launch.

---

## 2. Product principles

1. **Free, open source, no accounts.** Nothing behind a login.
2. **Courses are data, not code.** Eventually a runner adds their home marathon by PR with data
   files, without reading app source. *(The contributor-facing format is deferred past v1 — but
   v1 must still keep course data in plain files, separate from code, so the door stays open.)*
3. **Measured and subjective data are always visually distinct.** Never blend them into one number.
4. **Every claim about the world carries a source.**
5. **Honest about uncertainty.** Distributions and ranges over false precision. Gray out numbers
   whose preconditions aren't met.
6. **Good enough to screenshot.** Visual quality is a feature, not polish.
7. **Unique, clean, and new.** *(Added 2026-09-16.)* GeoPace must not look like another dark
   glass-HUD 3D map. It should have its own recognizable visual identity. See §6.

---

## 3. Decision log

| # | Decision | Why | Date |
|---|----------|-----|------|
| D1 | ✅ **v1 scope: Berlin + NYC only.** World Marathon Majors later; not in scope now. | Two courses prove the app isn't hard-coded to one city; NYC stresses elevation (bridges) and shade (canyons). | 09-16 |
| D2 | ✅ **Runs locally** (clone + run). No hosted site for v1. | Owner's choice. Architecture stays static (no server), so a free hosted link remains a one-step option later. | 09-16 |
| D3 | ✅ **Keyless by default; photoreal is bring-your-own-key.** Users paste their own Cesium ion token or Google Maps key. No project-owned keys ship. | Brief forbids shipping keys; zero cost to the maintainer. | 09-16 |
| D4 | ✅ **Two render modes.** *Analysis mode* (default, keyless): open city 3D buildings with live shadows that exactly match the computed shade numbers. *Photoreal mode* (user key): Google Photorealistic 3D Tiles, visual only. | Photoreal meshes have baked-in shadows and Google content can't be cached or used to derive data; analysis mode is the honest, keyless view. | 09-16 |
| D5 | ✅ **Google is visual-only.** ⛔ Google Solar API is ruled out. | Maps Service Terms §20.1 restrict the Solar API to energy-system feasibility/design; §20.2 caps caching at 30 days; $75/1k Data Layers requests. Map Tiles content can't be cached or derived from. | 09-16 |
| D6 | ✅ **Shade computed from each city's own open LiDAR/surface data**, precomputed in Python. | Legal, keyless, full-course coverage, trees measured directly rather than estimated. | 09-16 |
| D7 | ✅ **Tree shade is shown as a range**: buildings-only vs. buildings + full-leaf trees ("55–80% sun; the spread is trees"). Building and tree shade styled differently. | Leaf state varies (NYC LiDAR is 50% leaf-off; Nov 1 in NYC is mid-fall; Berlin late Sept is full leaf). Any single transmittance factor would be invented precision. | 09-16 |
| D8 | ✅ **GPS trouble layer = two distinct layers**: (a) forum-researched reports, paraphrased with links, marked subjective; (b) a measured "urban canyon" score from building/surface geometry. ⛔ No aggregation of Strava/Garmin tracks. | ToS risk on third-party tracks; the canyon score falls out of the shade pipeline's surface model for free. | 09-16 |
| D9 | ✅ **Build order: the course line (distance axis + terrain-corrected elevation) first.** | Every other layer indexes by km along the course. | 09-16 |
| D10 | ✅ **Launch target ≈ 2026-10-18**, two weeks before the NYC Marathon (🔍 date believed Nov 1). Repo private until the flyover + shade demo works, then public with a 30–60s photoreal clip. Owner posts; Claude drafts. Name stays GeoPace. | NYC is inside its 2–8 week research window now; Berlin 2026 (Sept 27) is too close. | 09-16 |
| D11 | ✅ **Frontend visual design is original** — Godseye is inspiration for the *idea* and the key model only, not the look. | Owner directive. | 09-16 |
| D12 | ✅ Code license **MIT**. Footer: "Unofficial — not affiliated with any race organizer." No race logos, no copies of organizer maps. | Low-friction OSS; trademark/copyright hygiene. | 09-16 |
| D13 | ✅ **Design is chosen from 3 contrasting clickable mockups**: (a) Roadbook — editorial/print, (b) Race poster — bold graphic, (c) Field instrument — light scientific. Owner picks or mixes. | "Unique" is easier to recognize than to specify. Runs in parallel with step 1. | 09-16 |
| D14 | ✅ **The km strip is the spine of the UI.** Every layer aligns by km; scrubbing moves runner, clock, sun, and camera together. | A recognizable interaction no 3D map app has. | 09-16 |
| D15 | ✅ **Analysis mode looks like an architectural model**: matte untextured buildings on a quiet ground, real shadows as the hero. *(Accepted by default; owner can revisit on seeing mockups.)* | Distinct from Google Earth / game looks; contrasts with photoreal mode. | 09-16 |
| D16 | ✅ **Keyless map providers: OpenStreetMap standard tiles + Re:Earth Terrain** (quantized-mesh from Mapterhorn). ⛔ Esri World Imagery and CARTO raster basemaps. | Esri basemaps now need an ArcGIS key; CARTO raster tiles are watermarked without a key. OSM tiles are keyless with visible attribution and no bulk/offline fetching; Re:Earth Terrain is keyless, CORS-open, and loads natively in CesiumJS. Both are best-effort with no SLA, so the look may switch to a quieter basemap once the design is picked. | 09-16 |
| D17 | ✅ **Difficulty = Minetti et al. 2002 running energy cost relative to flat**, only for grades within the model's measured −45%…+45% range (outside it: null, grayed out). | A published, widely cited physiological model instead of an invented score. | 09-16 |
| D18 | ✅ **Bridge decks the ground model drops are listed as sourced course facts** (km span + OpenStreetMap way) and spanned in a straight line between the two ends. | Berlin DGM1 omits most decks: the Moltkebrücke read as the Spree 6 m below and faked a −4.7% grade. A straight span is right for low, flat city bridges. NYC's high bridges still need deck heights from surface data (#3). | 09-16 |
| D19 | ✅ **Course Bundle = one JSON file per course**, `data/derived/<id>/course-bundle.json`, validated on both sides against `schema/course-bundle.schema.json` (`schema_version` 1). Measured data (and values computed from it by published models, like difficulty) sits under `measured`; subjective data will get its own section. Every landmark carries its source into the bundle. | One versioned contract; drift is caught when loading instead of showing wrong numbers. Berlin's bundle is ~210 KB. | 09-16 |
| D20 | ✅ **One distance scale per course: km measured along the course line** (Berlin: 42.28 km; NYC: 42.77 km). Landmarks and bridge spans use it too; certified positions (half, finish) are scaled onto it. *Revisit in #12:* organizer km (aid stations, km signs) sit on the certified scale and must be converted, or the line rescaled to 42.195 km. | Mixing scales put the Finish marker ~90 m before the end of the line. The 0.2% gap is real (street line vs shortest legal line) and small, but it must not be silently mixed. | 09-16 |
| D21 | ✅ **NYC's route is traced, not downloaded.** ⛔ No organizer course file exists that anyone can fetch: NYRR publishes a PDF map, and its own course on Strava needs a login. Instead `data/courses/nyc/course.yaml` lists the Blue course's turn points in order — taken from the City of New York's official list of closed course streets ("street, from–to") and NYRR's closures page and map — and the pipeline traces them along OpenStreetMap streets (shortest path, footpaths penalised). | Keeps the one documented command working with no key and no login, keeps the course as reviewable data rather than an opaque file, and every turn carries an official source. The risk is a wrong street, which the length check and the profile catch. | 09-17 |
| D22 | ✅ **A traced route gets a wider length tolerance: ±2.5%** (course files stay at ±1%). NYC traces to 42.77 km vs the certified 42.195 km (+1.4%). | Street centre lines take every corner wide and run down the middle of wide avenues and bridge ramps, so they are inherently longer than the shortest legal line a course is measured along. The tolerance still catches a genuinely wrong route. | 09-17 |
| D23 | ✅ **NYC bridge decks come from the 2017 city LiDAR** (returns classified "bridge deck"), read straight out of NOAA's Cloud-Optimized Point Cloud copies over HTTP, corridor only. Where two decks are stacked, the course facts say which one runners use (`deck: upper` for the Verrazzano, `lower` for the Queensboro). A layer with far fewer returns than the busiest one is a ramp or walkway passing over, not a deck. | NYC's bare-earth DEM removes every deck: the Verrazzano start read as sea level. Berlin's straight-span trick (D18) can't work for high bridges with long ramps. The LiDAR measures the real deck, including the 6.4 m between the Queensboro's two levels. | 09-17 |
| D24 | ✅ **NYC elevation = the 2017 1-ft bare-earth DEM** (same flight as the bridge decks), read block by block from NOAA's Cloud-Optimized GeoTIFFs. ⛔ NYC Open Data's own 1-ft DEM download (a single 3.3 GB zip, 2010 LiDAR). | Same scan and datum as the decks, and a COG can be read ~156 m block at a time so a build downloads the corridor instead of 20 GB. | 09-17 |

---

## 4. Architecture

### 4.1 Stack
| Layer | Choice | Status |
|-------|--------|--------|
| 3D engine | **CesiumJS** — built-in sun position from a clock, shadow maps, timeline, terrain, 3D Tiles (incl. Google photoreal) | ✅ |
| Frontend language | **TypeScript** | ✅ |
| Build/dev server | **Vite** | ✅ |
| UI framework | **Svelte 5** (proposed): small bundles, built-in transitions for a polished custom UI, less boilerplate than React. *The first slice uses plain TypeScript DOM code so nothing depends on the pick yet.* | 🟡 confirm with design direction |
| Charts | Hand-built SVG/D3 for the km-strip (custom look matters more than a chart library's defaults) | 🟡 |
| Data pipeline | **Python**, managed with **uv**; tests with pytest | ✅ |
| Hosting | None for v1 (local). Static build → free host later if wanted | ✅ |

### 4.2 Precompute vs. runtime
**Precomputed in Python, results committed to the repo** (the app never needs Python to run):
- Course line: resampled geometry, cumulative distance, terrain-corrected + smoothed elevation, grade
- Shade: per course sample point × every 5 min over race day → sun/building/tree occlusion flags
- Urban canyon score per sample point (sky-view factor from the same surface model)
- Wind climatology per course segment (head/tail/cross distributions)
- Sharp turns derived from geometry (Tier 2, cheap to add alongside the course line)

**Computed live in the browser:**
- Runner position vs. clock (goal pace + chosen start wave) → lookup into precomputed shade
- Fueling-plan checks against aid stations
- Rendering, camera, sun/shadow visuals

**Never committed:** raw downloads (LiDAR tiles, DEMs, weather archives) — fetched into a local
cache by the pipeline. Only compact derived results are committed.

### 4.3 Proposed repo layout (🟡 refine at scaffold time)
```
app/                 # Vite + TS + Cesium frontend
pipeline/            # Python (uv): download → derive → export
data/
  courses/<id>/      # hand-maintained, sourced course facts (YAML) — future contributor format
  derived/<id>/      # pipeline outputs consumed by the app (committed)
docs/                # design notes, data provenance
PLAN.md              # this file
CLAUDE.md            # working conventions for Claude (created after plan confirmation)
```

---

## 5. Data sources

| Need | Berlin | NYC | License | Status |
|------|--------|-----|---------|--------|
| Course route | ✅ Organizer's own GPX: [BM25_Marathon-Strecke.gpx](https://www.bmw-berlin-marathon.com/fileadmin/media/events/berlinmarathon/gpx/BM25_Marathon-Strecke.gpx), linked from the [course page](https://www.bmw-berlin-marathon.com/en/your-race/course/). 508 points, no elevation; 42.285 km measured on the WGS84 ellipsoid (+0.2% vs certified). No 2026 file yet (BM26 → 404, 2026-09-16). | ✅ No downloadable file exists (⛔ NYRR's map is a PDF; ⛔ its Strava route needs a login). Traced from the [City of New York's 2025 course street closures](https://www.nyc.gov/assets/cecm/downloads/pdf/marathon-street-closures-no-parking-2025.pdf) + [NYRR's closures](https://www.nyrr.org/info/2025tcsnewyorkcitymarathon/2025-street-closures) and [course map](https://webassets.nyrr.org/nyrrwebsiteassets/TCSNYCM25_Map_Course_102925_M3.pdf) onto OpenStreetMap streets (D21). 42.77 km measured (+1.4% vs certified). Start line position is NYRR's map, ±~250 m. | Road geometry is factual; which streets are closed is an official fact, paraphrased as waypoints; street geometry ODbL | ✅ both |
| Bare-earth elevation | ✅ [ATKIS® DGM1](https://gdi.berlin.de/data/dgm1/atom/) via ATOM feed: 2×2 km zips of "E N H" text, EPSG:25833, 1 m cells, DHHN2016 heights, ~17 MB each; the course needs 18 tiles. Feed updated 2025-12-18. **Most bridge decks are missing** (D18). | ✅ 2017 NYC 1-ft bare-earth DEM, 31 Cloud-Optimized GeoTIFFs (~20 GB total, EPSG:6539, NAVD88 feet) on [NOAA Digital Coast](https://www.fisheries.noaa.gov/inport/item/64732); read 512 px (~156 m) blocks along the corridor. Every deck removed — the Narrows read as sea level (D24). | Berlin ✅ [dl-de/zero-2.0](https://www.govdata.de/dl-de/zero-2-0) (no attribution required; we credit anyway) · NYC ✅ [NYC Open Data: no usage restrictions](https://opendata.cityofnewyork.us/faq/) (Local Law 11 of 2012, NYC Admin. Code § 23-504); NOAA copy has no access constraints | ✅ both |
| Surface model (buildings + trees) | DOM / bDOM, ALS LiDAR, Vegetation heights 2020 | 2017 topobathy LiDAR (8 pts/m², May 3–17 2017, 50% leaf-off; 180 GB citywide, per-tile download) | Berlin: dl-de/zero-2.0 · NYC: 🔍 NYC Open Data terms | ✅ found |
| Buildings | 3D building models LoD2 | Building Footprints w/ roof heights (updated 2026; preferred over 2017 LiDAR for new towers) | as above | ✅ found |
| Tree canopy | Vegetation heights 2020 | 6-inch Land Cover 2017 | as above | ✅ found |
| Historical weather | Open-Meteo historical archive (ERA5), keyless | same | CC BY 4.0, attribution required | 🔍 rate limits, window |
| Keyless basemap / terrain | ✅ [OpenStreetMap standard tiles](https://operations.osmfoundation.org/policies/tiles/) (attribution visible, no bulk/offline pre-fetching, Referer sent) + [Re:Earth Terrain](https://terrain.reearth.land/) quantized-mesh `cesium-mesh/ellipsoid` ("no signup, no API key", best-effort, may rate-limit heavy clients; attribution "Re:Earth Terrain · Mapterhorn (CC BY 4.0)"). ⛔ Esri (needs key) · ⛔ CARTO raster (watermarked without key). Candidate quieter basemap for Berlin: [basemap.de Web Raster](https://basemap.de/produkte-und-dienste/web-raster/) grayscale (CC BY 4.0, Germany only). | same | OSM: ODbL · Mapterhorn: CC BY 4.0 | ✅ (D16) |
| Bridge locations | ✅ OpenStreetMap ways, listed per bridge in `data/courses/berlin/course.yaml` | ✅ same, in `data/courses/nyc/course.yaml` (9 spans, incl. the five famous bridges) | ODbL, attribution in bundle | ✅ both |
| Bridge deck heights | n/a — decks spanned straight (D18) | ✅ [2017 NYC Topobathymetric LiDAR](https://www.fisheries.noaa.gov/inport/item/64728), class 17 (bridge deck), as COPC tiles on NOAA Digital Coast; only the corridor around each bridge is read (D23). ⚠️ No returns at all over the middle of the Verrazzano's main span (~km 0.85–1.45): that stretch is a straight line between measured deck heights, so the real crest is a few meters higher. | NYC Open Data / NOAA, as above | ✅ NYC |
| Photoreal 3D | Google Photorealistic 3D Tiles via user's key or Cesium ion token | same | Google ToS: no caching, attribution required · ion Community = personal/non-commercial | ✅ |
| Aid stations | 🔍 organizer site (paraphrase + source link) | 🔍 NYRR (2026 may publish late) | Facts, not copied layouts | 🔍 |
| Race date / start waves | Sept 27, 2026 (✅ official site) | 🔍 believed Nov 1, 2026; wave times TBD | — | 🔍 |
| GPS trouble reports | Forums (Reddit, LetsRun…) paraphrased + linked | same | Link + paraphrase only | ✅ approach |
| Transit (Tier 3) | 🔍 VBB GTFS | 🔍 MTA GTFS | — | later |

---

## 6. Design & identity — 🟡 OPEN (current decision frontier)

**Directive:** neat, clean, and above all **unique and new**. Not Godseye's look; not the generic
dark HUD every 3D map demo uses.

**Decided:** km strip as UI spine (D14) · architectural-model analysis mode (D15) · choose via 3 mockups (D13).

**Still open:** which of the three directions (or a mix) wins.

**Starting thesis:**
- **The course is the interface.** One continuous kilometer strip — the "roadbook" — where every
  layer (elevation/grade, sun exposure range, wind, aid stations, GPS warnings) is aligned by km.
  Scrubbing the strip moves the runner, the clock, the sun, and the camera together.
- **Analysis mode as an architectural model**: untextured, matte buildings on a quiet ground,
  where crisp real shadows are the hero. Looks like a physical city maquette, not a video game.
- **Measured vs. subjective encoded visually** (e.g. solid ink for measured data, hand-annotated
  style for forum/opinion data) so principle 3 is part of the aesthetic, not a legend footnote.

**Open questions:**
- 🟡 Pick direction from mockups: (a) Roadbook · (b) Race poster · (c) Field instrument — or a mix
- 🟡 Light vs. dark default; typography; color system (falls out of the pick)

---

## 7. Roadmap

### v1 — Berlin + NYC (target ≈ 2026-10-18)
1. **Course line** (Python): route ingest, resample, distance axis, terrain-corrected + smoothed
   elevation, NYC bridge-deck patching, grade. Tests: distance within tolerance of certified 42.195 km;
   no absurd grades; bridges elevated.
2. **Design exploration** → pick a visual direction (§6). *(Can run in parallel with step 1.)*
3. **App shell** (Vite + TS + Cesium): course rendered in analysis mode, keyless, quality selector
   with conservative default, visible attributions.
4. **Flyover camera** + photoreal toggle (bring-your-own key, entered in-app, stored locally).
5. **Sun timeline**: race date + start wave + goal pace drive the clock; runner marker on course.
   Tests: timezone correctness incl. **US DST ending Nov 1 2026** (likely NYC race day).
6. **Wind climatology** (Python + Open-Meteo): per-segment head/tail/cross distributions.
   Test: meteorological "from" direction convention.
7. **Shade** (Python): surface-model occlusion per point × 5-min step; buildings vs. trees range;
   km-level "X–Y% exposed, you arrive at HH:MM".
8. **Aid stations + fueling check**: sourced station data per edition; runner's plan flagged
   against real layout.
9. **GPS trouble layer**: forum reports (subjective) + urban canyon score (measured).
10. **Launch**: README, GIFs, 30–60s photoreal clip, posts drafted for r/nycmarathon, r/running,
    r/AdvancedRunning, X/TikTok. Flip repo public.

**v1 simplification:** runner position uses **even pace** (grade-adjusted pacing is Tier 2), so
arrival times are approximate — state that in the UI.

### Tier 2 — after launch
- **Pacing simulator**: goal time → grade-adjusted per-km splits (replaces even pace everywhere).
- **Weather distribution + performance cost**: percentiles for the date and heat time-penalty.
- **Weather sandbox**: editable conditions; sky and every dependent number update; presets for
  past-edition replay and best/median/worst from climatology.
- **Surface & hazards**: pavement type, camber, tunnels, narrow sections; sharp turns derived from
  geometry automatically.
- **Historical editions**: winners, podium, course records, officially published summary stats
  and day-of conditions. ⛔ No scraped finisher tables.
- **Contributor course format + validator + more courses by PR** (principle 2 — the growth engine).
- 🟡 Optional free hosted link (architecture already supports it).

### Tier 3 — later
- **Tangent optimizer**: shortest legal line vs. typical line; where distance cost concentrates.
  Best version compares a user-uploaded GPX (analyzed in-browser, never stored) against the line.
- **Spectator planner**: transit-reachable viewing spots. Must model that the course can't be
  crossed on foot and that race-day transit is modified (standard GTFS is wrong that day).
- **Crowd support map**: contributed ratings and derived spectator-accessibility — two layers.
- **"Is this actually a fast course?"**: cross-course comparison normalized for field quality,
  from officially published summary stats only.
- **GPS degradation, full model**: satellite-visibility physics from building geometry, predicting
  total watch over-read ("expect 26.6 mi"). ⛔ Empirical crowdsourced-track approach dropped (D8).
- **Flyover video export.**

---

## 8. Domain facts & traps (tests should pin these down)

- **Raw GPS elevation is unusable**: re-derive from terrain models and smooth before grade.
- **Wind direction is where it blows *from*.** Explicit test.
- **Photoreal meshes have baked shadows** → analysis mode is the truthful view (D4).
- **Sun position is clock-sensitive**: IANA timezones, explicit start-wave times, DST tests.
  **US DST ends Sunday Nov 1 2026** — very likely NYC race day.
- **Photoreal coverage is limited** (~2,500 cities) → analysis mode is always available.
- **Heavy 3D kills weak GPUs** → quality selector with conservative default from day one.
- **Bare-earth DEMs remove bridges** → the NYC start (Verrazzano) would read as sea level; patch
  bridge decks from LiDAR/surface data.
- **LiDAR has a leaf state and a date** → NYC 2017 is 50% leaf-off and predates newer towers;
  use current building footprints for buildings, show tree shade as a range (D7).
- **ERA5 wind is regional (~25 km grid, 10 m height)** → label as regional; street canyons differ.
- **Aid stations change every year** → version by edition.
- **Spectators can't cross the course; race-day transit is modified** (Tier 3 routing).

---

## 9. Legal & data rules

- Course geometry for public roads is factual and fine to host.
- ⛔ Never scrape finisher result tables. Only officially published winners/podium/records/summaries.
- ⛔ No Strava/Garmin bulk track aggregation.
- Forum and organizer facts: **paraphrase + link**, never verbatim copies of posts, tables, or maps.
- No race logos or trade dress; "unofficial, not affiliated" footer.
- Provider attribution (Google, Cesium, Esri/basemap, OpenStreetMap, Open-Meteo, city open data)
  stays visible and is never restyled away.
- No API keys in the repo, ever. Users supply their own, stored only locally.
- Google content: never cached, stored, or used to derive data.
- ⚠️ Not legal advice — this is the conventional open-data posture.

---

## 10. Open items

- 🟡 **Design direction (§6)** — mockups in progress; owner picks.
- 🟡 UI framework confirmation (Svelte 5 proposed; the first slice is plain TypeScript).
- ⚠️ **GitHub repo `Daniwave100/GeoPace` is currently public**, but D10 says private until the demo.
  Owner to decide whether to flip it to private (GitHub → Settings → Danger Zone).
- 🔍 Verify: NYC 2026 date + wave times · Open-Meteo archive limits · Cesium ion Community terms for end users.
  ✅ Settled 09-17: there is no downloadable official NYC course file (D21); NYC Open Data has no usage restrictions.
- 🟡 **NYC start line position** is taken from NYRR's course map and is good to roughly ±250 m; nobody publishes
  coordinates. Everything downstream shifts with it. Worth re-checking against the 2026 map when it is published.
- 🟡 **Interpolated elevation isn't marked as such.** The Verrazzano's main span (~km 0.85–1.45) has no LiDAR at
  all, so its height is a straight line between measured points. The bundle has no way to say "this stretch is
  filled in", so the app can't gray it out (principle 5). Needs a schema field.
- ✅ Plan confirmed 2026-09-16; CLAUDE.md created; step 1 + mockups started.

---

## Changelog
- **2026-09-16** — Plan created from the original project brief + grilling session (D1–D12).
- **2026-09-16** — Design process decisions D13–D15; plan confirmed by owner.
- **2026-09-16** — Berlin end-to-end slice (#2): verified Berlin route source, DGM1 access and licence, and keyless
  map/terrain terms (§5). Added D16 (keyless providers), D17 (Minetti difficulty), D18 (bridge spans), D19 (Course Bundle format),
  D20 (one distance scale per course).
- **2026-09-17** — NYC course end to end (#3): verified that no downloadable NYC course file exists, and that
  NYC Open Data carries no usage restrictions (§5). Added D21 (traced route), D22 (traced-route length tolerance),
  D23 (bridge decks from LiDAR), D24 (NYC 1-ft DEM via COG blocks). App gained a course picker.

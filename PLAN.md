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
8. **Easy for a runner who isn't technical.** *(Added 2026-09-18, owner directive.)* The first
   screen shows little and explains itself; everything else is one deliberate step away. If a
   screen needs a legend to be usable, it is showing too much at once.

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
| D10 | ✅ **Launch target ≈ 2026-10-18**, two weeks before the NYC Marathon (🔍 Nov 1: it follows from the organizer's first-Sunday-in-November rule, but nothing we could open states the 2026 date itself — D38). Repo private until the flyover + shade demo works, then public with a 30–60s photoreal clip. Owner posts; Claude drafts. Name stays GeoPace. | NYC is inside its 2–8 week research window now; Berlin 2026 (Sept 27) is too close. | 09-16 |
| D11 | ✅ **Frontend visual design is original** — Godseye is inspiration for the *idea* and the key model only, not the look. | Owner directive. | 09-16 |
| D12 | ✅ Code license **MIT**. Footer: "Unofficial — not affiliated with any race organizer." No race logos, no copies of organizer maps. | Low-friction OSS; trademark/copyright hygiene. | 09-16 |
| D13 | ✅ **Design is chosen from 3 contrasting clickable mockups**: (a) Roadbook — editorial/print, (b) Race poster — bold graphic, (c) Field instrument — light scientific. Owner picks or mixes. | "Unique" is easier to recognize than to specify. Runs in parallel with step 1. | 09-16 |
| D14 | ✅ **The km strip is the spine of the UI.** Every layer aligns by km; scrubbing moves runner, clock, sun, and camera together. | A recognizable interaction no 3D map app has. | 09-16 |
| D15 | ✅ **Analysis mode looks like an architectural model**: matte untextured buildings on a quiet ground, real shadows as the hero. *(Accepted by default; owner can revisit on seeing mockups.)* | Distinct from Google Earth / game looks; contrasts with photoreal mode. | 09-16 |
| D16 | ✅ **Keyless map providers: OpenStreetMap standard tiles + Re:Earth Terrain** (quantized-mesh from Mapterhorn). ⛔ Esri World Imagery and CARTO raster basemaps. | Esri basemaps now need an ArcGIS key; CARTO raster tiles are watermarked without a key. OSM tiles are keyless with visible attribution and no bulk/offline fetching; Re:Earth Terrain is keyless, CORS-open, and loads natively in CesiumJS. Both are best-effort with no SLA, so the look may switch to a quieter basemap once the design is picked. | 09-16 |
| D17 | ✅ **Difficulty = Minetti et al. 2002 running energy cost relative to flat**, only for grades within the model's measured −45%…+45% range (outside it: null, grayed out). | A published, widely cited physiological model instead of an invented score. | 09-16 |
| D18 | ✅ **Bridge decks the ground model drops are listed as sourced course facts** (km span + OpenStreetMap way) and spanned in a straight line between the two ends. | Berlin DGM1 omits most decks: the Moltkebrücke read as the Spree 6 m below and faked a −4.7% grade. A straight span is right for low, flat city bridges. NYC's high bridges still need deck heights from surface data (#3). | 09-16 |
| D19 | ✅ **Course Bundle = one JSON file per course**, `data/derived/<id>/course-bundle.json`, validated on both sides against `schema/course-bundle.schema.json` (`schema_version` 1; now 2, since D38 added editions). Measured data (and values computed from it by published models, like difficulty) sits under `measured`; subjective data will get its own section. Every landmark carries its source into the bundle. | One versioned contract; drift is caught when loading instead of showing wrong numbers. Berlin's bundle is ~210 KB. | 09-16 |
| D20 | ✅ **One distance scale per course: km measured along the course line** (Berlin: 42.28 km; NYC: 42.69 km). Landmarks and bridge spans use it too; certified positions (half, finish) are scaled onto it. **Owner, 09-18: the strip and the readout stay on course-line km** (New York's strip ends at 42.69); organizer km was considered and turned down. *Still for #12:* organizer km (aid stations, km signs) sit on the certified scale and must be converted onto the line before they are drawn. | Mixing scales put the Finish marker ~90 m before the end of the line. The 0.2% gap is real (street line vs shortest legal line) and small, but it must not be silently mixed. | 09-16 |
| D21 | ✅ **NYC's route is traced, not downloaded.** ⛔ No organizer course file exists that anyone can fetch: NYRR publishes a PDF map, and its own course on Strava needs a login. Instead `data/courses/nyc/course.yaml` lists the Blue course's turn points in order — taken from the City of New York's official list of closed course streets ("street, from–to") and NYRR's closures page and map — and the pipeline traces them along OpenStreetMap streets (shortest path, footpaths penalised). | Keeps the one documented command working with no key and no login, keeps the course as reviewable data rather than an opaque file, and every turn carries an official source. The risk is a wrong street, which the length check and the profile catch. Verified 09-17 street by street against the city's list, and against the course's USATF certification (D25). | 09-17 |
| D22 | ✅ **A traced route gets a wider length tolerance: ±2.5%** (course files stay at ±1%). NYC traces to 42.69 km vs the certified 42.195 km (+1.2%). | Street centre lines take every corner wide and run down the middle of wide avenues and bridge ramps, so they are inherently longer than the shortest legal line a course is measured along. The tolerance still catches a genuinely wrong route. | 09-17 |
| D23 | ✅ **NYC bridge decks come from the 2017 city LiDAR** (returns classified "bridge deck"), read straight out of NOAA's Cloud-Optimized Point Cloud copies over HTTP, corridor only. Where two decks are stacked, the course facts say which one runners use (`deck: upper` for the Verrazzano, `lower` for the Queensboro). A layer with far fewer returns than the busiest one is a ramp or walkway passing over, not a deck. | NYC's bare-earth DEM removes every deck: the Verrazzano start read as sea level. Berlin's straight-span trick (D18) can't work for high bridges with long ramps. The LiDAR measures the real deck, including the 6.4 m between the Queensboro's two levels. | 09-17 |
| D24 | ✅ **NYC elevation = the 2017 1-ft bare-earth DEM** (same flight as the bridge decks), read block by block from NOAA's Cloud-Optimized GeoTIFFs. ⛔ NYC Open Data's own 1-ft DEM download (a single 3.3 GB zip, 2010 LiDAR). | Same scan and datum as the decks, and a COG can be read ~156 m block at a time so a build downloads the corridor instead of 20 GB. | 09-17 |
| D25 | ✅ **The start line comes from the course's USATF certification, not from reading a map.** The certified course is [NY22001JHP](https://certifiedroadraces.com/certificate/?type=l&id=NY22001JHP) (measured 2022, valid to 2032, replaces NY15001DB). Its record says start and finish are **47.22% of 42.195 km = 19,924 m apart** in a straight line; the start is the point on the bridge's upper Brooklyn-bound roadway exactly that far from the finish by Tavern on the Green. A test keeps the course line agreeing with it. | Nobody publishes coordinates for the start line, and guessing it from the course map moved everything downstream by a few hundred meters. 1 m along the bridge changes the separation by 0.68 m, so the certificate's rounding pins it to ~3 m; what is left is the finish line's own position. The certificate's drop (0.12 m/km) also matches the bare-earth ground at start and finish, which is how certifiers read elevations. | 09-17 |
| D26 | ✅ **The mockups draw the architectural model as an SVG axonometric, not in Cesium.** Massing is invented; the sun's altitude and azimuth, and therefore every shadow, are computed for the real place and minute (`app/src/core/solar.ts`, `shadow.ts`). | The mockups exist to choose a look. Three Cesium scenes on real building data is #7's job and would have decided nothing extra; a drawing restyles completely per direction, which a 3D scene can't. The tested sun/shadow/clock core carries over to #5 and #7 unchanged. | 09-18 |
| D27 | ✅ **Typefaces are open-licence and self-hosted** (npm `@fontsource` packages, bundled by Vite). ⛔ No font CDN. | The app runs locally (D2): it should render the same offline, and a design shouldn't make a third-party request per visit. Every candidate face was checked for tabular figures, because a readout that jiggles while you scrub is unusable. | 09-18 |
| D28 | ✅ **Visual direction: B · Race poster.** Black, white and one blue on a strict grid with the rules showing; Archivo (one variable family: width 62% / weight 900 for numerals); solid = measured, hollow = hearsay, halftone dots = "depends on the trees", grey and struck = not measured, hazard stripes = sample; flat street model with solid black shadows; follows the system's light or dark theme. Tokens in §6. The blue refers to the line painted on the road at both races; the owner confirmed on 09-18 that this is fine under D12. No organizer palette, typeface or mark is used. | Owner's pick from the three mockups (#4): "the one that looked the coolest". | 09-18 |
| D29 | ✅ **The mockup's screen is the *everything* view, not the first screen.** Owner on seeing it: love the look, but "there's a lot" — it has to be easy for a runner who isn't technical (principle 8). #6 applies the look with far less on screen by default; how (see §6 "Simplifying the screen") is 🟡 proposed, not yet agreed. | A design that wins on looks and loses the user on first contact doesn't earn stars. | 09-18 |
| D30 | ✅ **Photoreal is the headline look; the white model is what opens with no set-up.** The app advertises photoreal (Google 3D Tiles with the runner's own key) as *the* way to see the ride, with a prominent "Make it photoreal" control and plain set-up help. With no key it opens straight into the **white model of the city's real buildings** — real footprints and heights from each city's open data (§5 "Buildings"), cut to the course corridor by the pipeline (#7) — never a blank or a nag screen. Refines D3/D4; does not change them: no key ships with the project. "White model" is now the name for what older rows call *analysis mode* (see `CONTEXT.md`). | Owner directive 09-18: people should know the key is what makes it look cool, and the fallback should still be the actual buildings, "a white 3D layout". A key can't be the literal default because none can ship in the repo (and it would bill the maintainer), and most non-technical runners will never create one (principle 8) — so the white city has to stand on its own. | 09-18 |
| D31 | ✅ **B is refined with the Field instrument's charts, and ships with both light and dark.** The poster keeps its identity (Archivo, the blue, the grid, solid/hollow), but the km strip's layers are drawn as the instrument drew them: thin line traces with a light fill, a labelled scale, and the value under the cursor printed in the row's header. Light and dark are both first-class, with a switch in the app as well as following the system. | Owner on 09-18: the instrument's charts "are much easier to understand" than the poster's solid bars and wedges; and light mode matters as much as dark. D13 always allowed a mix. | 09-18 |
| D32 | ✅ **The interface has to belong on top of photoreal imagery, not beside it.** The design is judged against Google's photoreal city, not only the white model. Not "a map inside a web page". | Owner directive 09-18. None of the mockups or prototypes has been seen against real imagery yet — that is the biggest unknown left in the look. | 09-18 |
| D33 | ✅ **Two cameras, and the ride is a time-lapse.** A bird's-eye view and a runner's view of the same ride; nobody watches a three-hour video. *How low the runner's view can go is 🟡 open* — see §6 "The ride". | Owner's vision 09-18: "like a drive cam… you're on the actual ground", plus a bird's-eye view. | 09-18 |
| D34 | ✅ **Two modes: Explore and Ride.** *Explore* is home: the city seen from above with the course on it, moved freely like any maps app, with layers switched on and off. *Ride* carries the runner along the course as a time-lapse that slows down at Stops, seen either **From above** or **On the road** (D33). The same layers, the same strip and the same sentence appear in both. This settles D29's open "how", and replaces Claude's earlier proposal that the whole app be a video player: the player is the Ride. | Owner's idea 09-18, and better than the proposal it replaces: a runner's questions are random-access ("where's the last hill?", "where will my family stand?") and a map answers them at once, where a ride makes them wait. From above is also where Google's imagery is at its best. | 09-18 |
| D35 | ✅ **One layer system; layers are drawn on the course line, one at a time.** Switching a layer on marks the course line on the map, adds that layer's row to the strip, and adds its clause to the sentence. ⛔ No area heat maps or coloured blobs over the map. One layer is on at a time by default; "Show everything" opens the full strip. Plain names: **Hills · Sun · Wind · Aid · Crowds · Bottlenecks · Watch trouble**. | All of GeoPace's data lives along a line, and coloured areas over satellite imagery are hard to read. One at a time keeps the screen from becoming "a lot" again (principle 8). | 09-18 |
| D36 | ✅ **Crowd support is a v1 layer, and it is subjective.** "Crowds" shows where spectators are, from three kinds of source: runner reports (loud / mixed / quiet stretches, paraphrased with links), official cheer zones and entertainment points (sourced facts), and stretches where spectators aren't allowed, such as bridges (sourced facts). ⛔ Not a heat map: nobody measures spectator density, and a smooth gradient would claim data we don't have. Moves up from Tier 3; contributed ratings and derived spectator access stay there. | Owner asked for it 09-18. It costs little because it uses the same research method as the watch-trouble reports (#13), and it keeps principle 3: hearsay is drawn as hearsay. | 09-18 |
| D37 | ✅ **Runner congestion: bottlenecks now, a model later.** v1's "Bottlenecks" layer shows places known to be congested, as sourced facts (e.g. where New York's three start colours merge) and runner reports. It gives no density numbers. A modelled "how packed will it be around me" layer is Tier 2: it needs the field's finish-time spread from officially published summaries only (⛔ never scraped results), wave sizes and street widths. | Owner asked for it 09-18. It is the hardest thing on the list with the least data behind it; a number here would be invented precision (principle 5). | 09-18 |
| D38 | ✅ **Edition facts are one YAML file per edition, `data/courses/<id>/editions/<edition>.yaml`, and travel in the Course Bundle (`schema_version` 2).** Each holds the race date and the runner waves, every fact with its source. A wave time is written as the organizer prints it (wall clock, in quotes); the pipeline adds the exact instant with its UTC offset, worked out in the course's IANA zone, and the app works it out again on its own, so the two check each other. Three honesty rules, enforced by the loader and by the schema: a time copied from an earlier edition is **carried over**, with the edition it came from and a reason the runner sees, and the app greys every time of day that rests on it; a wave whose time **nobody has published** is listed with no time and a note, is never filled with a guess, and can be planned with only once the runner types their own start time (D40); a race date the organizer hasn't stated for this edition is marked **not confirmed**, with how it is known. ⛔ Third-party wave times: not an organizer or an authority (`CONTEXT.md`, *Sourced fact*). **Owner, 09-18: don't chase wave start times for either race; runners type their own (D40).** So Berlin's waves 2–6 stay "not published", and NYC's 2025 times (from NYRR's 2025 runner guide on `webassets.nyrr.org`, a public file host the repo already cited) stay only as what the start-time box shows until the runner types theirs, flagged as carried over. Nobody needs to go and verify them. | Berlin 2026: the organizer confirms the date and only the first runner start (08:45, "in 6 waves"); the other five are on each runner's start card, the 2025 schedule couldn't be retrieved, and the 2026 page hints the wave layout changed. NYC 2026: the waiting room passes a browser, not our tools, and we don't work around it; the 2025 guide gives the five wave times (carried over) and the rule "the first Sunday in November" (the date, not confirmed). A required new field breaks old readers, hence version 2. | 09-18 |
| D39 | ✅ **The 3D scene has no clock of its own: Cesium's clock is stopped and set from the Planner's race clock**, so the scene's sun is the sun at the moment the runner reaches that km. **Look — owner, 09-18: leave it for now and decide in #7**, when the white model's shadows arrive. Cesium's sun lighting is kept on at city scale (by default it fades out within ~10,000 km of the ground, so a city never looks dark), so the map dims as the sun gets low and drops to Cesium's night-side floor (30%) after sunset. It is three lines in `app/src/scene/globe.ts`. | One source of time means the strip, the readout, the sentence, the marker and the sun can't drift apart. Without the lighting change the sun moved but nothing on screen showed it: measured in headless Chrome, map brightness 206 → 63 between an 11:30 start and an 18:00 finish in New York on Nov 1. It becomes properly visible with the white model's shadows (#7), at which point dimming the map may no longer be needed. | 09-18 |
| D40 | ✅ **A runner can type their own start time, and it outranks everything else.** Under the wave there is always a start-time box: it shows the wave's published time, and the runner can overwrite it. It is the only way to plan with a wave whose time isn't published (Berlin 2026's waves 2–6). The runner's own time is never greyed, even on a carried-over wave, and typing a carried-over time back in counts as confirming it. Picking a wave with no published time doesn't blank the screen: until a time is typed, the plan is unchanged and the form says whose times are still showing. It is part of the Race Plan and is remembered with it. | Owner, 09-18: "type your own start time would be very good". Each runner's start card is a better source for that runner than any schedule, and it closes the gap the review found: a four-hour Berlin runner was shown wave 1's times with nothing to be done about it. | 09-18 |
| D41 | ✅ **A splits table: the time of day and elapsed time at every kilometre, and at the finish.** Closed until asked for (principle 8); every kilometre in it is a button that moves the runner there. Same honesty as the readout: times of day resting on a carried-over start are greyed. Kilometres are course-line km, like the strip (D20), so where that shows at the second the table says why a kilometre takes less than the runner's pace (New York: 5:37 against a 5:41 pace, because the mapped line is 42.69 km). The Planner computes splits at any step, so a table in miles is the same call with 1.609344. | Owner, 09-18: "a splits table would be pretty nice". #5 asked for times "at every km"; scrubbing alone made a runner hunt for them. | 09-18 |
| D42 | ✅ **The app will have an imperial / metric toggle (#19, not built yet).** It is the *units* choice the Race Plan already lists (`CONTEXT.md`), so it is remembered with the plan. Everything stays metric inside (CLAUDE.md conventions: meters, km from the start); only what is shown and typed converts: the readout and the strip's marks (miles), the goal as a pace per mile, the splits table per mile, heights in feet on the profile. Until it exists, nothing new should format a distance in a way that would be hard to switch. | Owner, 09-18: "we have to also account for a toggle for imperial and metric units". New York is the launch course and its runners think in miles. | 09-18 |
| D43 | ✅ **The runner's own key: one box, told apart by shape, kept only in the browser, sent only to its own provider.** The panel has one box for either kind of key. A Google Maps key (`AIza…`) and a Cesium ion token (a JSON Web Token, `eyJ…`) are recognized by shape, the panel says which it found and the one host it will go to, and anything else is refused without being sent anywhere. A Google key goes only to `tile.googleapis.com`; an ion token goes only to `api.cesium.com`, and ion answers with a short-lived key of its own for the tiles, so Google never sees the runner's token. The key is handed to CesiumJS explicitly each time and is ⛔ never set as a CesiumJS default (`Ion.defaultAccessToken`, `GoogleMaps.defaultApiKey`); CesiumJS's own bundled demo ion token is switched off. It is stored in `localStorage` under `geopace.photoreal`, apart from the Race Plan, with whether photoreal was left on; typed into a hidden box, and afterwards shown only by its last four characters. ⛔ No key from the build's environment (`VITE_…`), the page address, or any file. | D3 made the key the runner's; this is how that promise is kept and tested. Guessing the provider could send one company's secret to another. A CesiumJS default is sent by any part of CesiumJS that reaches for it. The owner will record a launch clip with photoreal on, so the key must never be readable on screen. Keeping it out of the Race Plan means a plan can later be shared or exported safely. Tests: the real CesiumJS request code with the network replaced by a recorder, and a guard that reads every tracked file for key-shaped strings. | 09-18 |
| D44 | ✅ **Photoreal can fail; the view can't.** The keyless map is left in place until the imagery's first view has fully arrived, and only then is the plain ground hidden (left on, it pokes through Google's mesh). If the provider refuses the key, says it is over its allowance, or can't be reached, or if the imagery stops arriving later (the very first tile fails, or eight tiles fail in a row with none arriving between), the imagery is removed, the keyless map is showing, and a message says what happened and what to do. The course, the strip and the planning layers never wait on photoreal. There is never more than one load under way, and a load that finishes after the runner changed their mind is thrown away. A reload opens the way the runner left it. | D30: never a blank view, never a nag. A provider counts and bills each *load* (one start of photoreal; looking around afterwards is free for about three hours), so a double click must not cost two. Google ends a session after about three hours, which looks like every tile failing at once: that should land the runner back on the map with a way to start again, not on a broken picture. | 09-18 |

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
| Course route | ✅ Organizer's own GPX: [BM25_Marathon-Strecke.gpx](https://www.bmw-berlin-marathon.com/fileadmin/media/events/berlinmarathon/gpx/BM25_Marathon-Strecke.gpx), linked from the [course page](https://www.bmw-berlin-marathon.com/en/your-race/course/). 508 points, no elevation; 42.285 km measured on the WGS84 ellipsoid (+0.2% vs certified). No 2026 file yet (BM26 → 404, 2026-09-16). | ✅ No downloadable file exists (⛔ NYRR's map is a PDF; ⛔ its Strava route needs a login). Traced from the [City of New York's 2025 course street closures](https://www.nyc.gov/assets/cecm/downloads/pdf/marathon-street-closures-no-parking-2025.pdf) + [NYRR's closures](https://www.nyrr.org/info/2025tcsnewyorkcitymarathon/2025-street-closures) and [course map](https://webassets.nyrr.org/nyrrwebsiteassets/TCSNYCM25_Map_Course_102925_M3.pdf) onto OpenStreetMap streets (D21). 42.69 km measured (+1.2% vs certified). Verified street by street against the city's list; start line derived from the USATF certification [NY22001JHP](https://certifiedroadraces.com/certificate/?type=l&id=NY22001JHP) (D25). | Road geometry is factual; which streets are closed is an official fact, paraphrased as waypoints; street geometry ODbL | ✅ both |
| Bare-earth elevation | ✅ [ATKIS® DGM1](https://gdi.berlin.de/data/dgm1/atom/) via ATOM feed: 2×2 km zips of "E N H" text, EPSG:25833, 1 m cells, DHHN2016 heights, ~17 MB each; the course needs 18 tiles. Feed updated 2025-12-18. **Most bridge decks are missing** (D18). | ✅ 2017 NYC 1-ft bare-earth DEM, 31 Cloud-Optimized GeoTIFFs (~20 GB total, EPSG:6539, NAVD88 feet) on [NOAA Digital Coast](https://www.fisheries.noaa.gov/inport/item/64732); read 512 px (~156 m) blocks along the corridor. Every deck removed — the Narrows read as sea level (D24). | Berlin ✅ [dl-de/zero-2.0](https://www.govdata.de/dl-de/zero-2-0) (no attribution required; we credit anyway) · NYC ✅ [NYC Open Data: no usage restrictions](https://opendata.cityofnewyork.us/faq/) (Local Law 11 of 2012, NYC Admin. Code § 23-504); NOAA copy has no access constraints | ✅ both |
| Surface model (buildings + trees) | DOM / bDOM, ALS LiDAR, Vegetation heights 2020 | 2017 topobathy LiDAR (8 pts/m², May 3–17 2017, 50% leaf-off; 180 GB citywide, per-tile download) | Berlin: dl-de/zero-2.0 · NYC: 🔍 NYC Open Data terms | ✅ found |
| Buildings | 3D building models LoD2 | Building Footprints w/ roof heights (updated 2026; preferred over 2017 LiDAR for new towers) | as above | ✅ found |
| Tree canopy | Vegetation heights 2020 | 6-inch Land Cover 2017 | as above | ✅ found |
| Historical weather | Open-Meteo historical archive (ERA5), keyless | same | CC BY 4.0, attribution required | 🔍 rate limits, window |
| Keyless basemap / terrain | ✅ [OpenStreetMap standard tiles](https://operations.osmfoundation.org/policies/tiles/) (attribution visible, no bulk/offline pre-fetching, Referer sent) + [Re:Earth Terrain](https://terrain.reearth.land/) quantized-mesh `cesium-mesh/ellipsoid` ("no signup, no API key", best-effort, may rate-limit heavy clients; attribution "Re:Earth Terrain · Mapterhorn (CC BY 4.0)"). ⛔ Esri (needs key) · ⛔ CARTO raster (watermarked without key). Candidate quieter basemap for Berlin: [basemap.de Web Raster](https://basemap.de/produkte-und-dienste/web-raster/) grayscale (CC BY 4.0, Germany only). | same | OSM: ODbL · Mapterhorn: CC BY 4.0 | ✅ (D16) |
| Bridge locations | ✅ OpenStreetMap ways, listed per bridge in `data/courses/berlin/course.yaml` | ✅ same, in `data/courses/nyc/course.yaml` (9 spans, incl. the five famous bridges) | ODbL, attribution in bundle | ✅ both |
| Bridge deck heights | n/a — decks spanned straight (D18) | ✅ [2017 NYC Topobathymetric LiDAR](https://www.fisheries.noaa.gov/inport/item/64728), class 17 (bridge deck), as COPC tiles on NOAA Digital Coast; only the corridor around each bridge is read (D23). ⚠️ No returns at all over the middle of the Verrazzano's main span (~km 0.85–1.45): that stretch is a straight line between measured deck heights, so the real crest is a few meters higher. | NYC Open Data / NOAA, as above | ✅ NYC |
| Photoreal 3D | ✅ Google Photorealistic 3D Tiles with the runner's own key (D43), either way, checked 2026-09-18. **Google Maps key:** the project must have billing enabled ([usage and billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)); what is counted is the *root tileset request* (one per start of photoreal, good for up to three hours of tiles); [1,000 a month free, then $6.00 per 1,000](https://developers.google.com/maps/billing-and-pricing/pricing); set-up in [Google's guide](https://developers.google.com/maps/documentation/tile/get-api-key). **Cesium ion token:** the free Community plan is for personal, non-commercial projects (also unfunded education and evaluation) and [includes 1,000 root tiles a month](https://cesium.com/platform/cesium-ion/pricing/); every account has a [default token](https://cesium.com/learn/ion/cesium-ion-access-tokens/) that works. ion's asset id for the tiles is 2275207 (from CesiumJS's own source). 🔍 Not confirmed: whether a new ion account already has the tiles among My Assets or must add them from the Asset Depot; the app's message covers both. | same | [Google's policies](https://developers.google.com/maps/documentation/tile/policies): no pre-fetching, storing or caching; no extracting geodata; our own objects may be laid over the tiles as long as they aren't derived from them; the Google logo and each tile's data credits shown on the map, along the bottom (the app sets `showCreditsOnScreen`) · ion Community = personal/non-commercial | ✅ |
| Aid stations | 🔍 organizer site (paraphrase + source link) | 🔍 NYRR (2026 may publish late) | Facts, not copied layouts | 🔍 |
| Race date / start waves | ✅ Sunday 2026-09-27; runners start "from 08.45 am … in 6 waves" after the handbike and wheelchair starts (8.20, 8.26, 8.29) — [race day page](https://www.bmw-berlin-marathon.com/en/your-race/race-day-for-runners), accessed 2026-09-18. ⚠️ The organizer publishes **no clock time for waves 2–6** (checked in the page's HTML on 09-18; each runner's time is on their emailed start card), so they are listed without one (D38). Third-party sites print times; one credits the organizer's page, which doesn't contain them. | 🔍 Date 2026-11-01, **not confirmed**: it follows from NYRR's rule "first Sunday in November" ([2025 runner guide](https://webassets.nyrr.org/nyrrwebsiteassets/TCSNYCM25_RunnerGuide_Mobile_M.pdf); [Abbott WMM](https://www.worldmarathonmajors.com/races/new-york-city) says the same). Waves 9:10 · 9:45 · 10:20 · 10:55 · 11:30 are **carried over from 2025** (same guide). nyrr.org was behind its waiting room again on 2026-09-18. Owner, 09-18: wave times aren't chased; runners type their own (D40). The date is still worth a look by a person. | Facts, paraphrased with a link | ✅ Berlin · 🔍 NYC |
| GPS trouble reports | Forums (Reddit, LetsRun…) paraphrased + linked | same | Link + paraphrase only | ✅ approach |
| Transit (Tier 3) | 🔍 VBB GTFS | 🔍 MTA GTFS | — | later |

---

## 6. Design & identity — ✅ direction picked: B · Race poster (D28)

**Directive:** neat, clean, and above all **unique and new**. Not Godseye's look; not the generic
dark HUD every 3D map demo uses.

**Decided:** km strip as UI spine (D14) · architectural-model analysis mode (D15) · choose via 3 mockups (D13) ·
**B · Race poster wins (D28)**, with the instrument's charts and both themes (D31) · the first screen must be much
simpler than the mockup (D29) · **Explore and Ride** (D34) sharing **one layer system** (D35) · it has to belong on
photoreal imagery (D32) · two cameras and a time-lapse (D33). Words used here are defined in `CONTEXT.md`.

### The tokens (from B, as built in `app/src/mockups/poster/`)

- **Palette.** Light: paper `#f4f4f0`, ink `#000`, blue `#1546ff`, grey `#8a8a86`. Dark: the inverse — ground `#000`,
  ink `#f4f4f0`, blue `#5a7dff`, grey `#7c7c78`. Blue means exactly one thing: the course and where you are on it.
- **Type.** Archivo variable, self-hosted (D27), tabular figures everywhere. Numerals: width 62%, weight 900.
  Headings: width 75–88%, weight 800–900. Text: normal width, weight 500. Sentence case; no all-caps labels.
- **Layout concept.** Twelve columns, 3px rules showing, no rounded corners, no shadows, no gradients. One giant
  numeral per screen (the kilometre). The km strip is a full-width band of solid rows on one km axis.
- **Encoding.** Solid = measured · hollow (outlined) = what runners say · halftone dots = sun that depends on the
  leaves · flat grey + struck through = not measured here · hazard stripes + the word "sample" = placeholder.
- **Street model.** White blocks, black outlines, solid black shadows, blue course line, north arrow and sun ray.
- **Theme.** Follows the system; both are flat ink, neither is a glass HUD.

### The shape of the app — ✅ agreed with the owner 09-18 (D34–D37)

- **Explore is home.** The city from above, with the course on it, panned and zoomed like any maps app. Beside or over
  it: the kilometre, the time of day, and **one sentence** about where you are ("Climbing 2% onto the Queensboro
  Bridge. Sun behind you. Water in 500 m."). A big "Ride the course" button.
- **Ride is a mode of the same screen.** A time-lapse along the course that slows down at **Stops** — landmarks and the
  stretches where something happens — and hurries between them. Back / Ride to the next stop; space plays and pauses;
  the strip is the seek bar. Seen **From above** or **On the road**.
- **Layers** are switched on one at a time: Hills · Sun · Wind · Aid · Crowds · Bottlenecks · Watch trouble. A layer
  marks the course line on the map, adds its row to the strip, and adds its clause to the sentence. "Show everything"
  opens the full strip, which is the poster mockup's screen, for the people who want all of it.
- **The strip** stays the spine (D14): collapsed to height + where you are by default, drawn the instrument's way (D31).
- What is shown for Crowds and Bottlenecks, and what is deliberately not, is D36 and D37.

### The ride — the modes and cameras are ✅ decided (D33, D34); the rest is 🟡 Claude's thinking, to be settled by eye

- **What can't be judged yet.** Everything the owner has seen uses invented blocks drawn in SVG: no real city, no
  imagery, no moving camera. Most of how the product *feels* is the ride, and none of it exists. More mockups won't
  answer that. So the tickets are ordered to put the real thing in front of the owner early: race plan and scrubbing
  (#5), then photoreal on the owner's own key, then Explore in the poster design (#6) laid over it, then the Ride (#8).
- **Composition over imagery (D32).** The 3D view goes full-bleed and the poster sits *on* it as opaque blocks — black
  or white slabs, the blue, big numerals — the way a marathon TV broadcast lays graphics over the race. Opaque, never
  glass (D11). This argues against a boxed 3D panel beside a column of UI, which is what prototype variants B and C do.
- **Which prototype.** Owner is between prototype **C · Guided tour** and **B · Poster, cut down**. They combine: C's
  Stops with Back / Ride-to-next as the way through the Ride, B's numeral and list of places in Explore.
- **Runner's view, honestly.** Google's photoreal city is photographed from aircraft. From ~100 m it is superb; at eye
  level facades smear, trees and cars are blobs, and a camera under a tree or *inside a bridge* (the Queensboro's lower
  deck is the course) is inside the mesh. 🔍 To verify in the slice. Likely answer: the "runner's view" is a **lead-vehicle
  camera** — a few metres up and behind, looking down the road, the way marathons are actually filmed — not a 1.7 m eye.
  🔍 Street View is the true ground-level source, but it is billed per panorama and its terms restrict turning it into
  video; verify before considering it.
- **The owner's look at real imagery (#17) — 🟡 not done yet; it needs the owner's own key.** Photoreal is built (D43,
  D44). With it on, the map shows **"Camera: about N m above the ground"** each time the camera comes to rest, so a
  height can be written down. That number is read from the open terrain, never from Google's mesh (D5), so on a bridge
  it counts from the water. To record here after looking at both courses from above and from road height:
  - 🟡 the lowest camera height at which the imagery still holds up, per course, for the On the road camera (#8, D33);
  - 🟡 where it falls apart first (trees, bridges, the Queensboro's lower deck, narrow streets);
  - 🟡 anything the Explore design (#6) has to allow for (D32): how the black and white slabs, the blue course line and
    the credits line along the bottom of the map read over real imagery, in light and dark.
- **Speed.** 42 km in 3 minutes is ~230 m/s: fine from the air, unwatchable on the ground. So: bird's-eye between
  stops, drop to the runner's view for the few hundred metres that matter at each stop, at a gentler time-lapse.
- **Sun in photoreal.** Google's imagery has its own shadows baked in (D4), so the moving sun is only *true* in the
  white model. In photoreal the sun is shown as overlay: where it is, glare when it's in your eyes, and the course
  line itself drawn differently where the computed shade says sun vs. shade.

### How the direction was chosen

The three mockups are still at
`http://localhost:5173/mockups/` with the app running (code in `app/src/mockups/`). All three draw
the same layers and print the same readout fields, entries and credits, because one module
(`story.ts` + `content.ts`) decides what is on screen and how honest each number is; a design only
decides how it looks. Two differences follow from layout rather than content, and either can be
moved into whichever direction wins: the Roadbook has room to print every runner report in its
margin (the other two show markers, with the text in "coming up"), and the Field instrument adds a
**sky dial** — the same sun, heading and wind numbers the others give in words, drawn as one
diagram with the sun's path over the whole race.

**Starting thesis:**
- **The course is the interface.** One continuous kilometer strip — the "roadbook" — where every
  layer (elevation/grade, sun exposure range, wind, aid stations, GPS warnings) is aligned by km.
  Scrubbing the strip moves the runner, the clock, the sun, and the camera together.
- **Analysis mode as an architectural model**: untextured, matte buildings on a quiet ground,
  where crisp real shadows are the hero. Looks like a physical city maquette, not a video game.
- **Measured vs. subjective encoded visually** so principle 3 is part of the aesthetic, not a
  legend footnote.

### The three candidates (tokens as built)

| | A · Roadbook | B · Race poster | C · Field instrument |
|---|---|---|---|
| **Borrowed from** | A topographic survey sheet + a rally co-driver's roadbook | The blue line both cities paint down the course + Swiss grid posters | A geologist's well log / strip-chart recorder |
| **Layout concept** | km strip runs **down** the page as a route card pinned to the left; sheet (title, readout, plate, ledger) scrolls beside it | Strict 12-column grid with the rules showing; giant km numeral; km strip as a full-width band of solid rows | km strip **is** the screen: stacked tracks sharing one km axis, one crosshair, each track's header shows the value under the cursor; side panels for model and sky dial |
| **Type** | Besley (a Clarendon, the face of old survey maps) + Kalam (handwriting) | Archivo variable, one family: width 62% / weight 900 for numerals, normal width for text | B612 (designed for Airbus cockpit displays; fixed-width digits) |
| **Palette** | paper `#ebe6d5` · ink `#1d2a33` · sepia `#9a6a3c` · route red `#b8322a` · pencil purple `#7d2e8c` · sun ochre `#d9a23a` / tree green `#8fae6e` | paper `#f4f4f0` · black `#000` · blue `#1546ff` (dark theme: inverted, blue `#5a7dff`) | ground `#e6eaed` · panel `#f6f8f9` · ink `#17212a` · trace `#23607a` · cursor orange `#e8590c` |
| **Measured** | Printed ink | Solid | Solid trace, upright type |
| **Subjective** | Purple pencil handwriting in the margin (purple is what survey maps overprint unchecked revisions in) | Hollow: outlined shapes and outlined type | Below a double rule: dashed open markers, italic type |
| **Not measured here** | Dashed grey line, value struck through | Hatched grey, value struck through | Dashed grey trace, value struck through |
| **Sample data** | Blue rubber stamp | Hazard-stripe tape | Dotted tag |
| **Street model** | Engraved: ink outlines, hachured shadows | Flat: white blocks, solid black shadows | Drafting film: cool grey massing, translucent shadows |
| **Theme** | Light only (it is paper) | Follows the system, light or dark | Light only (a dark instrument is the HUD we're avoiding) |

**Open questions:**
- 🟡 Composition over imagery ("The ride", second bullet) is the working assumption for #6 until the owner has seen
  it on real imagery. A throwaway prototype with three takes
  (Cinema · Poster, cut down · Guided tour) is on the branch `prototype/player-screen`, at `/mockups/prototype-player.html`.
- 🟡 Whether the Roadbook's margin notes or the Field instrument's sky dial should be carried into B.

---

## 7. Roadmap

### v1 — Berlin + NYC (target ≈ 2026-10-18)

Re-cut on 09-18 after the design pick and D28–D37. Issue numbers are GitHub's; each issue lists what blocks it.

1. ✅ **Course line** (#2 Berlin, #3 NYC): terrain-corrected, smoothed elevation; NYC bridge decks; grade; difficulty.
2. ✅ **Design exploration** (#4): three mockups; owner picked B · Race poster.
3. ✅ **Race plan, race clock, scrubbing** (#5): edition facts (D38), wave + goal, the runner marker, the clock and the real 3D
   sun moving together (D39). Tests: time zones incl. **US DST ending Nov 1 2026**, checked on both sides of the bundle.
4. 🟡 **Photoreal with your own key** (#17): the headline look (D30). Built: "Make it photoreal", the key panel with
   sourced set-up help, the imagery, and the way back when it fails (D43, D44). **Still to do, by the owner with their
   own key:** look at both courses and record the camera heights (D33) and the design constraints (D32) in §6.
5. **Explore** (#6): the map home screen in the poster design, the layer system (D35) with its first layer (Hills),
   the strip drawn the instrument's way, light and dark.
6. **Ride** (#8): the time-lapse with Stops, From above and On the road.
7. **White model** (#7): each city's real buildings along the course as white blocks with real shadows — what opens
   with no set-up. Decide there whether the map should still dim with the sun (D39).
8. **Sun**: building shade (#9), then the tree range (#10).
9. **Wind** (#11) · **Aid + fueling check** (#12).
10. **Runner reports and the canyon score** (#13): Watch trouble, Crowds (D36), Bottlenecks (D37).
11. **Imperial / metric toggle** (#19, D42): miles, pace per mile, splits per mile, feet. Before launch:
    New York's runners think in miles.
12. **Launch** (#14): README, GIFs, a 30–60s photoreal clip of the Ride, draft posts. Confirm repo visibility.

**If the date is at risk — 🟡 Claude's suggestion, owner's call.** Keep: Explore, Ride, Hills, building shade, Aid, the
runner-report layers. Let slip to just after launch: the tree-shade range (#10) and wind (#11).

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
- **Runner congestion, modelled** (D37): how packed it will be around you at your pace and wave, from officially
  published field summaries, wave sizes and street widths. ⛔ Never from scraped results.
- **Contributor course format + validator + more courses by PR** (principle 2 — the growth engine).
- 🟡 Optional free hosted link (architecture already supports it).

### Tier 3 — later
- **Tangent optimizer**: shortest legal line vs. typical line; where distance cost concentrates.
  Best version compares a user-uploaded GPX (analyzed in-browser, never stored) against the line.
- **Spectator planner**: transit-reachable viewing spots. Must model that the course can't be
  crossed on foot and that race-day transit is modified (standard GTFS is wrong that day).
- **Crowd support, beyond reports**: contributed ratings and derived spectator access. *(The subjective Crowds layer
  itself moved into v1 — D36.)*
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
- **YAML reads an unquoted `10:20` as the number 620** (base 60), while `09:10` stays text → wave times go in quotes,
  and the edition-facts loader refuses a number with advice. Tested.
- **Cesium fades sun lighting out near the ground** → at city scale the scene's sun changes nothing you can see unless
  the fade distances are pulled in (D39).
- **A photoreal tile's address has the runner's Google key in it.** CesiumJS prints a failed tile's address to the
  console unless something listens for failed tiles, and hands that address to whatever listens. The app listens, and
  never reads, shows or logs what it is handed (D43).
- **`createGooglePhotorealistic3DTileset()` without a key uses CesiumJS's default ion token, and remembers a failed
  ion lookup for the life of the page**, so a corrected token would keep failing until a reload. The app builds the
  ion request itself, with the runner's token, each time.
- **CesiumJS's library contains a demo Cesium ion token** (public, for evaluation). It is the one token-shaped string
  in the built app; it is not ours, and the app switches it off at start-up (D43).
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

- ✅ **Design direction (§6)** — owner picked **B · Race poster** on 09-18 (D28); the app's shape is Explore + Ride with
  one layer system (D34–D37). 🟡 Open: the owner hasn't yet seen any of it over real imagery (D32).
- 🟡 **What slips if Oct 18 is at risk** — see §7; owner's call.
- 🟡 UI framework confirmation (Svelte 5 proposed; the first slice is plain TypeScript).
- ⚠️ **GitHub repo `Daniwave100/GeoPace` is currently public**, but D10 says private until the demo.
  Owner to decide whether to flip it to private (GitHub → Settings → Danger Zone).
- 🔍 **NYC 2026 date, by a person, when convenient**: nyrr.org sits behind a waiting room that a browser passes and our
  tools don't (and we don't work around it). If the page confirms Sunday 1 November, set the date's `confirmed: true` in
  `data/courses/nyc/editions/2026.yaml`. Wave times are no longer chased (owner, 09-18): runners type their own (D40).
- ✅ Settled by the owner 09-18: wave start times aren't chased, runners type their own (D38, D40); the map's dimming
  waits for #7 (D39); the splits table is built (D41).
- ✅ Settled by the owner 09-18: a runner can type their own start time (D40), and the strip and readout stay on
  course-line km (D20).
- 🟡 **The owner's look at photoreal (#17)**: needs the owner's own key (the panel in the app says how to get one;
  a Cesium ion token is free and the quicker of the two). What to write down is listed in §6 "The ride".
- 🔍 Verify: Open-Meteo archive limits. ✅ Cesium ion Community terms checked 09-18 (§5): personal, non-commercial use,
  which is what a runner planning their own race is; each runner uses their own account, so the terms are theirs.
  ✅ Settled 09-17: there is no downloadable official NYC course file (D21); NYC Open Data has no usage restrictions.
- ✅ **NYC start line** settled 09-17 from the USATF certification (D25), and pinned by a test. What remains is the
  finish line's exact position (taken as West Drive beside Tavern on the Green); the start moves ~1.5 m for every
  meter the finish is out.
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
- **2026-09-17** — Verified the NYC course against the city's official street list (every segment, in order) and the
  USATF certification NY22001JHP; moved the start line onto the certified separation and re-derived every bridge span
  and landmark from sourced coordinates. Added D25 and a test that keeps the course line on the certified geometry.
- **2026-09-18** — Design mockups (#4): three clickable directions built on one shared, tested core (sun position, race clock
  with the Nov 1 DST change, wind/sun bearings, shadows). Added D26 (SVG model in mockups) and D27 (self-hosted open fonts);
  §6 now lists each candidate's tokens. Direction still open — owner picks.
- **2026-09-18** — Owner picked **B · Race poster** (D28) and asked for a much simpler, non-technical first screen
  (principle 8, D29). §6 now holds B's tokens as *the* tokens, plus a proposed "video player for the course" layout
  that the owner has not yet confirmed.
- **2026-09-18** — Owner confirmed the poster's blue (D28) and set the photoreal/white-model relationship (D30). A three-variant
  prototype of the simplified first screen is on the throwaway branch `prototype/player-screen` for the owner to judge.
- **2026-09-18** — Owner feedback on the prototype: between Guided tour and Poster-cut-down; wants the instrument's clearer
  charts and both themes (D31), a UI that belongs on photoreal imagery (D32), and two cameras with a time-lapse ride (D33).
  §6 "The ride" records Claude's assessment and the recommendation to build one real slice next instead of more mockups.
- **2026-09-18** — Owner set the app's shape: a map home (**Explore**) with layer toggles, plus the **Ride** (D34, D35); asked
  for crowd support and runner congestion, agreed as a subjective Crowds layer (D36) and sourced Bottlenecks with a model
  later (D37). §6 and the v1 roadmap rewritten to match; `CONTEXT.md` created as the glossary; GitHub issues re-cut
  (#6 Explore, #8 Ride, photoreal split out, #13 widened). Berlin 2026's date and first start time verified (§5).
- **2026-09-18** — Race plan, race clock and scrubbing (#5): edition facts for both courses and the carried-over and
  not-published rules (D38, Course Bundle `schema_version` 2); the Planner core, the remembered Race Plan, a plain km strip
  and readout; Cesium's clock slaved to the race clock with sun lighting kept on at city scale (D39). NYC's date now has
  a source in the organizer's own rule but is marked not confirmed; its wave times are carried over from 2025 until a
  person can read nyrr.org. The mockups use the same edition facts instead of invented wave times. After review: three of
  these calls are flagged 🟡 for the owner rather than recorded as settled (§10).
- **2026-09-18** — Owner's answers on #5: build the runner's own start time (D40, built); keep the strip and readout on
  course-line km (D20). Branch `v1-foundation` pushed at the owner's request. Still open for the owner: Berlin's
  not-published waves, the NYRR guide as NYC's source, the map dimming with the sun, and whether to add a per-km table (§10).
- **2026-09-18** — Owner's second round on #5: don't chase wave start times, runners type their own (D38, D40); leave the
  map's dimming until #7 (D39); splits table built (D41); an imperial / metric toggle is required (D42, now #19). #5 closed; the map-dimming question is noted on #7.
- **2026-09-18** — Photoreal with the runner's own key (#17): "Make it photoreal" on the map, a panel that says where to
  get a key, how long it takes and what it costs (each fact sourced, §5), Google's tiles with the logo and data credits on
  the map, a note that their shadows are illustrative, and the keyless map back with a reason whenever the imagery can't
  be had. Added D43 (how the key is handled) and D44 (photoreal can fail, the view can't). Verified both providers' prices
  and ion's Community terms. The owner's look at real imagery, which settles the On the road camera's height (D33) and
  what #6 must allow for (D32), is still to do: it needs the owner's own key.

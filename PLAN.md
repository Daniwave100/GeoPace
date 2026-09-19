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
| D18 | ✅ **Bridge decks the ground model drops are listed as sourced course facts** (km span + OpenStreetMap way). *They were spanned in a straight line between the two ends until 09-18; the deck's height is now read from Berlin's surface model (D50), and the straight line is only the fallback.* | Berlin DGM1 omits most decks: the Moltkebrücke read as the Spree 6 m below and faked a −4.7% grade. A straight span is right for low, flat city bridges. NYC's high bridges still need deck heights from surface data (#3). | 09-16 |
| D19 | ✅ **Course Bundle = one JSON file per course**, `data/derived/<id>/course-bundle.json`, validated on both sides against `schema/course-bundle.schema.json` (`schema_version` 1; 2 since D38 added editions; 3 since D45 added where the height is not measured; 4 since D51 added each point's height above the ellipsoid). Measured data (and values computed from it by published models, like difficulty) sits under `measured`; subjective data will get its own section. Every landmark carries its source into the bundle. | One versioned contract; drift is caught when loading instead of showing wrong numbers. Berlin's bundle is ~210 KB. | 09-16 |
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
| D32 | ✅ **The interface has to belong on top of photoreal imagery, not beside it.** The design is judged against Google's photoreal city, not only the white model. Not "a map inside a web page". | Owner directive 09-18. None of the mockups or prototypes had been seen against real imagery. **Owner's look, 09-18 (#17):** solid black and white blocks read fine over the imagery, and the course line's colour and width are "good". One thing gets lost, and only up close: the line is draped over whatever is highest, so on a bridge it runs over the towers and cables instead of the road (§6 "The ride"). | 09-18 |
| D33 | ✅ **Two cameras, and the ride is a time-lapse.** A bird's-eye view and a runner's view of the same ride; nobody watches a three-hour video. *How low the runner's view can go:* **the imagery doesn't set a floor.** Owner's look, 09-18 (#17): having gone "really close to the ground", the owner found New York "really good" and Berlin "still looks good"; trees go first and are "not bad". No number was written down. What the On the road camera needs instead is the road's own height, which the app doesn't have yet — see §6 "The ride". | Owner's vision 09-18: "like a drive cam… you're on the actual ground", plus a bird's-eye view. | 09-18 |
| D34 | ✅ **Two modes: Explore and Ride.** *Explore* is home: the city seen from above with the course on it, moved freely like any maps app, with layers switched on and off. *Ride* carries the runner along the course as a time-lapse that slows down at Stops, seen either **From above** or **On the road** (D33). The same layers, the same strip and the same sentence appear in both. This settles D29's open "how", and replaces Claude's earlier proposal that the whole app be a video player: the player is the Ride. | Owner's idea 09-18, and better than the proposal it replaces: a runner's questions are random-access ("where's the last hill?", "where will my family stand?") and a map answers them at once, where a ride makes them wait. From above is also where Google's imagery is at its best. | 09-18 |
| D35 | ✅ **One layer system; layers are drawn on the course line, one at a time.** Switching a layer on marks the course line on the map, adds that layer's row to the strip, and adds its clause to the sentence. ⛔ No area heat maps or coloured blobs over the map. One layer is on at a time by default; "Show everything" opens the full strip. Plain names: **Hills · Sun · Wind · Aid · Crowds · Bottlenecks · Watch trouble**. **Owner, 09-18, on seeing Explore:** one at a time is right for now, but some layers may want to be on together later (crowd zones with congestion, say): "maybe we can make it work out, we can see". Nothing built for it; the state is one id today and would become a set. | All of GeoPace's data lives along a line, and coloured areas over satellite imagery are hard to read. One at a time keeps the screen from becoming "a lot" again (principle 8). | 09-18 |
| D36 | ✅ **Crowd support is a v1 layer, and it is subjective.** "Crowds" shows where spectators are, from three kinds of source: runner reports (loud / mixed / quiet stretches, paraphrased with links), official cheer zones and entertainment points (sourced facts), and stretches where spectators aren't allowed, such as bridges (sourced facts). ⛔ Not a heat map: nobody measures spectator density, and a smooth gradient would claim data we don't have. Moves up from Tier 3; contributed ratings and derived spectator access stay there. | Owner asked for it 09-18. It costs little because it uses the same research method as the watch-trouble reports (#13), and it keeps principle 3: hearsay is drawn as hearsay. | 09-18 |
| D37 | ✅ **Runner congestion: bottlenecks now, a model later.** v1's "Bottlenecks" layer shows places known to be congested, as sourced facts (e.g. where New York's three start colours merge) and runner reports. It gives no density numbers. A modelled "how packed will it be around me" layer is Tier 2: it needs the field's finish-time spread from officially published summaries only (⛔ never scraped results), wave sizes and street widths. | Owner asked for it 09-18. It is the hardest thing on the list with the least data behind it; a number here would be invented precision (principle 5). | 09-18 |
| D38 | ✅ **Edition facts are one YAML file per edition, `data/courses/<id>/editions/<edition>.yaml`, and travel in the Course Bundle (`schema_version` 2).** Each holds the race date and the runner waves, every fact with its source. A wave time is written as the organizer prints it (wall clock, in quotes); the pipeline adds the exact instant with its UTC offset, worked out in the course's IANA zone, and the app works it out again on its own, so the two check each other. Three honesty rules, enforced by the loader and by the schema: a time copied from an earlier edition is **carried over**, with the edition it came from and a reason the runner sees, and the app greys every time of day that rests on it; a wave whose time **nobody has published** is listed with no time and a note, is never filled with a guess, and can be planned with only once the runner types their own start time (D40); a race date the organizer hasn't stated for this edition is marked **not confirmed**, with how it is known. ⛔ Third-party wave times: not an organizer or an authority (`CONTEXT.md`, *Sourced fact*). **Owner, 09-18: don't chase wave start times for either race; runners type their own (D40).** So Berlin's waves 2–6 stay "not published", and NYC's 2025 times (from NYRR's 2025 runner guide on `webassets.nyrr.org`, a public file host the repo already cited) stay only as what the start-time box shows until the runner types theirs, flagged as carried over. Nobody needs to go and verify them. | Berlin 2026: the organizer confirms the date and only the first runner start (08:45, "in 6 waves"); the other five are on each runner's start card, the 2025 schedule couldn't be retrieved, and the 2026 page hints the wave layout changed. NYC 2026: the waiting room passes a browser, not our tools, and we don't work around it; the 2025 guide gives the five wave times (carried over) and the rule "the first Sunday in November" (the date, not confirmed). A required new field breaks old readers, hence version 2. | 09-18 |
| D39 | ✅ **The 3D scene has no clock of its own: Cesium's clock is stopped and set from the Planner's race clock**, so the scene's sun is the sun at the moment the runner reaches that km. **Look — owner, 09-18: leave it for now and decide in #7**, when the white model's shadows arrive. Cesium's sun lighting is kept on at city scale (by default it fades out within ~10,000 km of the ground, so a city never looks dark), so the map dims as the sun gets low and drops to Cesium's night-side floor (30%) after sunset. It is three lines in `app/src/scene/globe.ts`. | One source of time means the strip, the readout, the sentence, the marker and the sun can't drift apart. Without the lighting change the sun moved but nothing on screen showed it: measured in headless Chrome, map brightness 206 → 63 between an 11:30 start and an 18:00 finish in New York on Nov 1. It becomes properly visible with the white model's shadows (#7), at which point dimming the map may no longer be needed. | 09-18 |
| D40 | ✅ **A runner can type their own start time, and it outranks everything else.** Under the wave there is always a start-time box: it shows the wave's published time, and the runner can overwrite it. It is the only way to plan with a wave whose time isn't published (Berlin 2026's waves 2–6). The runner's own time is never greyed, even on a carried-over wave, and typing a carried-over time back in counts as confirming it. Picking a wave with no published time doesn't blank the screen: until a time is typed, the plan is unchanged and the form says whose times are still showing. It is part of the Race Plan and is remembered with it. | Owner, 09-18: "type your own start time would be very good". Each runner's start card is a better source for that runner than any schedule, and it closes the gap the review found: a four-hour Berlin runner was shown wave 1's times with nothing to be done about it. | 09-18 |
| D41 | ✅ **A splits table: the time of day and elapsed time at every kilometre, and at the finish.** Closed until asked for (principle 8); every kilometre in it is a button that moves the runner there. Same honesty as the readout: times of day resting on a carried-over start are greyed. Kilometres are course-line km, like the strip (D20), so where that shows at the second the table says why a kilometre takes less than the runner's pace (New York: 5:37 against a 5:41 pace, because the mapped line is 42.69 km). The Planner computes splits at any step, so a table in miles is the same call with 1.609344. | Owner, 09-18: "a splits table would be pretty nice". #5 asked for times "at every km"; scrubbing alone made a runner hunt for them. | 09-18 |
| D42 | ✅ **The app has an imperial / metric toggle.** *Built with Explore (#6, 09-18), to #19's specification: a km · mi switch in the banner, one module (`app/src/core/units.ts`) that every distance, height and pace goes through, keyboard steps that land on whole miles and tenths of a mile, a pace typed per mile, splits per mile, and the choice remembered beside the plans (not inside one), so it applies to both courses and can never change a plan.* As decided: It is the *units* choice the Race Plan already lists (`CONTEXT.md`), so it is remembered with the plan. Everything stays metric inside (CLAUDE.md conventions: meters, km from the start); only what is shown and typed converts: the readout and the strip's marks (miles), the goal as a pace per mile, the splits table per mile, heights in feet on the profile. Until it exists, nothing new should format a distance in a way that would be hard to switch. | Owner, 09-18: "we have to also account for a toggle for imperial and metric units". New York is the launch course and its runners think in miles. | 09-18 |
| D43 | ✅ **The runner's own key: one box, told apart by shape, kept only in the browser, sent only to its own provider.** The panel has one box for either kind of key. A Google Maps key (`AIza…`) and a Cesium ion token (a JSON Web Token, `eyJ…`) are recognized by shape, the panel says which it found and the one host it will go to, and anything else is refused without being sent anywhere. A Google key goes only to `tile.googleapis.com`; an ion token goes only to `api.cesium.com`, and ion answers with a short-lived key of its own for the tiles, so Google never sees the runner's token. The key is handed to CesiumJS explicitly each time and is ⛔ never set as a CesiumJS default (`Ion.defaultAccessToken`, `GoogleMaps.defaultApiKey`); CesiumJS's own bundled demo ion token is switched off. It is stored in `localStorage` under `geopace.photoreal`, apart from the Race Plan, with whether photoreal was left on; masked as it is typed, and afterwards shown only by its last four characters. The box is deliberately *not* a password box: browsers offer to save those to a password manager, which would be a second place the key is kept, and one that may sync it to other machines. ⛔ No key from the build's environment (`VITE_…`), the page address, or any file. | D3 made the key the runner's; this is how that promise is kept and tested. Guessing the provider could send one company's secret to another. A CesiumJS default is sent by any part of CesiumJS that reaches for it. The owner will record a launch clip with photoreal on, so the key must never be readable on screen. Keeping it out of the Race Plan means a plan can later be shared or exported safely. Tests: the real CesiumJS request code with the network replaced by a recorder, and a guard that reads every tracked file for key-shaped strings. | 09-18 |
| D44 | ✅ **Photoreal can fail; the view can't.** The keyless map is left in place until the imagery's first view has fully arrived, and only then is the plain ground hidden (left on, it pokes through Google's mesh). If the provider refuses the key, says it is over its allowance, or can't be reached, or if the imagery stops arriving later (the very first tile fails, or eight tiles fail in a row with none arriving between), the imagery is removed, the keyless map is showing, and a message says what happened and what to do. The course, the strip and the planning layers never wait on photoreal. There is never more than one load under way, and imagery that arrives after the runner changed their mind (turned it off, pasted another key) is thrown away without ever being put on screen; removing imagery only puts the plain ground back if that imagery was what hid it. A reload opens the way the runner left it. | D30: never a blank view, never a nag. A provider counts and bills each *load* (one start of photoreal; looking around afterwards is free for about three hours), so a double click must not cost two. Google ends a session after about three hours, which looks like every tile failing at once: that should land the runner back on the map with a way to start again, not on a broken picture. | 09-18 |
| D45 | ✅ **The Course Bundle says where the height is not measured** (`measured.elevation_not_measured`, required, so `schema_version` 3). The pipeline already knows: every Berlin bridge is a straight line between its two ends (D18), and a New York bridge deck can have a gap in its LiDAR scan. Each stretch is listed in course order with a reason written for the runner. A gap shorter than the 50 m smoothing is not listed (it vanishes inside it; a few samples without returns are on every bridge); a straight-spanned bridge always is, however short. Built 09-18: New York lists five, led by the Verrazzano's unscanned main span, **km 0.77–1.36** (earlier notes said "about 0.85–1.45", from before the start line moved under D25); Berlin lists its ten bridges. Rebuilding both bundles changed nothing else in them. | Principle 5. The strip, the map and the sentence must grey out what isn't measured, and the app was carrying the one known gap as a constant in its own code, with a stale position. Required rather than optional because a bundle that says nothing would read as "all measured". | 09-18 |
| D46 | ✅ **Explore, as built (#6).** *Owner, 09-18, after looking at it: the strip and the credits below the map are "fine"; "I really like the light mode, and I like the charts on the bottom". The owner asked for three things, all built the same day: the strip's **top edge drags** (and answers to the arrow keys; Enter or a double click puts it back) to resize the rows or give the map the room, remembered; **Full map** (button, or F with the map focused) gives the map the screen, with the readout and strip out of the way, our credits folded to one line with Credits and Sources one press away, and the map's own credits still on it; **Straight down** (button, or B) looks from directly above, north up, like a paper map, and tips back to the tilted view.* Top to bottom: a black **banner** (course picker, the race plan in one line with a button that opens the plan and the splits, km · mi, Auto · Light · Dark); the **map**, full-bleed, with the **readout block** laid over its top left (the distance as the one giant numeral, time of day, elapsed, the sentence) and "Make it photoreal" and the map's buttons on its right; then the **layer switches**, the **strip**, and the **credits**, always on screen, with Sources one step away. Nothing is on by default. The map keeps its own credits along its bottom edge: when the strip grows the map gets shorter rather than being covered, and the readout block stops short of them. The camera frames the whole course, tilted 60°, inside the part of the map no block covers. On a narrow or short screen the blocks stack under the map instead of over it. If the runner hasn't moved the map, it frames the course again when the strip changes height; once they have, it is theirs. No label is ever placed over the map's credits. The map answers to buttons (zoom, whole course, where I am) and, focused, to the arrow keys and + / −; how to move it is one line of small print beside Sources, not a tooltip. "Ride the course" had its place under the sentence; *#8, 09-19: built on the top of the map instead, and why, in D53.* | D32: opaque blocks over the map, never a panel beside it and never glass. Google's terms and the keyless providers' both want their credits on the map (§9), which an overlaid strip would have hidden. Principle 8: the plan form was "a lot", and is one press away instead. | 09-18 |
| D47 | ✅ **A layer is data; the screen decides how it looks.** A layer (`app/src/core/layers.ts`) gives three things: its rows for the strip, its marks on the course line, and its clause for the sentence, and says of each which kind of claim it is. One table (`core/encoding.ts`) turns that into a look on every surface: measured = solid (a solid trace, ink under the blue line, plain words) · what runners say = hollow · not measured here = grey and struck through (a dashed trace, grey dashes on the line, struck-through words with "Not measured here." left standing) · sample = hazard stripes and the word. A later ticket adds a layer by writing one of these and adding it to the list in `main.ts`; it cannot pick a colour. Only layers that exist get a switch. **Hills** marks each climb and descent of at least 1% that gains or loses at least 5 m (New York: 28; Berlin: 2) as wide ink under the blue line, with a label ("Up 3.0% · 1.3 km") that gives way to a bigger hill's when they collide; its rows are Grade and Effort. With Hills on, **every** stretch that is not measured is grey dashes on the map, whether or not a hill runs over it: the map must not say less than the strip and the sentence (🟡 the thresholds, and whether Berlin's short bridges earn their dashes, are the owner's to judge). Start and Finish are the course's blue, so they can't be mistaken for a hollow runner report. Where a value is not measured, the reason is printed under the sentence, not left to a tooltip. **Owner, 09-18:** asked what the black edge, the white edge and the "checkered boxes" on the line were, so a key now sits under the strip whenever a layer is on (not only with Show everything), starting with what the layer's marks on the line mean. ✅ **Steepness is a warm colour on the hill's edge (owner's pick, 09-18: "B, color reads wayyy better. Keep that one").** The owner asked for steepness to show at a glance and proposed green / yellow / red. Claude advised against that exact scheme (green for flat would paint over the blue line for most of every course; red against green is the pair one man in twelve can't tell apart; it is the look of every other running app) and put two looks on trial behind a switch: A, ink that got heavier, which Claude preferred for staying inside black, white and one blue, and B, **pale yellow `#ffd84d` → orange `#f07f1f` → deep red `#a3150f`**, darker as well as redder, never green. The owner chose B by eye; A, the switch and the address option are gone. Three steps, up or down alike: gentle from 1%, a proper hill from 2%, steep from 3.5% (New York: about 10, 7 and 3 km; Berlin: gentle throughout). The strip's Grade row is filled in the same three colours. **Owner, later on 09-18, two refinements, both built:** *descents in a cool colour*, and *a fade instead of sudden changes*. The owner proposed light blue / aqua for descents; Claude agreed with cool for down (it fixes a real gap: a climb and a descent looked the same on the map; and a gentle descent does cost less than flat) and advised **teal rather than light blue**, because blue is the course and because water on the keyless map is light blue, exactly where New York's descents are (coming off bridges): **pale aqua `#a5e8dc` → teal `#1fa698` → deep teal `#0a5a55`**, as dark at the steep end as the red is. The **fade** runs through the same three stops each way, so the key's words stay true ("the paler, the gentler; the darker, the steeper"); what goes is naming a class ("orange is a proper hill"), and the exact number is still on every hill's label and under the cursor on the strip. Steepness is now one smooth scale, −1 to 1: nothing under 1%, the middle at 3%, the end at 4.5% and beyond, negative coming down. On the strip the Grade row is filled bin by bin from it. On the map CesiumJS cannot blend colours along a line draped on the ground, so each hill is cut into pieces in ten shades each way (New York: 327 pieces, 92% of joins one shade apart; 60 frames a second with and without them); when #22 makes the photoreal line a true 3D line, a real blend comes built in. *#22, 09-18: not taken up. The pieces stay, so the hills look the same draped and at road height, and the course is now drawn as **one line per stretch** that paints the blue, the layer's colour beside it and the hairline edge itself (`scene/course-ribbon.ts`, D52), instead of a wide mark with the blue line laid over it. **On the map, *not measured here* is a flat grey band, not dashes (owner, 09-18, second look at #22).** It is the hill's band with the colour taken out: the same width, the same hairline edge, no pattern. The dashes were first laid straight on the map, then (#22) put on a paper band with a hairline edge so they would read the same over pale and dark ground; both times the owner took them for a fault in the drawing ("checkered boxes", then "weird rectangles… see what that's about and try to fix that"): blocks beside a line look like a glitch, and on the Queensboro's 80 m gap they were a white box with three squares in it. Greying out is what *not measured* means everywhere else in the app. Mid grey is the one tone a photographed road may match exactly, so the band never relies on the ground to be seen: it stands between its black hairline and the course's white edge, 3:1 against each (a test holds that). The strip still dashes its trace and the sentence still strikes its words through. The dashed construction (a band, a hairline edge, dashes narrower than the band) stays for *sample*, which no layer draws on the map yet. ✅ *The grey band was Claude's answer to the owner's "try to fix that"; the owner looked at it over real imagery later the same evening: "everything looks good".* Checked in headless Chrome over the light and the dimmed dark keyless map.* Any layer that says *how much and which way* gets these ramps from `core/mark-look.ts` (against the runner is warm, with them is teal: wind will want the same); a layer still never picks a colour of its own. The **height** is the strip's own row, there whatever the layers are doing, with the course's total climb and descent. Labels on the map are HTML blocks placed over it each frame, not text painted into the 3D scene, so they are the poster's type, can be struck through, and are buttons the keyboard reaches. | D35, and the acceptance test of #6: the encodings are the same on the map, on the strip and in text because they come from one table, and a test reads the stylesheet to check each has its class. Coloured areas over imagery stay ruled out. | 09-18 |
| D48 | 🟡 **The sentence is short clauses, each a complete statement** *(Claude's wording; the owner's to confirm)*: the clause of the layer that is on, then the landmark the runner is at (the nearest within 250 m) or coming to (within 1.5 km, with how far), then the side the sun is on. "Climbing 4%. Ed Koch Queensboro Bridge in 600 m. Sun on your left." The sun's side is always there, layer or no layer: it comes from the race clock, and it is what shows that scrubbing moves the sun. ⛔ Working a landmark into another clause's grammar ("onto the…"). The earlier wording with the sun's height and compass point is gone from the sentence. | Landmark names are hand-maintained facts and some are phrases ("Leaves the park at Grand Army Plaza"); a name on its own always reads right. A runner asked where the sun is wants a side, not an azimuth (principle 8). | 09-18 |
| D49 | 🟡 **Themes: Auto, Light, Dark** *(D31 decided both themes and the switch; these particulars are Claude's, the owner's to confirm. **Owner, 09-18:** likes light; of dark, "not the biggest fan… not so dark". So dark is now charcoal `#262624` rather than black, with the banner still black, and the keyless map goes quiet in it: dimmed and almost without colour, which CesiumJS can do to our own basemap layer alone. Claude had said the map couldn't follow the theme; that was wrong. Photoreal imagery is Google's and is shown as it comes. Still the owner's to confirm by eye.)*, a switch in the banner, remembered; Auto follows the system and keeps following it while the app is open; the theme is set before the first paint so a dark screen never flashes white. The map itself does not change with the theme, and neither does anything drawn on it (the blue is `#1546ff` there in both). **Grey words are darker than grey marks**: the token grey (`#8a8a86`) is for traces, dashes and fills; text that is greyed (carried over, not measured, small print) uses `#5c5c58` on paper and `#a9a9a4` on black, because the token grey on paper is about 3:1 and small type needs 4.5:1. The banner is black in both themes, with a paper-coloured focus ring, since the blue on black is too faint to find. | D31. Readability of the honesty flags is the point of having them. | 09-18 |
| D50 | ✅ **Berlin's bridge decks are measured, from the city's surface model** ([ATKIS® DOM1](https://gdi.berlin.de/data/dom/atom/), 1 m grid, dl-de/zero-2.0, same tiling and text format as DGM1; feed updated 2025-08-07, tiles from a 2021 flight; accessed 09-18). On each listed bridge the pipeline takes every surface cell within 3 m of the course and sorts them into layers exactly as it does New York's LiDAR returns (D23): a lamp post is too few cells to be a layer, a car sits inside the deck's own layer and loses to the median, a tree's canopy is a second layer that doesn't carry on from sample to sample. Seven tiles (~140 MB) cover all ten bridges. Result: every deck is within 1 m of the old straight line, the arched ones show (Michaelbrücke +1.0 m, Kronprinzenbrücke +0.6 m after the 50 m smoothing; its raw deck crests 1.7 m above the line), total climb goes from 72 to 75 m, the course changed nowhere else, and **nothing in Berlin is "not measured" any more**. The surface model's heights are DHHN2016 like the ground model's (the city's [DOM page](https://www.berlin.de/sen/stadt/stadtdaten/geoinformation/landesvermessung/geotopographie-atkis/dom-digitales-oberflaechenmodell/): "Höhenbezug: Deutsches Haupthöhennetz DHHN2016", accessed 09-18; the feed's own metadata doesn't say); on the streets at each bridge's ends it agrees with DGM1 to about 0.1–0.2 m. | Owner, 09-18: "try to fix Berlin's bridges if you can", about the grey dashes on ten short bridges. Restyling them away would have hidden a guess; measuring removes it. It also puts the surface model, which building shade (#9) needs anyway, into the pipeline with a tested reader. | 09-18 |
| D51 | ✅ **The road's height in the 3D scene is the pipeline's own: every course-line point carries its height above the ellipsoid, from one worldwide geoid model, EGM2008** (`measured.course_line.ellipsoid_height_m`, required, so `schema_version` 4). The surveys give heights above sea level (New York NAVD88, Berlin DHHN2016); CesiumJS counts heights from the WGS84 ellipsoid; a geoid model is the published table of the difference, and the pipeline adds it point by point: sea level is **32.4–33.0 m below** the ellipsoid along the New York course and **39.5–39.8 m above** it along Berlin's. The model is NGA's 2.5-minute grid, read between the four grid points round each place (`pipeline/src/geopace/geoid_egm2008.py`; sources in §5). ⛔ Each country's own model (GEOID18, GCG2016) as the default. ⛔ Anything read from Google's surface (D5). | Asked by #22, verified 09-18, never from memory. *Which model fits each height system:* GEOID18 for NAVD88 (the DEM was made with GEOID12B, the LiDAR files NOAA serves with GEOID18; 1–2 mm apart in New York) and GCG2016 for DHHN2016 (1 cm). *Why not use them:* each gives heights above its **own national ellipsoid frame**, not WGS84's. For New York that frame (NAD83(2011)) is **1.25 m** from WGS84's in height, and the standard software conversion between the two is a do-nothing placeholder, so the step is easy to lose without any error (§8). EGM2008 is referred to WGS84 itself, is one public-domain file, and works for any city a course is ever added for (principle 2). *What it costs, measured along both courses:* EGM2008 is **0.21 m above GCG2016** everywhere in Berlin (0.208–0.214) and **about 0.37 m above** GEOID18 plus the frame step in New York, which is NAVD88's known offset from global models (NGS: "biased by about one-half meter"). *Why that is good enough:* Google publishes **no height reference and no accuracy** for its photographed city, and CesiumJS's own staff say they can't confirm one, so nothing finer could be checked against what is on screen; the app floats the line above the road by more than this anyway (D52), and the two cities' offsets differ by only 0.16 m, so one lift means the same thing in both. Required rather than optional (the D45 precedent): a bundle that says nothing would be drawn at a guess. Tests: the grid reader on a made-up grid; the real model against values worked out by other software in both cities, with opposite signs; a model that doesn't cover the course is refused; the Queensboro is still on its lower deck after the conversion. Rebuilding both bundles changed nothing else in them. | 09-18 |
| D52 | ✅ **In photoreal the course is drawn at the road's own height; on the keyless map it stays draped** (#22). **Owner, 09-18, with their own key: "Wow this looks great… It's like actually on the road. The bridge, the line on the bridges look great"; and their pick for what is left of the line behind things: "the line is always there, even if it's behind a building, but it's faded."** The lift stayed at 1.5 m and wasn't remarked on. **Owner's second look, later on 09-18, at the three fixes below and the grey band (D47): "ok everything looks good."** So the distances at which the line counts as behind something, the grey band and the runner's dot are all confirmed as built. *Decided by the ticket:* while photoreal imagery is in place, the blue line, the layer's marks, the runner, the start and finish dots and the labels stand in 3D at `ellipsoid_height_m` plus a small lift, instead of being painted onto whatever stands over the road; on the keyless map nothing stands over the road and the open terrain is too coarse for surveyed heights, so everything stays draped. The switch happens at exactly the two moments the plain ground goes and comes back (D44): when the imagery's first view has arrived, and when the imagery is removed for any reason (turned off, key refused, tiles stop arriving, "Forget my key"); imagery nobody wants any more never moves the line. Nothing reads, samples or stores Google's surface (D5): at road height the heights are the bundle's, and what is draped rests on **our own open terrain only** (`ClassificationType.TERRAIN`, `CLAMP_TO_TERRAIN`), because for the second or two between turning photoreal on and its first view arriving Google's tiles are already in the scene, and CesiumJS's plain "clamp to ground" would have rested the runner, the end dots and the draped line on them (found in review, §8). *The values, in `app/src/scene/placement.ts` (`ROAD_LOOK`); they were Claude's starting point, and the owner looked at them over real imagery and kept them:* **lift 1.5 m**; where something stands in front of the line (a tree, a tower, the Queensboro's upper deck, a building) it stays on the map **fainter (45%)** rather than vanishing (the owner's pick); where the height is **not measured** (the Verrazzano's main span, D45) the line is **never hidden, whatever is picked for the rest: it shows through, fainter**, because there it is known to be a few metres under the real deck, so the deck itself is in front of it, and hiding it would be hiding our own gap. *Fainter, not full strength (changed after review, 09-18):* at full strength a filled-in stretch looked surer of itself than a measured one behind a tree, against D45; and the Queensboro's two short unmeasured stretches (km 25.25–25.33, 25.93–26.21) are on the lower deck, where full strength would have shone through the upper deck beside faint measured neighbours. **The line is judged behind something once, at its middle, for its whole width (after the owner's screenshots, 09-18).** CesiumJS asks "is this hidden?" pixel by pixel, and the line is flat to the camera over a road that recedes: at a tilt the road itself is nearer than the lower half of a wide line, so that half came out faded and the other half solid. Now the pixels CesiumJS calls hidden and the ones it doesn't are drawn by one and the same material, and the material asks once, at the line's own middle: how far clear of me, measured square to it, is whatever is drawn there? Under 1 m (the road, a bump in it, the survey and the photograph disagreeing) the line is as strong as ever, which also means it no longer goes patchy where Google's road sits a little above ours; over 3 m (a tree, a tower, the deck above, a building) it is as faint as it gets; and from so far away that a pixel spans 2–4 m or more, nothing is faded at all. It reads this from the depth of the scene CesiumJS has already drawn, imagery included. That is knowing what is in front of our own line on screen, for drawing it, exactly as the graphics card's own hidden-surface test does; nothing is kept, worked out or placed from it, so D5 holds. **The runner and the start and finish dots are plain HTML laid over the map** (`scene/map-dots.ts`), like the labels: in the 3D scene they were painted over by the line wherever it shows through (the owner's runner was a pale ghost under the band). *To settle the rest:* the throwaway branch **`prototype/line-on-road`**, opened with `?line-trial` in the address, has a panel that changes all of these while the app runs, switches between draped and road height to compare, and jumps to the Verrazzano, the Queensboro, 1st Avenue, Central Park, the Tiergarten and Berlin's bridges; it writes the picks out in one line to copy back (§10). | The owner, twice on 09-18: the line rides the bridge's structure, not the road, and "when the camera moves, the line isn't staying static". A lift because Google's surface and a surveyed road don't agree to better than a metre or so and traffic is baked into the imagery as bumps: too low and the line sinks into the road in patches, too high and it floats. Fainter rather than hidden because a line that vanishes under every tree is a worse map; how faint, and whether it should show through buildings at all, can only be judged on real imagery, which needs the owner's key. Found while building, in a browser: drawn as a wide mark with the blue line on top, the mark was painted **over** the blue wherever the line shows through (CesiumJS draws "shows through" by painting over everything nearer), so each stretch is one line that paints its whole cross-section (D47, §8). | 09-18 |
| D53 | 🟡 **The Ride, as built (#8).** *What it does is the ticket's; every number below is Claude's starting value, and how it feels over real imagery is the owner's to judge (§10): Claude has no key.* **Stops** (`app/src/core/stops.ts`): the start, every landmark, the finish, and each climb that gains **15 m or more on measured height**: New York's Lafayette Avenue, Queensboro and Fifth Avenue (the Verrazzano's climb begins at the start, which is a Stop already), 18 Stops in all; Berlin has no such climb, 14 Stops. A climb whose height is partly filled in names no Stop: "Climb of 40 m" is a claim about height (D45). A climb is a **stretch**: the Ride arrives at its foot and stays slow all the way up it (no nearer its cruise than three tenths), let go of gradually past the top, never all at once, and From above stays down for the look. The Verrazzano's climb, which gives way to the Start at its foot, hands the Start its end (km 0.72), so the race's most famous hill is slow all the way up too. Both ends are always Stops, even with a landmark near one; every landmark is a Stop however close to another. 🟡 **The ticket says "the steepest climbs"; built as the biggest.** By mean grade New York's steepest are two short bridge ramps, 5.8 m before the Willis Avenue Bridge and 12.5 m before the Pulaski Bridge, each just before a landmark Stop, and Fifth Avenue (2.1%, 28 m, the one runners talk about) would not make the list. The owner's to overrule (§10). **The time-lapse** (`core/ride.ts`): *From above* 550 m of course a second between Stops and 80 m/s within 120 m of one, easing over 500 m, so the whole course is **2.9 min in New York and 2.6 in Berlin**; *On the road* 120 m/s and 12 m/s within 30 m, easing over 250 m: **about 12½ and 10½ min**, which is the ticket's "gentler" (it says "a couple of minutes" of the Ride as a whole; on the road that speed would be a blur). The Ride also **eases off through a sharp turn**, so the view never swings faster than 20° a second from above or 60° on the road (a quarter turn in a second and a half): at a time-lapse's speed a city block's corner is a whip, New York's mile in the Bronx is five in a row, and the road onto the Queensboro Bridge turns a full circle in 270 m. On the road that means slowing into every street corner, as a vehicle does, to about 13 m/s. **A Stop stays the slowest thing on the road**, which is the ticket's own test ("slower near a Stop than between Stops"): between Stops a turn never takes the Ride down to a Stop's speed; near a Stop it may, and right at one it may go as slow as 3 m/s, the pace of the run itself, which is what Columbus Circle needs, where New York turns back on itself at a Stop. The swing is measured **a metre at a time** (where New York doubles back at Columbus Circle it all falls within 4 m, and measured 10 m at a time it fell between two measurements: the Ride sped up at the apex and the view swung at 250° a second), and the Ride **brakes for what is coming** at a rate (60 m/s² on the road, 400 from above) and picks up the same way, instead of dropping from 120 to 25 m/s in a sixth of a second at every corner; its speed is still a plain function of the km. At the one or two places where even the slowest the Ride may go is not slow enough (Columbus Circle, at 3 m/s: about 110° a second for a moment) the swing is whatever the road demands. The turns cost 5 and 10 seconds from above, and about two minutes on the road (127 s in New York, 106 s in Berlin). **The cameras** (`core/ride-view.ts`, pure geometry: the same km always gives the same view, however the Ride got there): *On the road* is **3 m above the road** (`ON_THE_ROAD_HEIGHT_M`, the one setting the ticket asks for: a lead vehicle's height, and it has to fit under the Queensboro's upper deck, 6.4 m above the lower one, D23), **25 m behind the runner on the road itself**, so it is never inside a building on a corner, **looking at the runner**, across and down, over the real distance to them (where the road doubles back they are a few metres away and far below the horizon), who is therefore always in the middle of the view (*first built facing the way the road goes 140 m ahead; review measured the runner out of shot at every street corner, 14% of New York, and 116° off at the Queensboro hairpins*). **Where the height is filled in, it rides over an estimate of the crest**: 3 m over the Verrazzano's straight-line fill is at or under the real deck (§5: "the real crest is a few meters higher"), so there the camera adds the rise of a parabola between the grade the road arrives at and the grade it leaves at, (grade in − grade out) × length ÷ 8: 3.6 m at the Verrazzano's mid-span, nothing for a dip. An estimate for keeping the camera out of the road and nothing else: never shown, never used where a height is measured, and only ever added to the bundle's own heights (the open terrain the course is draped on has no bridge in it to crest); *From above* is tilted 50°, **900 m from the runner at a Stop and 2,200 m at the cruise** (it comes down for a look as the Ride slows), facing along the straight line from 1 km behind the runner to 2 km ahead, with the runner in the middle of the part of the map the readout block leaves clear. **Heights** are the Course Bundle's own above the ellipsoid where the course is at road height (D51, D52), and our open terrain's where it is draped on the keyless map, with the bundle's standing in wherever the terrain has no answer; ⛔ never anything from photoreal imagery (D5). **In the scene** (`scene/ride-camera.ts`) the camera is the Ride's from the moment it takes it until the runner touches the map, and is put where the Ride wants it **before every frame, playing or paused, the view asked for afresh**: so the road's height follows our terrain as finer tiles arrive and the imagery as it comes and goes, and CesiumJS can't lift a paused camera onto whatever stands over the road (§8). The Ride says of each move whether it **rode** there, and the camera is put there, or **jumped** (its start, Back, the other camera, a scrub, Play after the runner looked around), and the camera gets there in a 0.8 s glide that rises in the middle so it goes over the city rather than through it. **A hand on the map pauses the Ride and takes the camera at once**, even mid-glide (a drag, a scroll, zoom, pan, Whole course, Where I am, Straight down; ⛔ not Full map, which moves nothing: the Ride plays on into it), and from then the map is the runner's to orbit, pan and zoom until they ride on. **Reduced motion:** no continuous movement at all: Play steps from Stop to Stop, four seconds by the clock at each, the first step at once; Ride to the next stop is one step; every camera move is a cut. **The controls** are one block **on the top of the map**, in one row with "Make it photoreal" so that neither can cover the other (the player folds its buttons onto more lines first; under 960 px the photoreal block goes under it): "Ride the course", which becomes the player in the same place (Back · Pause / Ride on · Ride to the next stop · From above / On the road · Back to the map, and a line saying which Stop this is or how far the next one is). ⛔ Not under the sentence, where D46 had kept a place for it: tried first, and with a layer on the strip grows, the map shrinks, and the button fell below the fold of the readout block; on the map it is there whatever the strip does, and still there in Full map, which is how the launch clip will be recorded. At the top because the bottom of the map is the map's credits, the near end of the course, and, On the road, the road. The **space bar** plays and pauses (`core/ride-keys.ts`): from the play button, "Ride the course" and a camera; from the map, the strip and the page while the Ride is on; ⛔ not on any other button, which it presses, as a space bar does (*tried first: the Ride's everywhere in the player, which took it from a keyboard user who Tabs to "Back to the map"*); ⛔ not in an open dialog; and in Explore not from the page, where on a stacked narrow screen it still pages down. What keeps it pausing after a *pointer* has pressed Back or Ride to the next stop is that the player then hands the focus to its play button. A held key is one press. The Ride pauses behind the race plan and behind the photoreal key panel. **The strip** names the Stops along its top (every landmark is one), follows the Ride, and scrubbing moves the Ride, which carries on from there; while the pointer holds the strip the Ride waits, so the cursor doesn't run out from under it. The Ride moves the runner through the same path scrubbing does, so the readout, the sentence, the layer that is on and the sun keep up with no code of their own. ⛔ Not built: Claude's earlier idea of switching cameras automatically at each Stop (§6 "Speed"); the ticket asks for two cameras the runner switches. | The ticket, D33, D34. *Why a Stop at the foot of a climb:* On the road looks ahead, so arriving there shows the hill. *Why a straight line over 3 km from above:* the loop onto the bridge is 100 m across under a 3 km line and goes by unnoticed, where following the road's own heading would turn the whole city through 360°. *Why On the road looks at the runner:* first built facing the mean of the road's heading 140 m ahead, which is smooth, and loses the runner at every corner (see above). *Why ease through turns rather than only smooth the view:* smoothing the heading can't bound how fast the view swings at 120 m/s; slowing can (what it costs is measured above). *Why aria-disabled, a status line and kept focus:* the player swaps in where the button was, and Back stops applying at the first Stop; a control must not vanish from under a keyboard. While the Ride plays the strip moves quietly and a status line, on the page from the start, says each Stop as it arrives: sixty sentences a second is noise. A scrub by hand during the Ride is said, and the slider catches up the moment the keyboard comes to it. *Why the Ride slows into corners rather than the view being smoothed:* looking anywhere but at the runner loses them at every corner, and looking at them from 25 m swings a quarter turn in 25 m of road; only slowing bounds that. Checked in headless Chrome: both courses, both cameras, light and dark, 1440 and 420 px, Full map, reduced motion (Berlin stepped 0.70, 12.00, 14.40, 15.30), every map and terrain tile refused, the terrain service answering and its tiles then failing, the space bar from the keyboard and after a pointer press, a drag while paused, a course switched mid-Ride, and the top row measured at six window sizes from 800 to 1440 px with a photoreal notice showing. **Reviewed three times (09-19): adversarially by six reviewers, for standards and spec by two, then the fixes themselves by four; every finding put to a second agent to refute.** What they found is in the changelog. | 09-19 |

---

## 4. Architecture

### 4.1 Stack
| Layer | Choice | Status |
|-------|--------|--------|
| 3D engine | **CesiumJS** — built-in sun position from a clock, shadow maps, timeline, terrain, 3D Tiles (incl. Google photoreal) | ✅ |
| Frontend language | **TypeScript** | ✅ |
| Build/dev server | **Vite** | ✅ |
| UI framework | **Svelte 5** (proposed): small bundles, built-in transitions for a polished custom UI, less boilerplate than React. *Explore (#6) is still plain TypeScript DOM code: small views that are built once and refreshed, with the logic in tested `core/` modules. Nothing depends on the pick yet.* | 🟡 confirm with design direction |
| Charts | Hand-built SVG for the strip, no chart library and no D3 (custom look matters more than a chart library's defaults; the shapes are worked out in `core/trace.ts`, tested) | ✅ |
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
| Bridge deck heights | ✅ [ATKIS® DOM1](https://gdi.berlin.de/data/dom/atom/) surface model, 1 m, read only on the ten listed bridges (D50); a straight line between a bridge's ends is the fallback, flagged not measured | ✅ [2017 NYC Topobathymetric LiDAR](https://www.fisheries.noaa.gov/inport/item/64728), class 17 (bridge deck), as COPC tiles on NOAA Digital Coast; only the corridor around each bridge is read (D23). ⚠️ No returns at all over the middle of the Verrazzano's main span (km 0.77–1.36): that stretch is a straight line between measured deck heights, so the real crest is a few meters higher. The bundle lists it, and four shorter gaps, as not measured (D45). | NYC Open Data / NOAA, as above | ✅ NYC |
| Height above the ellipsoid (geoid model) | ✅ One model for both (D51): **EGM2008**, NGA's [2.5-minute worldwide geoid height grid](https://earth-info.nga.mil/index.php?dir=wgs84&action=wgs84) ("EGM84 and EGM96 are legacy products. Users are encouraged to use the latest EGM from NGA, currently EGM2008"), read as the GeoTIFF the PROJ project serves, [`us_nga_egm08_25.tif`](https://cdn.proj.org/us_nga_egm08_25.tif) (80 MB, once, into the cache). Accuracy where gravity data is good: ±5 to ±10 cm against GPS/levelling ([Pavlis et al. 2012](https://doi.org/10.1029/2011JB008916), its abstract as Crossref gives it). Berlin's heights are DHHN2016 ([city's DGM page](https://www.berlin.de/sen/stadt/stadtdaten/geoinformation/landesvermessung/geotopographie-atkis/dgm-digitale-gelaendemodelle/)); its official model is BKG's [GCG2016](https://gdz.bkg.bund.de/index.php/default/digitale-geodaten/geodaetische-basisdaten/quasigeoid-der-bundesrepublik-deutschland-quasigeoid.html) (1 cm in flat country, above the GRS80 ellipsoid in ETRS89; on the PROJ server as `de_bkg_gcg2016.tif`): **EGM2008 is 0.21 m above it** along the whole course. *Used only for that comparison.* | same model. New York's heights are NAVD88: the DEM via GEOID12B ([InPort 64732](https://www.fisheries.noaa.gov/inport/item/64732), process step 2), the LiDAR files NOAA serves via GEOID18 ([bulk index](https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/laz/geoid18/9306/index.html)); the two differ by 1–2 mm here. [GEOID18](https://geodesy.noaa.gov/GEOID/GEOID18/) (1.27 cm) "should be used exclusively with NAD 83 (2011) epoch 2010.0 ellipsoid heights… WGS 84, ITRF… are not compatible" ([technical details](https://geodesy.noaa.gov/GEOID/GEOID18/geoid18_tech_details.shtml)); NAD83(2011) to ITRF2014 is **−1.25 m** in height in New York (worked out with PROJ 9.8.1's "ITRF2014 to NAD83(2011) (1)"; ⚠️ PROJ's default NAD83(2011)→WGS 84 is a null step, §8). With that step, **EGM2008 is about 0.37 m above** the official route, which is NAVD88's own offset: "biased (by about one-half meter) and tilted (about 1 meter coast to coast) relative to the best global geoid models" ([NGS, New Datums](https://geodesy.noaa.gov/datums/newdatums/index.shtml)). *Used only for that comparison.* | EGM2008: **public domain**, so labelled in the file itself ("Derived from work by NGA. Public Domain") and in PROJ-data's [`us_nga` README](https://github.com/OSGeo/PROJ-data/blob/master/us_nga/us_nga_README.txt); NGA's own page states no terms. For the record: GCG2016 is CC BY 4.0 ("© BKG (year) CC BY 4.0"); GEOID18 is public domain ([NGS disclaimer](https://geodesy.noaa.gov/disclaimer.html)). What the line is drawn against: CesiumJS heights are ["above the ellipsoid"](https://cesium.com/learn/cesiumjs/ref-doc/Cartographic.html), WGS84 by default; **Google states no vertical datum and no accuracy** for Photorealistic 3D Tiles on any page of its Map Tiles documentation we could open, and [CesiumJS's staff](https://community.cesium.com/t/google-photorealistic-3d-tiles/24587) "cannot confirm what height reference Google uses". Test values from [GeographicLib's GeoidEval](https://geographiclib.sourceforge.io/cgi-bin/GeoidEval). All accessed 2026-09-18. | ✅ both |
| Photoreal 3D | ✅ Google Photorealistic 3D Tiles with the runner's own key (D43), either way, checked 2026-09-18. **Google Maps key** (✅ used by the owner 09-18: it works): the project must have billing enabled ([usage and billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)); what is counted is the *root tileset request* (one per start of photoreal, good for up to three hours of tiles); [1,000 a month free, then $6.00 per 1,000](https://developers.google.com/maps/billing-and-pricing/pricing); set-up in [Google's guide](https://developers.google.com/maps/documentation/tile/get-api-key). **Cesium ion token:** the free Community plan is for personal, non-commercial projects (also unfunded education and evaluation) and [includes 1,000 root tiles a month](https://cesium.com/platform/cesium-ion/pricing/); every account has a [default token](https://cesium.com/learn/ion/cesium-ion-access-tokens/) that works. ion's asset id for the tiles is 2275207 (from CesiumJS's own source). 🔍 Not confirmed: whether a new ion account already has the tiles among My Assets or must add them from the Asset Depot; the app's message covers both. | same | [Google's policies](https://developers.google.com/maps/documentation/tile/policies): no pre-fetching, storing or caching; no extracting geodata; our own objects may be laid over the tiles as long as they aren't derived from them; the Google logo and each tile's data credits shown on the map, along the bottom (the app sets `showCreditsOnScreen`) · ion Community = personal/non-commercial | ✅ |
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

### The tokens (from B, as built in `app/src/mockups/poster/`; the app's are in `app/src/style.css`)

- **Palette.** Light: paper `#f4f4f0`, ink `#000`, blue `#1546ff`, grey `#8a8a86`. Dark: the inverse — ground `#000`,
  ink `#f4f4f0`, blue `#5a7dff`, grey `#7c7c78`. Blue means exactly one thing: the course and where you are on it.
  Grey *words* are darker than grey marks so they stay readable (D49). Two more families, for one job: **how much, and which
  way**. Against the runner (uphill): pale yellow `#ffd84d` → orange `#f07f1f` → deep red `#a3150f`. With the runner
  (downhill): pale aqua `#a5e8dc` → teal `#1fa698` → deep teal `#0a5a55`. Each fades between its stops and gets darker as it
  goes; teal leans green so it is never taken for the course (D47).
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
  scrubbing the strip moves the Ride. Seen **From above** or **On the road**.
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
- **Runner's view: what Claude predicted, and what the owner saw.** *Predicted (09-18, before any imagery):* Google's
  city is photographed from aircraft, so at eye level facades would smear, trees and cars would be blobs, and the
  camera would have to stay a few metres up like a lead vehicle. *Seen (owner, 09-18, #17, with a Google Maps key,
  both courses from above and down at road height):* asked for the lowest camera height that still looks good, the
  owner answered "this looks really good" for New York and "still looks good" for Berlin, having gone "really close to
  the ground". Trees are what go first, "but its not bad, its really good"; in Berlin "nothing really" fell apart. **So the imagery does not set a floor for the On the road camera (D33).** The owner wrote down no
  height in metres, so none is recorded here; the prediction was too pessimistic, and a lead-vehicle camera a few
  metres up is now a choice about how a race is filmed, not something the imagery forces.
  🔍 Street View is the true ground-level source, but it is billed per panorama and its terms restrict turning it into
  video; verify before considering it.
- **What the look did find: the course line sits on top of things, not on the road.** The line is *draped*: CesiumJS
  paints it onto whatever surface is there, seen from the camera. From above that is right and reads well ("course
  line is good"). Close to the ground it is wrong wherever something stands over the road: on a bridge "the line goes
  over the bridge arches/suspension rather than on the road". The owner: "not the biggest deal breaker because it looks
  good from above". The same will be true under trees, and on the Queensboro, where runners use the *lower* deck and
  the line is painted on top of the bridge. Whether the camera can follow the road on the two big bridges at all, the
  owner was "not sure, kind of". **What this means for the tickets:**
  - **#8 (Ride, On the road) needs the road's height in the 3D scene, for the camera and for the line.** It can't
    come from the imagery: draping is what put the line on the cables, and Google's content may not be used to work
    anything out (D5). It should come from what the pipeline already measures, the course line's elevation with
    LiDAR bridge decks (D23), which knows the Queensboro's lower deck from its upper one. ✅ *Built by #22 (D51, D52), with the one
    change that the field is required, not optional. As first proposed:* that elevation is above sea level (each city's own datum), and the 3D scene needs height above the
    ellipsoid: a difference of tens of metres, and not the same in the two cities (🔍 to be computed from a published
    geoid model, with its source, never eyeballed). The pipeline adds that height per point to the Course Bundle (a new
    optional field, so not a breaking change); the app then draws the line at it in photoreal instead of draping it.
    Even then Google's surface and a surveyed road won't agree exactly (🔍 by how much is to be seen), so the line may
    need to float slightly above the road, and whether it shows through buildings is a look to choose in #6/#8.
  - **#6 (Explore) can keep the draped line from above**, where it is correct and reads well, and keeps opaque blocks
    for everything laid over the imagery. Nothing else got lost.
- **The owner's second look, 09-18, at Explore over photoreal (#6):** the line is "better than last time" but still wrong on the Queensboro (it rides the right side of the structure, not the road) and on the Verrazzano ("not on the actual road itself"). Same cause as above: the line is draped over whatever is highest. The owner's own diagnosis, later the same day, is exactly right: from one angle the line is perfect, and it distorts as the camera moves, over trees and bridges but never on a plain street with buildings beside it. That is what draping does: the paint lands on whatever stands over the road, which is metres above it and so slides against it as the view changes. "Not a huge deal, but something we would ideally want to fix… let's create this into a new issue." **It is #22**, ahead of #8, which it blocks. *Built 09-18 (D51, D52): in photoreal the line stands at the road's own height, from the pipeline's heights and a geoid model. What is left is the owner's look, below.* The same look also showed that the *not measured here* dashes read as white squares over dark imagery (the grey vanishes, the paper gaps stand out); #22 takes that with it.
- **How the look was done.** With photoreal on, the map shows "Camera: about N m above the ground" each time the
  camera comes to rest. It is read from the open terrain, never from Google's mesh (D5): good to a few metres, and on
  a bridge it counts from the water. The page says under the map how to tilt down. The owner's answers, word for
  word, are in `docs/photoreal-look-notes.md`.
- **Speed.** 42 km in 3 minutes is ~230 m/s: fine from the air, unwatchable on the ground. So: bird's-eye between
  stops, drop to the runner's view for the few hundred metres that matter at each stop, at a gentler time-lapse.
  *Built 09-19 (#8, D53), differently:* the two cameras are the runner's to switch, as the ticket asks, and each has
  its own time-lapse: just under 3 minutes for the course from above, about 12½ and 10½ on the road, both easing off
  through sharp turns. Switching cameras by itself at each Stop was not built; it can be a later ticket if the owner misses it.
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
4. ✅ **Photoreal with your own key** (#17): the headline look (D30). "Make it photoreal", the key panel with sourced
   set-up help, the imagery, and the way back when it fails (D43, D44). The owner looked at both courses with their own
   Google Maps key on 09-18: what it settled for the camera (D33) and the design (D32) is in §6 "The ride".
5. ✅ **Explore** (#6): the map home screen in the poster design (D46), the layer system with its first layer, Hills
   (D47), the sentence (D48), the strip drawn the instrument's way, light and dark (D49), kilometres or miles (D42), and
   the bundle saying where the height isn't measured (D45). 🟡 *Still to do, and only the owner can:* look at it over
   photoreal imagery as well as the keyless map (§10).
6. ✅ **The course line on the road** (#22), *built, and confirmed by the owner over real imagery in two looks on 09-18*: in photoreal the line is drawn at the road's own height, from the pipeline's
   measured elevation plus a published geoid model (D51), instead of being draped over trees and bridge structures (D52,
   §6 "The ride"). Its own ticket since 09-18, because it bothers the owner in Explore too; it blocks the Ride, whose On
   the road camera needs the same height and now has it (`positionAtKm` gives the road's height in the scene).
   The throwaway branch `prototype/line-on-road` (the trial panel the look was settled with) is kept, never merged, like
   `prototype/player-screen`.
   ✅ **Ride** (#8), *built 09-19 (D53)*: the time-lapse with Stops, Back / Ride to the next stop, From above and On the
   road, the space bar, reduced motion stepping Stop to Stop, and a ground that survives its tiles failing.
   🟡 *Still to do, and only the owner can:* ride both courses over photoreal with their own key (§10).
7. **White model** (#7): each city's real buildings along the course as white blocks with real shadows — what opens
   with no set-up. Decide there whether the map should still dim with the sun (D39).
8. **Sun**: building shade (#9), then the tree range (#10).
9. **Wind** (#11) · **Aid + fueling check** (#12).
10. **Runner reports and the canyon score** (#13): Watch trouble, Crowds (D36), Bottlenecks (D37).
11. ✅ **Imperial / metric toggle** (#19, D42): built with Explore, because #6 needed the switch and the screen was being
    rebuilt anyway: miles, pace per mile, splits per mile, feet, keyboard steps on whole miles. #19's own checklist is
    met; it stays open until the owner has tried it.
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
- **A height that was filled in must never look measured.** The pipeline lists the stretches (D45) and tests pin the
  Verrazzano's unscanned span and every Berlin bridge; the app's tests check that such a stretch comes out as not
  measured on the strip, on the map and in the sentence.
- **Sea level is not the ellipsoid, and the sign differs by city.** A 3D globe counts heights from the WGS84 ellipsoid;
  surveys count from sea level. Sea level is 32.5 m *below* the ellipsoid in New York and 39.5 m *above* it in Berlin, so a
  missing, swapped or sign-flipped offset puts the line tens of metres under the road or over it. Tests pin both cities
  against values worked out by other software, and the bundle loader refuses a bundle without the column (D51).
- **PROJ's default conversion from NAD83(2011) to WGS 84 is a null step** (EPSG calls it accurate to 2 m): it returns a
  height shift of 0.000 m where the real one in New York is −1.25 m. Anything that ever goes through GEOID18 has to ask
  for ITRF2014 by name. It is one reason the pipeline uses a model referred to WGS84 itself (D51).
- **A regional geoid grid answers `inf` outside its country** (GEOID18 asked about Berlin), which JSON Schema accepts as a
  number. The course-line builder refuses any height that isn't finite, and says which km.
- **CesiumJS draws "shows through" by painting a line over everything nearer than it**, other lines of ours included. A
  wide mark under the blue line came out *on top of* the blue wherever the line shows through: the course vanished under
  its own grey dashes. So nothing on the course is laid over anything: each stretch is one line that paints its whole
  cross-section (`scene/course-ribbon.ts`, D52). Only a browser shows this; it was found in headless Chrome.
- **"Hidden" asked pixel by pixel splits a wide line down its length.** A line in CesiumJS is flat to the camera; the road
  under it recedes. At a tilt the road is nearer than the lower half of the line, so CesiumJS called that half hidden and
  drew it faded, the other half solid. The line now decides once, at its middle, for its whole width (D52). Tested in
  headless Chrome by letting the open terrain hide the line: lifted, sunk 2 m, sunk 40 m.
- **Nothing of ours in the 3D scene can sit on top of a line that shows through**: "shows through" is painted over
  everything nearer, our own runner dot included. The runner and the end dots are HTML over the map (D52).
- **CesiumJS packs "as far as can be" into its depth texture as 0**, not 1: read naively, empty sky is the nearest thing
  there is, and the whole line came out faded with nothing in front of it.
- **CesiumJS's "clamp to ground" means the highest thing there, photoreal imagery included.** While Google's tiles are in
  the scene, a dot with `CLAMP_TO_GROUND`, or a draped line with the default classification, rests on Google's surface:
  that is placing our own things by it, which D5 rules out. Draped things ask for the terrain only (D52); a test reads it.
- **A CesiumJS material can't be made in a test** (it wants a canvas), so the course's own line material is registered by
  the map as it starts; tests read what each line is asked to look like, and the shader is checked in a browser.
- **A hidden element can shift a CSS grid.** `hidden` takes an element out of the grid, and every row after it moves up
  one track: the map got the strip's height. The screen is a flex column, and `[hidden]` always wins over a class's
  `display`.
- **Frame the camera after the layout settles.** Framed before the strip had its height, the map then shrank and cut
  the start of the New York course off the bottom. CesiumJS's field of view is across the *longer* side of the map,
  which is usually a letterbox, and a tilted camera puts the near end of the course lowest: `core/framing.ts`, tested.
- **Cutting a block out of the stylesheet can take its neighbours with it, and nothing fails.** The layer switches spent
  a commit as plain grey browser buttons. `app/test/stylesheet.test.ts` now reads the code and the stylesheet and checks
  that every class the app puts on an element still has a rule.
- **A photoreal tile's address has the runner's Google key in it.** CesiumJS prints a failed tile's address to the
  console unless something listens for failed tiles, and hands that address to whatever listens. The app listens, and
  never reads, shows or logs what it is handed (D43).
- **`createGooglePhotorealistic3DTileset()` without a key uses CesiumJS's default ion token, and remembers a failed
  ion lookup for the life of the page**, so a corrected token would keep failing until a reload. The app builds the
  ion request itself, with the runner's token, each time.
- **CesiumJS's library contains a demo Cesium ion token** (public, for evaluation). It is the one token-shaped string
  in the built app; it is not ours, and the app switches it off at start-up (D43).
- **CesiumJS draws no ground at all while it waits for a terrain service.** One that can't be reached left the keyless map
  black for good, and the course line, which is draped on that ground, gone with it: only the HTML labels and dots were
  left. Found by refusing every tile in headless Chrome (#8). The ground falls back to the plain ellipsoid
  (`scene/plain-ground.ts`, tested with a real CesiumJS terrain and a service that doesn't answer), in a quiet grey
  (`#deded8` in light, `#33332f` in dark: a step off paper and a step off charcoal) rather than CesiumJS's deep blue, which
  is the course's own colour. The same goes for a service that answers and then fails a *top* tile: a deeper tile is
  filled in from the one above it, a top tile has none, and CesiumJS gives up on it for good.
- **A road can double back, and loop.** New York has two hairpins, on and off the Queensboro Bridge, and the traced road
  onto it turns a full circle in 270 m. The direction of the straight line between two points of such a road spins round
  in a few metres, and a mean of headings turns a full circle where the net change is nothing. On the road looks at
  the runner from 25 m behind them on the road, From above faces along the straight line over 3 km (the loop is 100 m
  across), and the Ride eases off wherever either view would swing fast (D53). Tests run both cameras down the whole of both courses.
- **A landmark can sit a hair past the end of the course line.** New York's Finish is listed at km 42.69 and the line is
  42.688 km long: a Ride to the next stop aimed at 42.69 never arrived, and never stopped. The Ride's end is the end of
  the line, and a Finish within 25 m of it counts as the end (as close as the runner counts as on any Stop). Tested on the real bundle.
- **A cap on frame time is for motion only.** The Ride moves the runner no further in a late frame than 0.1 s would, so a
  tab left in the background doesn't leap. The same cap applied to *standing* at a Stop (reduced motion) made four seconds
  last thirteen on a slow GPU. Standing is timed by the clock.
- **CesiumJS lifts a camera it finds under a surface it may collide with**, every frame, to a metre above it. Photoreal
  imagery is made collidable (D44, so a hand can't push the camera into a building), and "the surface" is the top of
  whatever stands there: a tree, the Queensboro's upper deck. A Ride that set the camera only when it moved would, paused
  On the road under either, pop up onto it. The Ride's camera is put back before every frame for as long as the Ride has it
  (D53); the height is ours (D5). Read from CesiumJS's source by review; nobody has seen it over imagery.
- **"Is this far enough to glide?" can't be told from distance.** From above the camera moves up to 190 m in one late
  frame of plain playing (the runner 55 m, the rest its own coming down for a Stop), more than a Back between two close
  Stops; and a head turned On the road moves it hardly at all. The Ride says whether it rode or jumped (D53).
- **A straight line between measured heights is under a bridge's real deck**, by a few metres at the Verrazzano's
  mid-span (§5). The line there shows through, fainter (D52); a camera 3 m over it would be in the road. It rides over an
  estimate of the crest, from our own grades either side (D53).
- **The space bar presses whichever button has the focus**, on the way *up*. After a click on "Ride to the next stop" it
  rode to the next stop again; after Back it went back again; none of them paused. Taking the space bar for the Ride
  everywhere in the player cured that and broke the keyboard: Tab to "Back to the map", space, and the Ride paused. The
  cure that holds: a *pointer's* press hands the focus to the play button (a click made by a key has `detail` 0), and the
  space bar stays a button's own (D53). Both checked in a browser.
- **A status that appears together with its first words is often not read out.** The Ride's was inside the player,
  which is hidden in Explore. It is on the page from the start (the photoreal panel had learned the same in #17).
- **A block sized for a button is covered by what the button grows into.** The player left 170 px for "Make it
  photoreal"; with imagery on that block is 340 px wide. Two things that share the top of the map share one row (D53).
- **Re-aim a target whenever the runner is moved, not only when they pass it.** A Ride to the next stop scrubbed back
  behind an earlier Stop kept its old target and rode through every Stop in between.
- **A rule that holds something back must let go of it gradually.** "Slow all the way up a climb" ended in a step at the
  top, and From above, which takes its height from the same number, jumped 910 m in one frame. Pace is walked a metre
  at a time down both courses by a test, for any step.
- **Measure a swing finer than the thing it happens in.** Measured 10 m at a time, a swing that falls within 4 m landed
  between two measurements and the Ride sped up at its apex. A guard that samples on the same grid as the code it guards
  sees the same averaged number, and nothing.
- **A camera over a New York street is inside the ellipsoid**, and CesiumJS answers "where does my line of sight meet
  the ellipsoid?" from inside with the far side of it: "Straight down" from On the road sent the map to the Atlantic. The
  middle of the map is found on the ground under the camera (`scene/map-middle.ts`, tested with a real CesiumJS camera).
- **CesiumJS says the camera has come to rest before the frame is drawn.** Anything that reads the camera then, while the
  Ride holds it, reads the one CesiumJS nudged, not the one the frame is drawn from. It is read after the frame.
- **The first labels are made before there is a terrain to ask.** CesiumJS has no terrain provider until the service
  answers, the ask failed quietly, and nothing asked again: on a fresh load the map's labels stayed at height zero, 73 m
  under Berlin's streets, until a units switch happened to redo them. Older than the Ride; found from 3 m above the road.
- **A control under the sentence falls below the fold.** The readout block can't be taller than the map, and the map
  shrinks when a layer's rows open the strip. "Ride the course" spent an hour there, half hidden with Hills on. It is
  on the map (D53).
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
  one layer system (D34–D37). ✅ Seen over real imagery by the owner 09-18 (#17): it holds up; see D32 and §6.
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
- ✅ **The owner's look at photoreal (#17)**, done 09-18 with a Google Maps key. Results in §6 "The ride".
- ✅ **The road's height in the 3D scene**: built by #22 (D51). The Course Bundle carries each point's height above the
  ellipsoid, from EGM2008, and #8's On the road camera can use it.
- ✅ **The owner's first look at the line on the road (#22, D52)**, 09-18 with their own key: the line is on the road, the
  bridges "look great", and what is left of the line behind things is *fainter*. Their words are in
  `docs/photoreal-look-notes.md`.
- ✅ **The owner's second look (#22)**, 09-18: the flat grey band, the line at one strength across its width, and the
  runner's dot on top, all over real imagery: "ok everything looks good." #22 is done; #8 (Ride) is unblocked.
- 🔍 **Nobody has tried a Cesium ion token for real yet** (the owner used a Google Maps key). Still unconfirmed: whether
  a new ion account already has Google's tiles or has to add them from ion's Asset Depot (§5).
- 🔍 Verify: Open-Meteo archive limits. ✅ Cesium ion Community terms checked 09-18 (§5): personal, non-commercial use,
  which is what a runner planning their own race is; each runner uses their own account, so the terms are theirs.
  ✅ Settled 09-17: there is no downloadable official NYC course file (D21); NYC Open Data has no usage restrictions.
- ✅ **NYC start line** settled 09-17 from the USATF certification (D25), and pinned by a test. What remains is the
  finish line's exact position (taken as West Drive beside Tavern on the Green); the start moves ~1.5 m for every
  meter the finish is out.
- ✅ **Filled-in elevation is marked as such** (D45, 09-18): the bundle lists every stretch whose height is a straight
  line between measured points, and the app greys them out on the map, on the strip and in the sentence.
- ✅ **The look of a hill: colour, warm going up and teal coming down, fading** (owner, 09-18; D47). Still unanswered: is a hill from 1% and 5 m the right threshold (28 in New York); the sentence's wording (D48); whether the app should open with Hills already on.
- ✅ **The line on the road, not draped over trees and bridges**: raised twice by the owner, its own ticket, **#22**, ahead of #8 (§6 "The ride"); built 09-18. ✅ The geoid model was verified there, with its sources (D51, §5).
- ✅ **The owner's look at Explore (#6)**, 09-18: done, over photoreal. Layout confirmed (D46); dark theme softened (D49); three requests built (D46); Berlin's bridges measured (D50). What was asked, for the record: what to
  judge: whether the blocks and the labels on the course line read over real imagery; whether the first screen is now
  little enough (principle 8); whether 28 hill labels in New York is too many when zoomed in; and whether a Berlin
  bridge a few dozen metres long deserves its grey dashes. Also Claude's calls, the owner's to overrule (D46, D48, D49
  are flagged 🟡 for this): nothing is on when the app opens; the banner, the strip and the credits sit round the map
  rather than over it, so the map's own credits are never covered, and only the readout block, "Make it photoreal" and
  the map's buttons lie on it; the layer switches sit on the strip; the race plan opens from the banner; no dead "Ride
  the course" button until #8 builds it; the sentence's wording; on a phone the credits are below the fold. What is on
  the first screen beyond #6's list, each for a reason: the course picker, the plan in one line with its button, km ·
  mi and the theme, "Make it photoreal", the map's four buttons, Start and Finish, and Sources.
- 🟡 **The owner's look at the Ride (#8, D53)**, over photoreal with their own key, both courses. Everything below is
  Claude's starting value; none of it has been seen over real imagery. What to judge: **the pace** (from above: just under 3
  minutes for the course, slowing to a few seconds at each Stop and staying slow up each big climb; on the road: about 12½ minutes in New York and 10½ in Berlin, slowing into every corner; too fast to take in, or
  too slow to sit through?); **On the road's height, 3 m** (does it clear what Google photographed on the road; is it
  under the Queensboro's upper deck and on the Verrazzano's upper one, where over the unscanned main span it rides
  up to 3.6 m higher on an estimate of the crest: does it clear the deck without floating; would higher film better?); how the view takes
  **the two hairpins at the Queensboro and the corners in the Bronx**; whether **From above** is the right height and
  tilt, and whether coming down at each Stop reads as a look or as bobbing; whether the **Stops** are the right ones
  (every landmark, plus climbs of 15 m or more: three in New York, none in Berlin; **biggest rather than steepest, which
  is what the ticket said**, D53); the **player on the top of the
  map** rather than under the sentence, where the confirmed D46 had kept a place for it (**moved without asking first**:
  under the sentence it fell below the fold of the readout block whenever a layer was on, D53): the right place, or back
  under the sentence?; its words ("Ride on", "Ride it again", "Back to the map"); the **0.8 s glide** when the Ride jumps.
  On the keyless map On the road is a flat map seen from 3 m: it will only come into its own with photoreal, or the
  white model (#7).
- 🟡 **On a short window the photoreal notice runs under the map's own buttons.** At 1024 × 768 the banner takes three
  lines and the map is 340 px tall: the shadows notice under "Make it photoreal" and the column of map buttons can't both
  fit on its right-hand side. It was so before the Ride (found while measuring the player, #8). Under 960 px wide the
  photoreal block goes under the Ride's player, which keeps it out of the buttons' column, but a long notice there can
  still reach down to them on a short map. A ticket of its own: where the map's buttons go on a short map.
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
  what #6 must allow for (D32), is still to do: it needs the owner's own key. After review: late imagery can no longer
  put the plain ground back under live imagery; the failed-tile trap (§8) has its test; the key box is masked text, not
  a password box; the panel keeps the keyboard's focus and speaks its messages to a screen reader; the camera height is
  only asked of the terrain service while photoreal is showing; the page says how to tilt the map.
- **2026-09-18** — The owner looked at both courses in photoreal with their own Google Maps key (#17 done). The imagery
  holds up "really close to the ground" in both cities, so it sets no floor for the On the road camera (D33; no number
  was written down), and the poster's opaque blocks and the course line read fine over it (D32). Claude's prediction that
  eye level would smear was too pessimistic and is recorded as such in §6. The one real finding: up close, the draped
  course line runs over bridge towers and cables instead of the road. #8 therefore starts with the road's height in the 3D
  scene, taken from the pipeline's measured elevation, never from the imagery (🟡 approach proposed in §6, owner's call).
- **2026-09-18** — Explore (#6): the app opens on the map home screen in the Race poster design. Added D45 (the bundle
  says where the height is not measured, `schema_version` 3; both bundles rebuilt, nothing else in them changed; the
  Verrazzano's gap is km 0.77–1.36), D46 (the screen as built), D47 (a layer is data, one table of encodings, Hills),
  D48 (the sentence), D49 (themes, and grey words darker than grey marks). D42's units toggle was built here to #19's
  specification. §8 gained three traps met on the way. The old plain elevation chart is gone: the strip's Height row
  and the Hills layer replace it. Checked in headless Chrome at 1440, 1100 and 400 px, light and dark, both courses,
  kilometres and miles. Not checked, because only the owner can: the look over photoreal imagery (§10).
- **2026-09-18** — After review of #6 (standards and spec, two reviewers): with Hills on the map now greys *every*
  not-measured stretch (it had only greyed the ones inside a hill: none of Berlin's ten, one of New York's five), and
  the reason is printed under the sentence instead of living in a tooltip; map labels can no longer land on the map's
  credits; Start and Finish were wearing the hollow look reserved for runner reports and are now the course's blue; map
  labels got the sample and measured looks they lacked, and a not-measured label is struck through; the sentence names
  the *nearest* landmark (at New York's half-marathon mark it named the Pulaski Bridge); the camera's height in
  photoreal follows the units; a flight to the whole course no longer jumps sideways at the end; the layer switches are
  built from the one list of layers; the test that guards the encodings' stylesheet rules could not fail and now can.
  D46, D48 and D49 are flagged 🟡: they are Claude's calls about look and wording that the owner hasn't seen yet.
- **2026-09-18** — The owner looked at Explore over photoreal and came back with a list. Built the same day: two looks
  for a hill **on trial** behind a switch, A ink weight and B a warm colour ramp, with steepness in three steps on the
  map and on the strip's Grade row (D47; the owner proposed green / yellow / red, and Claude advised against that exact
  scheme and why); the strip's **top edge drags** to resize it, **Full map**, and **Straight down** (D46); a **dark
  theme that is charcoal, not black**, with the keyless map dimmed to match (D49); a **key under the strip whenever a
  layer is on**, because the owner had to ask what the black, white and dashed edges were (D47). **Berlin's ten
  bridges are now measured** from the city's surface model instead of drawn as straight lines, so nothing in Berlin is
  "not measured" any more (D50; bundle rebuilt, heights changed only on the bridges, by under a metre). The owner
  confirmed the layout (D46) and is open to several layers at once later (D35). Still open: the pick between A and B,
  and the line riding over bridge structures in photoreal, now proposed as its own next ticket (§6, §10).
- **2026-09-18** — The owner picked **colour** for hills ("B, color reads wayyy better"): the trial, look A and the
  address option are gone, and the warm ramp joins the palette for the one job of saying how much (D47, §6 tokens). The
  owner also confirmed the resizable strip and Straight down ("really good") and described the draped line precisely:
  right from one angle, distorted as the camera moves, over trees and bridges. Filed as **#22** with the cause, the
  proposed fix and what must be verified or judged by eye; it blocks #8 (§6, §7, §10).
- **2026-09-18** — Hills, two refinements the owner asked for: **descents are teal** (the owner proposed light blue;
  teal keeps blue for the course and shows over the keyless map's water) and the colours **fade** instead of stepping,
  on the strip and, in pieces, on the map (D47, §6 tokens). Measured: 327 pieces for New York, no change in frame rate.
  Also fixed a regression from the commit before: removing the trial's styles had cut the layer switches' own rules
  with them; a new test checks every class the app uses still has a rule (§8).
- **2026-09-18** — The course line on the road (#22). **Pipeline:** every course-line point now carries its height above
  the ellipsoid, from the EGM2008 geoid model (D51, `schema_version` 4, §5 with every source; both bundles rebuilt, nothing
  else in them changed). Verified rather than remembered: which model fits each city's height system, their licences,
  that Google publishes no height reference for its imagery, and, measured along both courses, that one worldwide model
  costs 0.21 m in Berlin and about 0.37 m in New York. It also settled D50's open question (Berlin's surface model is
  DHHN2016 too). **App:** while photoreal imagery is in place the line, the marks, the runner, the end dots and the labels
  stand at the road's own height; on the keyless map they stay draped; the switch follows the imagery through on, off,
  refusal, failure and "Forget my key" (D52). The course is now one line per stretch that paints the blue and the mark
  beside it, after a browser showed a mark being painted over the blue (§8); dashed marks carry their own ground so they
  read the same over pale and dark (D47). **Not done, because only the owner can:** the look at road height (lift,
  what is left of the line behind things) is Claude's starting point, to be settled by eye with the owner's key on the
  throwaway branch `prototype/line-on-road` (§10). After review (standards and spec, two reviewers): draped things now
  rest on our own terrain only, never on Google's tiles while they arrive (D5, §8); an unmeasured stretch shows through
  fainter, not at full strength (D52); a test that could not fail was rewritten; the real New York check pins the
  Queensboro's crest to the lower deck; names follow the glossary (`ellipsoidHeightM`, not a third word for it). #8 is unblocked: the road's height is there for its camera.
- **2026-09-18** — The owner looked at the line on the road with their own key (#22): "Wow this looks great… It's like
  actually on the road", bridges included, and the line stays, faded, behind buildings (D52 is ✅ for that). They sent two
  screenshots of "weird rectangles slash lines". Three causes, three fixes the same evening: the *not measured* dashes read
  as a glitch for the second time, so on the map it is now a **flat grey band** (D47); a wide line came out **solid above
  and faded below**, because CesiumJS asks "hidden?" pixel by pixel and the road recedes under a line that is flat to the
  camera, so the line now decides once, at its middle, from how far clear of it the thing in front is (D52, §8); and the
  **runner's dot** was being painted over by the line, so it and the end dots are HTML over the map. Checked in headless
  Chrome as far as it can be without imagery; a second look by the owner is owed (§10).
- **2026-09-18** — The owner's second look at #22, over real imagery: "ok everything looks good." D47's grey band and D52's
  three fixes are confirmed; nothing about the line at road height is open any more. Next is the Ride (#8).
- **2026-09-19** — The Ride (#8, D53). "Ride the course" on the map carries the runner from start to finish as a
  time-lapse that slows for the Stops (the start, every landmark, the finish, and New York's three climbs of 15 m or
  more), with Back / Ride to the next stop pausing on arrival, the space bar, and two cameras switched mid-Ride: From
  above, and On the road at 3 m, the one height setting. The strip names the Stops, and scrubbing it moves the Ride. With
  reduced motion the Ride steps Stop to Stop and every camera move is a cut. Built test-first on three seams: the
  Stops of a course, the Ride driven by hand-turned frames, and the cameras as pure geometry run down the whole of
  both courses; the scene's camera is tested against a stand-in viewer. A look in headless Chrome moved the controls
  from under the sentence onto the map, and refusing every tile found that a terrain service that can't be reached
  left the map black and the course line gone; the ground now falls back to the plain ellipsoid (§8, five new traps).
  Not seen by anyone over real imagery yet: the pace, the height and the feel are the owner's to judge (§10).
- **2026-09-19** — After an adversarial review of the Ride (#8: six reviewers, every finding put to a second agent to
  refute). Fixed, each with the test that would have caught it: a Ride to the next stop scrubbed backwards rode through
  Stops; a drag to the finish ended the Ride under the pointer; reduced motion switched on mid-Ride ignored the Stop it
  was riding to; a landmark near either end took the Start or the Finish off the list; "in 0 m". **On the road was
  reworked:** it looks at the runner from the road behind them (it had been losing them at every street corner), the
  Ride slows into corners for it, and over filled-in height it rides over an estimate of the crest (D53). **The scene's
  camera was reworked:** held before every frame and told whether the Ride rode or jumped, which cured five findings at
  once, CesiumJS lifting a paused camera among them (§8, five more traps). The space bar is the Ride's anywhere in the
  player. Tests that could not fail were rewritten (a Ride that never finished passed; the hold test held trivially;
  no test flipped reduced motion mid-Ride; every glide started 30 km up). On the road is now about 11 and 10 minutes.
- **2026-09-19** — After the second review of the Ride (#8: standards and spec, two reviewers, each finding put to a
  refuter) and the last of the first (wiring and accessibility). **The ticket's own test was being failed:** on the road
  the easing through turns took ordinary corners below a Stop's speed; a Stop is now the slowest thing between Stops, and
  the test walks the whole of both courses instead of one straight. **A climb is slow all the way up**, not only at its
  foot ("slow through them"). **The plan had drifted** and is put right: §8 and D53 still described the first On the road
  camera, the crest rule had no line, "costs under a minute" was wrong on the road (measured: about a minute), and D53
  now says plainly that the Stops are the *biggest* climbs where the ticket said steepest, and §10 that the button left
  D46's place without the owner being asked. **Layout:** the player and the photoreal block share one row and can't cover
  each other (they did under about 1430 px with imagery on; and at 761 to 849 px the player's buttons stuck out of it).
  **The space bar** is a button's own again, with the focus handed to the play button after a pointer press (D53, §8).
  Also: the strip says a scrub by hand during the Ride; the Ride's status line is read from its first words; the Ride
  waits behind the key panel; the plain ground also answers a failed top terrain tile. Words: `scrubbedTo` not `seek`,
  a `TimeLapse` not a `Pace`, the player not a bar, the Stops' lane not the landmarks'. One thing found and left for a
  ticket of its own: the photoreal notice under the map's buttons on a short window (§10). 380 tests.
- **2026-09-19** — A third round on the Ride (#8), on the fixes themselves: four reviewers, eighteen findings, none
  refuted. **Broken by the fixes and mended:** the hold through a climb ended in a step (a 910 m jump of the From above
  camera at the top of Lafayette Avenue); the Verrazzano's climb had lost its end when it gave way to the Start; every
  pause was told to the camera as a jump, so On the road nodded; under 960 px the photoreal block landed on the map's
  buttons; a greyed-out Back still paused. **Missed until now:** the swing was measured too coarsely to see Columbus
  Circle (250° a second), the runner was far below the view there, slowing into a corner was a hard brake, "Straight
  down" from On the road sent New York to the Atlantic, the camera's height in photoreal was read before the frame, and,
  older than the Ride, the first labels never reached the ground. §8 has five more traps; D53's numbers are measured
  again: from above 2.9 and 2.6 min, on the road about 12½ and 10½, the turns costing about two minutes of that. 388 tests.

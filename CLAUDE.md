# CLAUDE.md — working on GeoPace

**Read `PLAN.md` first.** It is the source of truth for scope, decisions (D1…), data sources,
and the roadmap. When a decision changes, update its row in the decision log and add a
changelog line — never let the plan silently drift from the code.

## The owner
Knows Python only; has not done web, 3D, or GIS work. Claude writes the code. Explain choices
in plain language, keep the Python pipeline readable (it's the part the owner can check), and
ask before anything that changes scope or look.

## Non-negotiables
- **Unique design.** Not Godseye's look, not a generic dark glass HUD. Follow the chosen
  direction in PLAN.md §6 once picked.
- **Measured vs. subjective** data are visually distinct and stored separately. Never blend.
- **Every fact about the world has a `source:` URL** (and `accessed:` date) in the data files.
- **Show ranges/distributions** where uncertainty is real; gray out numbers whose
  preconditions aren't met.
- **No API keys in the repo, ever.** Photoreal is bring-your-own-key, stored only locally.
- **Google content is visual-only**: never cached, stored, or used to derive data. No Solar API.
- **Never scrape finisher results or bulk Strava/Garmin tracks.** Forum/organizer facts are
  paraphrased with a link, never copied verbatim.
- **Attributions stay visible** and are never restyled away.

## Conventions
- Units: meters, seconds, m/s, degrees. Positions along a course are **km from the start**.
- Times: ISO-8601 with an explicit **IANA timezone** (`Europe/Berlin`, `America/New_York`).
  Never naive datetimes.
- Wind direction: **meteorological — degrees the wind blows FROM.**
- Hand-maintained course facts live in `data/courses/<id>/` (YAML). Pipeline outputs live in
  `data/derived/<id>/` and are committed, up to **8 MB per course** (D56); above that, geometry ships as a
  release download fetched by a documented set-up step. Raw downloads go to a local cache and are **never
  committed**.
- The app must run without Python; Python only regenerates `data/derived/`.

## Traps that must have tests
- Elevation re-derived from terrain models and smoothed before any grade (raw GPS is garbage).
- NYC bridges: bare-earth DEMs drop bridge decks — the Verrazzano start must not read as sea level.
  Decks come from LiDAR; on a double-deck bridge the course facts say which deck runners use.
- A height that was filled in (a bridge spanned in a straight line, a gap in a LiDAR scan) must never look
  measured: the bundle lists those stretches, and the map, the strip and the sentence grey them out (D45, D47).
- Wind "from" direction convention (a headwind must not come out as a tailwind).
- The 3D scene counts heights from the ellipsoid, surveys from sea level: about 32.5 m *below* the ellipsoid in New York,
  39.5 m *above* it in Berlin. A missing, swapped or sign-flipped geoid offset must not pass (D51). The height comes from
  the Course Bundle, never from Google's surface (D5).
- Timezone/DST: **US DST ends Sun 2026-11-01**, likely NYC race day.
- The White model's shadows: a shadow map drawn no further than the camera's own height shows **nothing**, silently
  (D56). Every quality's distance is tested against the Ride's camera. A block stands on its city's own ground —
  Berlin's from our bare-earth model, New York's from the building record — and goes through the same geoid step
  as the road, so the two can never drift apart.
- Metres per degree change with latitude; one rounded constant made a "150 m" corridor 151 m (D56).
- **A tree is not a wall.** A crown starts above the ground, so at the 10° floor the sun comes in
  underneath it; a crown modelled from the ground up over-shades every tree-lined street. Where the
  crown starts is **worked out, never measured** — no survey says — and the bundle says so (D60).
- **A building's shade wins over a tree's**, everywhere both apply: shade you get whatever the trees
  do is the stronger claim, and the only one drawn solid. Nothing may be both.
- A crown is as its city last recorded it — Berlin tree by tree in a register, New York from a 2017
  scan **half of which was flown leaf-off** — and both races are run with leaves on the trees. The
  layer says which, and what race day brings, and turns neither into a number (D60).
- Course length stays within tolerance of the certified 42.195 km (a route traced along street
  centre lines gets a wider tolerance than an organizer's course file — see D21/D22).

## Adding a layer
A layer is data (`app/src/core/layers.ts`, PLAN.md D47): its strip rows, its marks on the course line and its clause,
each tagged with the kind of claim it is. Add it to the list in `app/src/main.ts`. Never give a layer its own colours
or dash patterns for a claim: the encodings come from `core/encoding.ts`, and "how much, and which way" (a number from -1 to 1, like
how steep a hill is, negative coming down) gets its colour from `core/mark-look.ts`: warm against the runner, teal with
them, fading from pale to deep. (A colour for a *thing* — water, a gel — is the one exception, Aid's glyphs in
`core/serve-glyphs.ts`, D62; each must read at 3:1 on paper and on the dark ground, and none is blue.)
Blue means only the course and where you are on it. Any number of layers can be on at once (D62), so a layer paints one
**slot** of the course line — the wide coloured **band** (hills) or the dark **rim** hugging the blue (shade) — or, for a
point, only a **chip** (aid). Nothing on the course line is laid over anything else: a mark is
painted beside the blue by the same line (`scene/course-ribbon.ts`, D52), draped on the keyless map and at the road's height in photoreal alike. Every distance, height and pace shown or typed goes
through `core/units.ts`.

## Commands
- Run the app: `cd app && npm install && npm run dev` → http://localhost:5173
- App tests / types: `cd app && npm test` · `cd app && npm run typecheck`
- Rebuild a Course Bundle: `cd pipeline && uv run geopace build berlin` (or `nyc`; downloads into `pipeline/.cache/`).
  New York's trees need one file the pipeline will not fetch for you, because it is **1.3 GB down the wire and 91 GB
  unpacked** — the message tells you the two commands. It is read once into a ~3 MB corridor grid of canopy heights,
  which is cached; after one build both raw files can be deleted (D60).
  It writes two committed files: `course-bundle.json` and, beside it, `white-model.json` — the corridor's buildings
  as blocks, which the bundle names, counts and credits (`schema/white-model.schema.json`, D56).
- Pipeline tests: `cd pipeline && uv run pytest` (real-data checks skip until the cache exists)
- The Course Bundle contract is `schema/course-bundle.schema.json`; both halves validate against it.
  Bump `schema_version` on breaking changes.

## Git
Work on a branch, commit in small steps, don't push unless the owner asks.

## Agent skills

### Issue tracker

Issues and specs are tracked as GitHub Issues on Daniwave100/GeoPace, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root; `PLAN.md` holds the decision log. See `docs/agents/domain.md`.

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
  `data/derived/<id>/` and are committed. Raw downloads go to a local cache and are **never
  committed**.
- The app must run without Python; Python only regenerates `data/derived/`.

## Traps that must have tests
- Elevation re-derived from terrain models and smoothed before any grade (raw GPS is garbage).
- NYC bridges: bare-earth DEMs drop bridge decks — the Verrazzano start must not read as sea level.
- Wind "from" direction convention (a headwind must not come out as a tailwind).
- Timezone/DST: **US DST ends Sun 2026-11-01**, likely NYC race day.
- Course length stays within tolerance of the certified 42.195 km.

## Commands
*(Filled in as each part is scaffolded.)*
- Pipeline: `cd pipeline && uv run pytest`
- App: `cd app && npm install && npm run dev`

## Git
Work on a branch, commit in small steps, don't push unless the owner asks.

## Agent skills

### Issue tracker

Issues and specs are tracked as GitHub Issues on Daniwave100/GeoPace, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root; `PLAN.md` holds the decision log. See `docs/agents/domain.md`.

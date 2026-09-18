# GeoPace

A planner for a marathon you haven't run yet: one course, one runner's plan, and what the course will be like at the moment that runner reaches each kilometre. Decisions live in `PLAN.md`; this file is only the words.

## Language

### The course

**Course**:
One marathon's route through one city: Berlin, New York City.

**Course line**:
The course as the pipeline measures it: evenly spaced points, each with its distance from the start, height, grade and heading. Its length is the distance scale for everything in the app.
_Avoid_: track, path, route (the route is the input it is built from)

**Organizer km**:
A kilometre on the organizer's certified scale, where the course is exactly 42.195 km. It is converted onto the course line before it is used.
_Avoid_: certified km, official km

**Edition**:
One year's running of a course: its date, its waves, its aid stations.
_Avoid_: year, event

**Carried over**:
Said of edition details copied from an earlier edition because this year's aren't published yet. Always flagged to the runner.
_Avoid_: assumed, default, estimated

**Not published**:
Said of a wave whose start time the organizer hasn't given. It is listed without a time, and can be planned with only once the runner gives their own start time. Never filled in with a guess.
_Avoid_: TBD, unknown, estimated

**Not confirmed**:
Said of a race date the organizer hasn't stated for this edition, known another way (a standing rule, say). Always flagged to the runner, with how it is known.
_Avoid_: believed, provisional, tentative

**Landmark**:
A named, sourced place on the course.
_Avoid_: point of interest, marker

**Stop**:
A place the Ride slows down for: a landmark, or a stretch where something happens.
_Avoid_: chapter, waypoint (a waypoint is a turn point used to trace a route)

### The runner's plan

**Race Plan**:
The runner's own choices for one course: edition, wave, own start time if they have typed one, goal time or pace, and fueling plan.
_Avoid_: settings, profile

**Units**:
Kilometres or miles, with metres or feet to match: what the runner reads and types. They belong to the runner, not to a course, so they are remembered beside the Race Plans rather than inside one, and changing them never changes a plan. Everything inside the app stays metric.
_Avoid_: imperial mode, locale

**Wave**:
A group of runners with its own start time.
_Avoid_: corral, start block (those are positions inside a wave)

**Own start time**:
The start time a runner types in themselves, from their start card. It outranks the wave's published or carried-over time, and is never greyed.
_Avoid_: custom time, override, manual time

**Race clock**:
For one Race Plan, the link between where the runner is and what time it is there.
_Avoid_: timer, timeline

**Splits**:
The time of day and the elapsed time at every kilometre, or every mile, of a Race Plan, and at the finish.
_Avoid_: pace chart, pace band, schedule

**Scrubbing**:
Moving the runner along the course by hand, so that position, time of day, sun and camera move together.
_Avoid_: seeking, sliding

### The screen

**Explore**:
The home mode: the city seen from above with the course on it, moved freely, with layers switched on and off.
_Avoid_: dashboard, map mode, overview

**Ride**:
The mode that carries the runner along the course as a time-lapse, slowing at Stops.
_Avoid_: flyover, tour, playback, video, walkthrough

**From above** / **On the road**:
The Ride's two cameras. From above looks down on the runner from the air; On the road follows from a few metres up and behind, the way a lead vehicle films a race.
_Avoid_: bird's-eye mode, drive cam, runner's-eye, first-person

**Map**:
The city seen from above with the course drawn on it. It is the same scene the Ride moves through, not a separate thing.
_Avoid_: globe, 2D view

**Strip**:
The whole course laid out as one line of kilometres, with a row per layer, that is also the control for where the runner is.
_Avoid_: roadbook strip, timeline, seek bar, profile, chart

**Readout**:
The three numbers that say where and when the runner is: kilometre, time of day, elapsed time.
_Avoid_: HUD, stats

**Sentence**:
The one plain-language line saying what the course is doing where the runner is now, made of clauses.
_Avoid_: caption, subtitle, summary

**Clause**:
One short, complete statement in the sentence: a layer's, the nearby landmark's, or the sun's.

**Strip's top edge**:
The rule between the map and the strip, which drags up and down to resize the strip.
_Avoid_: splitter, divider, handle

**Full map**:
The map given the whole screen: the readout and the strip step aside, and the credits fold to one line.
_Avoid_: fullscreen mode, map-only mode

**Straight down**:
The map seen from directly above with north up, like a paper map; the other way of looking at it is tilted.
_Avoid_: bird's-eye mode, 2D mode, top view

**Banner**:
The black bar across the top: the course, the Race Plan in one line, the units and the theme.
_Avoid_: header, toolbar, nav

### The course on the map

**Draped**:
Said of the course line painted onto whatever surface the map shows above the route. How it is drawn on the keyless map, where nothing stands over the road.
_Avoid_: clamped, on the ground

**At road height**:
Said of the course line drawn in 3D at the height the pipeline measured for the road, a little above it. How it is drawn over Photoreal, where a draped line would land on trees and bridge structures.
_Avoid_: on the road (that is a camera), 3D line, floating

**Lift**:
How far above the measured road the line is drawn at road height, so that it doesn't sink into a photographed surface that disagrees with the survey by a metre or so.
_Avoid_: offset, clearance

### Layers

**Layer**:
One kind of information about the course, switched on and off as a whole. When on, it marks the course line on the map, has a row on the strip, and a clause in the sentence.
_Avoid_: overlay, heat map, toggle (the toggle is only the switch)

**Hills**:
The layer of height, grade, and the effort a grade costs compared with flat ground.
_Avoid_: elevation layer, profile

**Sun**:
The layer of how much of a stretch is in direct sun when the runner gets there, always as a range.
_Avoid_: shade layer, heat

**Wind**:
The layer of how the wind has historically met a runner on each stretch on race morning.

**Aid**:
The layer of aid stations and what each serves, and how the runner's fueling plan fits them.
_Avoid_: water stops, fuel

**Crowds**:
The layer of crowd support.
_Avoid_: crowd heat map, spectators layer

**Bottlenecks**:
The layer of places where congestion is known to happen.
_Avoid_: crowding, busyness, traffic

**Watch trouble**:
The layer of where a GPS watch is likely to misread: runner reports, and separately a measured score of how enclosed the street is.
_Avoid_: GPS layer, GPS errors

**Crowd support**:
How many spectators line a stretch and how loud they are, as runners describe it and as organizers announce it. Never measured.
_Avoid_: crowd density, crowd (alone, it is ambiguous with congestion)

**Congestion**:
How packed with other runners a stretch is.
_Avoid_: crowd, crowding, busyness

**Bottleneck**:
A place where congestion is known to happen.

**Line mark**:
A stretch of the course line that a layer marks on the map: the line is drawn wider there, with the layer's colour or dashes either side of the blue.
_Avoid_: highlight, segment, overlay

**Hill**:
A sustained climb or descent that a runner would call one: what the Hills layer marks on the course line.
_Avoid_: segment, ramp

### Kinds of claim

**Encoding**:
How a kind of claim is drawn, the same on the map, on the strip and in words: solid, hollow, grey and struck through, or hazard stripes.
_Avoid_: style, theme, legend (the key is what explains the encodings on screen)

**Measured**:
Taken from a survey or instrument, or computed from such data by a published model.
_Avoid_: real, accurate, objective

**Sourced fact**:
Something an organizer or authority states: a wave time, an aid station, a cheer zone. Neither measured nor opinion, and always carries its source.
_Avoid_: official data

**Runner report**:
Something runners say about a stretch, in our own words, with a link to where they said it. Subjective.
_Avoid_: review, tip, comment, community note

**Subjective**:
Resting on what people say rather than on a measurement or an authority.
_Avoid_: hearsay (that is the poster's word on screen, not the concept), opinion

**Not measured here**:
Said of a stretch where a measured layer has no measurement and the value shown is filled in.
_Avoid_: interpolated, estimated, missing

**Sample**:
An invented placeholder standing in for a layer that isn't built. It says nothing about the course.
_Avoid_: mock, dummy, demo data

### The city

**White model**:
The city's real buildings shown as plain white blocks with real shadows. What the app shows with no set-up.
_Avoid_: analysis mode, architectural model, maquette (the maquette was the mockups' drawn stand-in)

**Photoreal**:
Google's photographed 3D city, shown with the runner's own key. For looking at only: never stored, never used to work anything out.
_Avoid_: satellite view, Google Maps mode

**Own key**:
The runner's own Google Maps key or Cesium ion token: what lets Photoreal be shown. Kept only in their browser, and sent only to the provider it belongs to.
_Avoid_: API key (alone), credentials, BYOK

**Keyless**:
Said of whatever the app shows with no set-up: the map today, the White model once it exists. What Photoreal falls back to.
_Avoid_: free mode, default mode, fallback view

**Load** (of Photoreal):
One start of Photoreal: opening the app with it on, or turning it on. It is what the providers count and bill; looking around afterwards is not.
_Avoid_: session, request, hit

### Data

**Course Bundle**:
Everything the app needs about one course, prepared ahead of time by the pipeline. The one contract between the two halves.

**Height above the ellipsoid**:
A course-line point's height counted from the WGS84 ellipsoid, the smooth mathematical surface a 3D globe counts heights from, instead of from sea level. Only for placing things in the 3D scene; a runner is never shown it.
_Avoid_: altitude, elevation (elevation is the height above sea level, the one a runner is told)

**Geoid model**:
The published table of how far sea level is from the ellipsoid, place by place: what turns a surveyed height into a height above the ellipsoid.
_Avoid_: datum shift, correction

**Course facts** / **Edition facts**:
Hand-maintained sourced facts about a course, and about one edition of it.

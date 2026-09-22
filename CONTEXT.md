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
A place the Ride names as it goes by, and can ride to or go back to: the start, a landmark, the finish, or a stretch where something happens (to begin with, a climb that gains 15 m or more). On the road the Ride slows down for it, and for a stretch arrives where it begins and stays slow to where it ends; From above it keeps its one pace.
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

**The vicinity**:
The part of the world the map may be taken to while a course is showing: that course's own box with about a city's width round it. The map looks freely within it, and cannot be dragged, panned or zoomed out of it; the Ride's camera and free look are tied to the runner and are never held by it.
_Avoid_: the box, the geofence, the leash

**Ride**:
The mode that carries the runner along the course as a time-lapse, past its Stops.
_Avoid_: flyover, tour, playback, video, walkthrough

**From above** / **On the road**:
The Ride's two cameras. From above looks down on the runner from the air; On the road follows from a few metres up and behind, the way a lead vehicle films a race.
_Avoid_: bird's-eye mode, drive cam, runner's-eye, first-person

**Free look**:
The camera in the Ride while it is the runner's to turn rather than the Ride's: a hand on the map orbits the runner, a scroll moves in and out, and the Ride plays on. A hand on the map is the only way in; while it lasts the player puts **Go back to cinematic** where the two cameras stand, and that button is the way back. It is still a camera that follows the runner: it never becomes the free map, which is Explore's.
_Avoid_: free cam, orbit mode, manual camera, detached camera

**Cinematic**:
The owner's word for the Ride's own camera, both of its two: what the runner goes back to from free look. It shows in one place, the player's **Go back to cinematic**, and in the code it names that button and nothing else. Nowhere else is a camera called cinematic: the Ride's two are **From above** and **On the road**, and the camera in the Ride is the Ride's or the runner's.
_Avoid_: cinematic mode, cinematic camera (as a third camera: there are two)

**Time-lapse**:
How the Ride passes the course: far quicker than any runner, and gentler On the road than From above. From above it is one pace from start to finish; On the road it is quick between Stops, slow at them, and slows into corners.
_Avoid_: fast-forward, speed-up, animation

**Cruise**:
The time-lapse's speed on the open road between Stops. From above it is the Ride's speed everywhere.

**Player**:
The Ride's controls, on the top of the map: where the Ride is among the Stops, Back, play or pause, which of the two cameras, and Back to the map — and, in free look, **Go back to cinematic** in the cameras' own place. In Explore the same place holds the one button, "Ride the course".
_Avoid_: transport bar, toolbar, media controls

**Glide**:
The moment's move the camera makes when the Ride jumps somewhere else (its start, Back, the other camera, a scrub, Play after the runner has looked around), instead of a cut. With reduced motion asked for, it is a cut.
_Avoid_: flight (a flight is the map's own move to the whole course or to the runner), transition

**Map**:
The city seen from above with the course drawn on it. It is the same scene the Ride moves through, not a separate thing.
Nothing is drawn on its ground: with no key the ground is the paper and the White model's blocks stand on it; with a key
Google's photographed city does (D57).
_Avoid_: globe, 2D view, basemap (there is none)

**The paper ground**:
The one flat colour the map's ground is, the design's own paper. The sun still lights it, so it dims after sunset.
_Avoid_: basemap, backdrop, canvas

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

**Shade**:
The layer of whether the sun is on the road, at the moment the runner reaches it. Binary, every
10 m: in the sun, or in a building's shade. Never a share of a kilometre and never a range (D58).
The owner named it Shade rather than Sun on 09-21, so that saying "the Shade layer" can't be
confused with the sun itself.
_Avoid_: sun layer, heat, percentage in sun

**Never shaded**:
Said of a stretch of road that is in the sun at **every** hour the shade is worked out for: the
bridges and the wide avenues. A fact about the place, not about one runner's morning. It had a
row of its own for a day and the owner had it taken out (09-21); it is said in the sentence,
where it is true, and nowhere else.
_Avoid_: always sunny, exposure score, all-day sun

**Sun table**:
The Course Bundle's own answer for the Shade layer: one bit for every course sample and every
five-minute step of race day whose sun stands above the floor. The app looks up the column the
runner's arrival falls in; it never works shade out itself.
_Avoid_: shade map, sun grid

**Floor**:
The lowest sun shade is worked out for, 10°. Below it a city street is in shadow whatever anyone
computes, so the answer there is *no direct sun*, stated rather than measured, and greyed like any
filled-in value.
_Avoid_: cutoff, threshold, minimum altitude

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
A stretch of the course line that a layer marks on the map: the line is drawn wider there, in one of its two slots, or flat grey where the layer's value is not measured.
_Avoid_: highlight, segment, overlay

**Band**:
The wide, coloured slot of the course line, outside the blue: where a hill is, coloured by how steep. One of the two slots a line mark is painted in.
_Avoid_: stripe, fill, highlight

**Rim**:
The dark slot hugging the blue: the road's own edge darkened where it is in shade — solid for a building's, dotted for a tree's, nothing in the sun.
_Avoid_: border, outline, shadow line

**Chip**:
The small paper label, framed in ink, that names a point on the course line — an aid station, with its glyphs — and is that point's whole mark on the map. A look of its own, beside the encodings: it names a place rather than stating a value measured of the course.
_Avoid_: pin, badge, marker

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

**Block**:
One building in the White model: its outline as the city publishes it, pulled up to one flat roof. A
building with parts of different heights is several blocks.
_Avoid_: massing, extrusion, footprint (a footprint is the outline, not the block)

**Corridor**:
The strip of city either side of the course that the pipeline reads and the White model covers. Set
once per course and written in the data, so the flat city beyond it is the corridor, not a fault.
_Avoid_: buffer, catchment, radius

**Photoreal**:
Google's photographed 3D city, shown with the runner's own key. For looking at only: never stored, never used to work anything out.
_Avoid_: satellite view, Google Maps mode

**Own key**:
The runner's own Google Maps key or Cesium ion token: what lets Photoreal be shown. Kept only in their browser, and sent only to the provider it belongs to.
_Avoid_: API key (alone), credentials, BYOK

**Keyless**:
Said of what the app shows with no set-up: the White model on the paper ground. What Photoreal falls back to.
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

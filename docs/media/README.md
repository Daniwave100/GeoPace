# The media

What the README shows, and how it was made. Every clip is the app as it is today, recorded from the
app itself: nothing is mocked up, painted over or sped up beyond the app's own Speed slider. The
clips are in photoreal, with the owner's own Google Maps key, so Google's logo and data credits are
in every frame, where the app puts them, and stay in every cut. Without a key the same views show
the city's own buildings as white blocks.

| File | What it shows |
|---|---|
| `hero-berlin-finish.gif` | The last 4 km of the Berlin Marathon for a runner starting at 08:45 with a 4:00 goal: the Ride from above at 1×, from km 38.7 at 12:24, just past Potsdamer Platz, past the Gendarmenmarkt and through the Brandenburg Gate to the finish. 9 s. |
| `nyc-verrazzano.gif` | New York's start with every layer on: the Ride on the road at 1× from the start over the Verrazzano-Narrows Bridge's upper deck. The strip and the sentence grey the middle of the main span, whose height is filled in because the LiDAR has no returns there. The start time and the date are marked as carried over and not confirmed, as the app marks them. 11 s. |
| `tour-drag-the-strip.gif` | Tour step 3: Hills, Shade and Aid on, the camera still over central Berlin, and the strip dragged from km 35 to the finish and back: the runner runs along the course on the map, and the kilometre, the time of day, the sentence and the cursor on every chart move with them. 10 s. |
| `tour-hills.gif` | Tour step 2, Hills alone, in New York: the Ride from above at ½× from km 23.9, up the Queensboro Bridge and down onto First Avenue. 7 s. |
| `tour-shade.gif` | Tour step 2, Shade alone, in Berlin on race morning: the Ride from above at ½× from km 1.9, round the Großer Stern and on into Moabit. 6 s. |
| `tour-aid.gif` | Tour step 2, Aid alone, in Berlin: the Ride from above at ½× from km 8.4, past the 9 km station toward the 12 km one. 6 s. |
| `tour-all-layers.gif` | Tour step 2, Hills, Shade and Aid together: the Ride from above at ½× from km 22.9, past Rathaus Schöneberg. 7 s. |
| `tour-on-the-road.gif` | Tour step 4: the Ride on the road at 1×, 250 ft up and 150 m behind the runner, from km 41.2 on Unter den Linden through the Brandenburg Gate to the finish, no layers on. 10 s. |
| `tour-race-plan.gif` | Tour step 5: Your race plan opened from the banner, a 3:30 goal typed over the default 4:00, the finish time and the banner following, then Every kilometre opened: each kilometre's time of day and elapsed time. 8 s. |
| `nyc-manhattan.gif` | Tour step 6, New York's last 4 km: the Ride from above at 1× from km 38.4, into Central Park at East 90th Street, out at Grand Army Plaza, along Central Park South to Columbus Circle and back into the park to the finish. 9 s. |

## How it was made

Recorded in Chrome on a Mac, in the app's light theme, at a 1280 × 800 window (1280 × 900 where every layer's
row is on the strip), by a script that drives the app on a clock of its own: each frame is drawn in full,
with every tile of the photographed city arrived, exactly 1/30 s of the app's time after the last, however
long the tiles take to come. So the motion is the app's real pace and no frame is dropped; on a live
connection a moving camera can outrun the imagery for a moment, which the clips don't show. Where a
pointer is seen, it is drawn where the script's mouse is, since a recording browser draws none.

The key stayed in the recording browser's own storage, where the app keeps it, and nothing from Google was
saved but the frames themselves. The GIFs are cut with [gifski](https://gif.ski): 10 or 12 frames a second
and 720 px wide where the camera moves, 15 frames a second and 960 px where it holds still, which keeps each
one small enough to load on a phone. The clips of one layer each play at half speed, with the app's own
Speed slider, so each layer's marks can be followed; the slider shows it in the frame.

One thing in the frames is the app's own slip, not the recording's: over photoreal, the panel's *"Camera:
about … m above the ground"* keeps the height from before a Ride for as long as it plays (#52).

# FlyHigh ✈️ — English vocabulary flight adventure

A single-player three.js flight game for learning English vocabulary.

## How to start
- **Easiest:** double-click `index.html`. It opens in Edge or Chrome.
  The first time it runs, it needs an internet connection to load the 3D engine (three.js) and the fonts.
- **If the page stays on "Loading the 3D engine…":** run a tiny local web server from this folder and open http://localhost:8765:
  `python -m http.server 8765`

## Modes
| | Rookie (Years 3–4 ESL) | Normal (Year 6) |
|---|---|---|
| Words | 138 flight-themed words (plane parts, airport, people, weather, places seen from the air, flying machines, directions) with pictures | 117 aviation, weather and flight-science words (thrust, drag, crosswind, altitude, divert…) with synonyms and opposites |
| Questions | emoji, definition, fill-the-gap (3 choices), read aloud | definition, synonym, opposite, meaning, fill-the-gap (4 choices) |
| ATC | "Turn left. Fly West.", "Go up to 2,000 feet." | "Turn right heading 140, climb and maintain 5,500 feet." |
| Flying | auto-levelling wings, pitch limits, auto-flare, gentle landings, half fuel use | full manual, stricter landings |

Each mode has its own save (stored in the browser).

## Gameplay
- **Word Gates:** a question appears and three rings appear ahead. Fly through the right answer. Get several right in a row for a combo multiplier.
- **ATC:** follow the instruction (heading, altitude, speed or fly to a landmark) and hold it to earn FlightPoints. Press 1–3 to choose the correct readback for a bonus.
- **Missions (10 kinds):** ferry flights (night mail after dark), cargo deliveries (with a vocabulary cargo check), landmark surveys (with a fact to read), search and rescue, ring races, **hospital flights** against the clock, **parachute supply drops** (press X; a green ring shows where the box will land), **water bombing** a forest fire (skim the sea to fill the tank, then drop on the fire), **sightseeing tours** of several landmarks, and **follow-the-leader** formation flying.
- **Hangar** (land, stop, press H): mission board, 6 planes (Sparrow → Bluebird → Pelican → Kestrel → Swift jet → Thunderbird jet), engine/wing/fuel upgrades, paint colours, Ground School quizzes and a Word Logbook with mastery stars.
- **Weather** (unlocks when you reach Junior Pilot): sunny, strong wind with gusts, rain, and thunderstorms. Wind pushes the plane sideways and makes it bumpy. Rain lowers visibility. Storm cells show as red/yellow on the radar (minimap and big map). Inside a storm there is heavy turbulence, downdrafts, and lightning that can cut the engine for a moment. ATC broadcasts weather reports and gives storm-avoidance headings (bonus FP when you follow them). **Thick fog** cuts visibility to a few hundred metres, and a **low cloud layer** turns everything white inside it (fly under it or climb above it). Missions finished in bad weather pay +25%, and landings in strong wind earn a crosswind bonus.
- **Day and night:** a full day passes in about 15 minutes (nights are shorter). Sunrise and sunset light the sky, stars and the moon come out, and airports switch on runway edge lights, flashing approach lights, PAPI glide-slope lights (two red + two white = on the slope) and blue apron lights. The lights also come on in fog, cloud and rain. Your plane has red/green wingtip lights and strobes. Night landings, fog landings and night missions pay a bonus. A ⛰ terrain warning helps when you can't see the hills. You can turn the cycle off in Settings.
- **Cruise mode:** on a mission more than 4.5 km away, once you're airborne, point the nose at the mission marker for a couple of seconds (or press K). The autopilot climbs over the hills and flies there at 4× speed while the camera switches to slow, movie-style shots. It hands control back 2 km from the target, already descending toward it. Press K or any flight key to take over early. It won't start during a word gate or ATC task, or with a storm ahead, and it stops if one appears. Fuel burns at normal speed.
- **Exploration:** 7 islands, 8 airports, 7 landmarks, 15 hidden treasure stars, boats and hot-air balloons.
- **Pilot ranks:** Cadet → Junior Pilot → Pilot → Senior Pilot → Captain → Ace → Sky Legend.

## Controls
SHIFT/R power up · Z/F power down · ↑↓ or W/S pitch · ←→ or A/D bank and turn · Q/E rudder · SPACE brakes · 1–3 ATC readback · V repeat · H hangar · M map · C camera · K cruise · X drop (supplies / water) · T smoke · P/ESC pause. Drag the mouse to look around. A gamepad also works.

## Sound and performance (Snapdragon X laptops)
**Sound:** Settings has two sliders: *Plane & sound effects* (engine, wind, rain, thunder, chimes) and *ATC voice & radio*. Turn the plane down without losing the tower.

The default is **Medium**: shadows only around your plane, about 15k instanced trees, no post-processing, and the resolution adjusts itself to keep the frame rate smooth.
Use **Settings → Graphics quality → Low** on battery power, or **High** when plugged in. Runway lights are a single draw call and the low cloud layer is only drawn while that weather is active.

## Files
`index.html`, `css/style.css`, and the scripts in `js/`: `vocab.js` (word lists — edit these to add your own words), `world.js` (procedural islands), `planes.js`, `flight.js`, `atc.js`, `weather.js` (wind, rain, fog, low cloud, storms, radar), `missions.js` (hospital, drop, fire, tour and formation missions), `game.js`, `ui.js`, `audio.js`, `effects.js`, `main.js`.

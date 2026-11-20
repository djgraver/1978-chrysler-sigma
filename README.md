# 1978 Chrysler Sigma

An orange 1978 Chrysler Sigma GL (GE series, Astron 2000) modelled from photographs of the real car, and a driving simulator that puts it on the streets of Hobart, Tasmania, in the 1970s. Built with three.js.

- `index.html` is the simulator.
- `viewer.html` is the car on its own, to orbit and inspect.

## Running it

The simulator reads its map from the image files next to it, so serve the folder over HTTP; opening the file directly will not work.

    python3 -m http.server
    # then open http://localhost:8000/

**Last Light (v7).** The simulator is now also a short art game. Hobart, November 1978: the sky has gone the colour of milk and the world is quietly winding down. Five chapters, each an errand of two stops (a prescription for Mum, a set of white photographs for Ruth, a record back to Tom, a cutting of Dad's rose, and a full tank for the drive up Mount Wellington). A column of pale light marks each stop, a card shows the goal, distance and direction, and you stop there to read what happens. After every chapter the sky whitens, the colour drains, the streets and roads empty, the radio loses its stations, and bulletins from a radio somewhere grow fainter. The last errand ends at the summit, where the driver turns off the engine and dies as the light comes in: no violence, just a heartbeat slowing to nothing and a fade to white. The credits are a slow scroll through deep time, from the sun's eight-minute light to the heat death of the universe, and end on "You did the errands anyway." Progress is remembered in your browser; "Just drive" skips the story.

**The driver** sits in the right-hand seat and never leaves the car: a feathered 70s shag, aviators with orange glass, a burnt-orange shirt with a huge collar over a brown corduroy jacket, a medallion and flares. Their hands stay on the wheel and follow it as it turns, and their head looks into the corners. In driver view you see through the orange lenses.

Controls: W A S D or the arrow keys to drive, Space for the handbrake, C for chase or driver view, R to get back on the road, F (held) to fill up at a pump, M to switch the radio on or off, N for the next station, drag to look around. On a phone there are on-screen pedals and a fill button. Time of day, the day cycle, weather and the film look are in the "Time & weather" panel; fuel use, sound, traffic, pedestrians and shadows are under "Options".

## What is in the world

Everything within 30 km of the Hobart GPO is generated in the browser as you drive, from these files. The `.txt` files are zlib-compressed binary in base64; the page unpacks them with the browser's DecompressionStream. They used to be packed into PNGs, but some browsers add noise to canvas pixel reads, which corrupted the data.

| File | What it holds |
| --- | --- |
| `terrain.txt` | Ground height on a 40 m grid (16-bit), from the Mapzen/AWS terrain tiles |
| `ground.jpg` | Ground colour on the same grid, from Sentinel-2 cloudless imagery |
| `land.txt` | Tree cover (low 4 bits) and water (bit 4) on a 20 m grid, classified from the same imagery |
| `roads.txt` | About 3,000 km of OpenStreetMap streets, smoothed, with names, widths, one-way, bridge and footpath flags, plus 504 traffic signals and 3,700 mapped trees |
| `buildings.txt` | 152,000 OpenStreetMap building footprints, each with a style, roof shape, pitch, roof and wall colour and height |
| `extra.json` | OpenStreetMap fuel stations (79) and bus stops (1,888) |

How each part is made:

- **Roads** follow smoothed centrelines. Heights are smoothed across the whole network and then by distance along each road (a Gaussian about 22 m wide), so grades run evenly and connected roads meet level; bridges span between their banks. The land beside a road is graded to it, and under a roadway it always sits below the lowest road, so it never shows through. Urban streets get kerbs and footpaths that stop short of junctions, and street lamps every 38 m.
- **Buildings** are real footprints. When the data is packed, each gets a style from its OSM tags, size and where it is in Hobart: Georgian sandstone, Federation brick, weatherboard, 60s-70s brick veneer, modern, shed, industrial, city block, flats or church. Roof shape and colour come from OSM tags where present (rare). Otherwise they are picked from that style's palette, nudged toward the colour the satellite sees for bigger roofs. The page then builds walls, window patterns and roofs from one general method. Hipped, gabled, half-hipped and pyramid roofs project each corner of the footprint onto a ridge along the building's long axis. Skillion roofs are a tilted plane, and flat roofs get parapets.
- **Trees** come from OSM's mapped trees, tree cover read from the imagery, garden trees in built-up blocks, and street trees along footpaths.
- **kunanyi / Mt Wellington** turns to dark brown and grey rock above the forest, with patchy snow on top. The snowline drops when it snows.
- **Traffic lights** come from OSM signal nodes and run two-phase cycles; the traffic stops for them.
- **Traffic** is up to 140 vehicles in fifteen generic 1970s and early-80s body styles, each lofted from cross-sections with its own glasshouse, chrome or rubber bumpers, round or square lamps and period paint: large sedan (some with vinyl roofs), wagon, ute, panel van, mid-size sedan, fastback coupe, small hatch, compact sedan, mini, early-80s sedan, people mover, four-wheel drive, taxi, delivery truck and city bus. None copies a real make and none carries a badge. They follow the road network, keep their distance, stop at red lights and stop when you hit them.
- **Pedestrians** walk the footpaths, cross at corners, wait at bus stops and step out of the Sigma's way. Their arms and legs swing in the vertex shader. There are fewer of them at night and in the rain. The car passes through them; it does not collide with them.
- **Collisions:** the Sigma collides with building footprints, petrol station islands and kiosks, bus shelters and other cars, with an impulse at the contact point, so a glancing blow spins it.
- **Fuel:** the Sigma burns petrol from its engine power (brake-specific consumption plus idle) from a 60 L tank, so about 7.5 L/100 km at a steady 60 km/h. A multiplier (1x, 5x by default, 20x) makes the tank last a sensible time. When it runs dry the engine sputters and stops, and you can call a tow to the nearest station. The 79 service stations are rebuilt as late-70s forecourts with generic signage: a concrete pad, a canopy, two pump islands, a kiosk and a roadside price sign (20.9 cents a litre). Hold F beside a pump to fill.
- **Bus stops** have a pole and sign, and about half have a shelter.
- **Materials:** physically based shading throughout, lit by the sky through an environment map that is rebuilt as the light changes. Walls get brick courses, weatherboards, sandstone blocks, render or concrete panels; roofs get corrugated iron, tiles or slate; windows have frames, sills, curtains and reflections; houses get verandahs, chimneys and front fences. Roads have wheel tracks, patches, cracks and puddles in the wet, and power poles with wires run along suburban streets. The ground in the dense centre is paved.
- **Shadows:** a 2048-pixel shadow map covers about 76 m around the car and is snapped to its texels, so edges don't crawl.
- **Time and weather:** the sun follows its real path over Hobart for today's date. Weather can be clear, overcast, rain, fog or snow, or changing. At night there are lit windows, street lamps, lit forecourts, headlights and tail lights on every car.
- **Film look:** warm faded colour grading, halation round bright lights, grain and vignette, applied as a post-process.
- **Radio:** five stations of original music composed live in the browser in 70s styles (lounge, disco, soft rock, funk, glam). No recordings are used.

**Car physics.** The Sigma runs on a planar vehicle model with tyre slip curves and a friction circle per axle, weight transfer, a four-speed gearbox with automatic shifts and a slipping clutch at launch, engine braking, and a spring and damper at each corner that drives heave, pitch and roll and feeds the tyre loads. The steering wheel winds on over about a second and returns a little faster, and full lock shrinks with speed. Measured on the flat: 0-100 km/h in about 12 s, 100-0 braking in about 50 m with about 2 degrees of nose dive, about 0.75 g of grip on dry bitumen with about 6 degrees of body roll. Grip drops on footpaths, grass, in the wet and on snow. Top speed is limited to 100 km/h.

**Sound.** The engine is synthesised from its firing frequency through a throttle-opened filter, with intake noise, tyre squeal, road and wind noise, rain and the thump of a collision.

## Source

- `src/car.js` is the car model and viewer.
- `src/sim/` holds the simulator in parts (core, world, city, cars and traffic, sky, radio, pedestrians, fuel and street furniture, sound, main) plus its page markup. The car model is spliced in after the core. `tools/build6.py` assembles them into `index.html`.
- `tools/` has the scripts that fetched and packed the data. `qb.py` fetches OSM buildings and points, `s2tiles.py` and `mosaic.py` fetch the imagery, `land.py` classifies it, and `prep4.py` packs roads, signals, trees and buildings, and `extra.py` extracts fuel stations and bus stops.

## Credits

Streets, buildings, trees and signals (c) OpenStreetMap contributors, Open Database Licence. Elevation from the Mapzen terrain tiles hosted by AWS. Tree cover, water and ground colour derived from Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0.

# 1978 Chrysler Sigma

An orange 1978 Chrysler Sigma GL (GE series, Astron 2000) modelled from photographs of the real car, and a driving simulator that puts it on the streets of Hobart, Tasmania, in the 1970s. Built with three.js.

- `index.html` is the simulator.
- `viewer.html` is the car on its own, to orbit and inspect.

## Running it

The simulator reads its map from the image files next to it, so serve the folder over HTTP; opening the file directly will not work.

    python3 -m http.server
    # then open http://localhost:8000/

Controls: W A S D or the arrow keys to drive, Space for the handbrake, C for chase or driver view, R to get back on the road, M to switch the radio on or off, N for the next station, drag to look around. On a phone there are on-screen pedals. Time of day, the day cycle, weather and the film look are in the "Time & weather" panel.

## What is in the world

Everything within 30 km of the Hobart GPO is generated in the browser as you drive, from these files. The `.txt` files are zlib-compressed binary in base64; the page unpacks them with the browser's DecompressionStream. They used to be packed into PNGs, but some browsers add noise to canvas pixel reads, which corrupted the data.

| File | What it holds |
| --- | --- |
| `terrain.txt` | Ground height on a 40 m grid (16-bit), from the Mapzen/AWS terrain tiles |
| `ground.jpg` | Ground colour on the same grid, from Sentinel-2 cloudless imagery |
| `land.txt` | Tree cover (low 4 bits) and water (bit 4) on a 20 m grid, classified from the same imagery |
| `roads.txt` | About 3,000 km of OpenStreetMap streets, smoothed, with names, widths, one-way, bridge and footpath flags, plus 504 traffic signals and 3,700 mapped trees |
| `buildings.txt` | 152,000 OpenStreetMap building footprints, each with a style, roof shape, pitch, roof and wall colour and height |

How each part is made:

- **Roads** follow smoothed centrelines. Heights are smoothed across the whole network and then by distance along each road (a Gaussian about 22 m wide), so grades run evenly and connected roads meet level; bridges span between their banks. The land beside a road is graded to it, and under a roadway it always sits below the lowest road, so it never shows through. Urban streets get kerbs and footpaths that stop short of junctions, and street lamps every 38 m.
- **Buildings** are real footprints. When the data is packed, each gets a style from its OSM tags, size and where it is in Hobart: Georgian sandstone, Federation brick, weatherboard, 60s-70s brick veneer, modern, shed, industrial, city block, flats or church. Roof shape and colour come from OSM tags where present (rare). Otherwise they are picked from that style's palette, nudged toward the colour the satellite sees for bigger roofs. The page then builds walls, window patterns and roofs from one general method. Hipped, gabled, half-hipped and pyramid roofs project each corner of the footprint onto a ridge along the building's long axis. Skillion roofs are a tilted plane, and flat roofs get parapets.
- **Trees** come from OSM's mapped trees, tree cover read from the imagery, garden trees in built-up blocks, and street trees along footpaths.
- **kunanyi / Mt Wellington** turns to dark brown and grey rock above the forest, with patchy snow on top. The snowline drops when it snows.
- **Traffic lights** come from OSM signal nodes and run two-phase cycles; the traffic stops for them.
- **Traffic** is 80 cars in seven simple period body types: sedan, wagon, ute, van, small car, fastback and truck.
- **Time and weather:** the sun follows its real path over Hobart for today's date. Weather can be clear, overcast, rain, fog or snow, or changing. At night there are lit windows, street lamps, headlights and tail lights.
- **Film look:** warm faded colour grading, halation round bright lights, grain and vignette, applied as a post-process.
- **Radio:** five stations of original music composed live in the browser in 70s styles (lounge, disco, soft rock, funk, glam). No recordings are used.

The Sigma has a four-speed gearbox, takes about 17 s to reach 100 km/h, and is limited to 100 km/h.

## Source

- `src/car.js` is the car model and viewer.
- `src/sim/` holds the simulator in parts (core, world, city, cars, sky, radio, main) plus its page markup. The car model is spliced in after the core.
- `tools/` has the scripts that fetched and packed the data. `qb.py` fetches OSM buildings and points, `s2tiles.py` and `mosaic.py` fetch the imagery, `land.py` classifies it, and `prep4.py` packs roads, signals, trees and buildings.

## Credits

Streets, buildings, trees and signals (c) OpenStreetMap contributors, Open Database Licence. Elevation from the Mapzen terrain tiles hosted by AWS. Tree cover, water and ground colour derived from Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0.

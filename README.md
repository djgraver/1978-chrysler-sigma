# 1978 Chrysler Sigma

An interactive 3D model of an orange 1978 Chrysler Sigma GL sedan (GE series, Astron 2000), and a small driving simulator that lets you drive it around Hobart, Tasmania. Built with three.js.

- `index.html` is the driving simulator.
- `viewer.html` is the car on its own, to orbit and inspect.

## Running it

The simulator reads its map from `roads.png` and `terrain.png`, so it has to be served over HTTP; opening the file directly will not work.

    python3 -m http.server
    # then open http://localhost:8000/

Controls: W A S D or the arrow keys to drive, Space for the handbrake, C to switch between chase and driver view, R to get back on the road, drag to look around. On a phone there are on-screen pedals.

## How the world is built

Everything within 30 km of the Hobart GPO is generated in the browser as you drive:

- `terrain.png` holds ground heights on a 40 m grid (16 bits per sample in the red and green channels), resampled from the Mapzen/AWS terrain tiles.
- `roads.png` holds the street network (about 3,000 km of road in 16,000 segments, with names, widths, one-way and bridge flags) from OpenStreetMap, packed as bytes into an image.
- The land is drawn as a quadtree of tiles, 4 km across in the distance down to 4 m detail under the car. Near roads the land is graded to meet the road surface. Bridges span between their abutments.
- Houses and city buildings are placed procedurally along streets in built-up areas. They are not real buildings.
- Other cars follow the street network, keep left and respect one-way streets.

## How the car was made

The body shape was read off a side-on photograph of the car after solving for where the camera stood, then checked by rendering the model from the same camera position over the front, rear and three-quarter photographs. Length (4,300 mm), width (1,660 mm), wheelbase (2,515 mm) and track are the factory figures and set the scale.

## Source

`src/car.js` is the car model and viewer, `src/sim.js` the simulator (the model is spliced in where it says `/*SIGMA*/`), and `src/head.html` the simulator's page markup. `tools/` has the scripts that fetched and packed the map data.

## Credits

Street data (c) OpenStreetMap contributors, available under the Open Database Licence. Elevation from the Mapzen terrain tiles hosted by AWS.

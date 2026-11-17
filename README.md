# 1978 Chrysler Sigma

An interactive 3D model of an orange 1978 Chrysler Sigma GL sedan (GE series, Astron 2000), built with three.js.

Open `index.html` in a browser. Drag to orbit, scroll or pinch to zoom, and use the buttons for fixed views.

## How it was made

The body shape was read off a side-on photograph of the car after solving for where the camera stood, then checked by rendering the model from the same camera position over the front, rear and three-quarter photographs.

Length (4,300 mm), width (1,660 mm), wheelbase (2,515 mm) and track are the factory figures and set the scale. The height is as measured from the photo.

The page is a single file. It loads three.js r128 and OrbitControls from a CDN, so it needs a network connection.

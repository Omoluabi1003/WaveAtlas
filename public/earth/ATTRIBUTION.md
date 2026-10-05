# Satellite globe imagery

Bundled as compressed WebP textures on 2026-10-05. No API key, subscription, CDN texture fetch, or commercial graphics dependency is required. Attribution is also displayed in `/legal/attribution`.

- Day: NASA Blue Marble, Land Surface, Ocean Color and Sea Ice. NASA Goddard Space Flight Center; Reto Stöckli, with enhancements by Robert Simmon. Source: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg
- Clouds: NASA Blue Marble cloud composite; Reto Stöckli / NASA Goddard Space Flight Center. Source: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
- Night: NASA Earth Observatory, Earth's City Lights. Defense Meteorological Satellite Program observations. Source: https://eoimages.gsfc.nasa.gov/images/imagerecords/55000/55167/earth_lights_lrg.jpg

Overview and credits: https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/
NASA media use guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/

These are historical composites, not a live satellite or cloud feed. Cloud drift is an illustrative visual effect. The day/night boundary is based on current UTC using NOAA's fractional-year solar approximation: https://gml.noaa.gov/grad/solcalc/solareqns.PDF

Only resampling and WebP compression were applied. Mobile textures are 1024×512, desktop day/night textures are 2048×1024; clouds are 1024×512. No NASA logo or implied endorsement is included.

The native WebGL surface shares the existing orthographic camera and composites beneath the existing country borders, labels, signals, and interaction canvas. A failed shader, missing day texture, unsupported GPU, or lost context leaves the bundled canvas geography in place. Optional cloud/night texture failures leave their black placeholder active and do not remove land.

Opt out with `NEXT_PUBLIC_WAVEATLAS_REALISTIC_EARTH=false`, or force the existing globe with `NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER=true`, then rebuild. The satellite surface is enabled by default only for the Photorealistic Globe basemap; other basemaps retain their existing appearance.

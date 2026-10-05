# Globe country boundaries

`natural-earth-countries.json` contains the 177 country features from Natural Earth's 1:110m admin-0 country boundaries. Natural Earth data is in the public domain.

Source: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson

Downloaded: 2026-10-05. Coordinates, polygon topology, and feature order are unchanged. Only unused properties and bounding boxes were removed; `NAME_EN`, `NAME`, `ADMIN`, and `ISO_A2` remain for the existing renderer and country selection.

The globe imports this dataset with its application code and initializes land shapes synchronously. It does not fetch boundary geometry or access Cache Storage at runtime. To refresh boundaries, replace this checked-in snapshot from the source, preserve the retained properties, and run `npm run test:landmasses` and `npm run test:renderer` before deployment.

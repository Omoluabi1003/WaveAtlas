# Globe country boundaries

`natural-earth-countries.json` contains the 177 country features from Natural Earth's 1:110m admin-0 country boundaries. Natural Earth data is in the public domain.

Source: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson

Downloaded: 2026-10-05. Coordinates, polygon topology, and feature order are unchanged. Only unused properties and bounding boxes were removed; `NAME_EN`, `NAME`, `ADMIN`, and `ISO_A2` remain for the existing renderer and country selection.

The globe imports this dataset with its application code and initializes land shapes synchronously. It does not fetch boundary geometry or access Cache Storage at runtime. To refresh boundaries, replace this checked-in snapshot from the source, preserve the retained properties, and run `npm run test:landmasses` and `npm run test:renderer` before deployment.

## State and province boundaries

`natural-earth-states.json` is a compact globe-scale snapshot of Natural Earth's public-domain 1:10m admin-1 boundary lines, downloaded 2026-10-05:
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces_lines.geojson

Rebuild with `python scripts/build-globe-boundaries.py /path/to/source.geojson`. Lines are grouped by country, joined at degree-two endpoints, simplified with a 0.06-degree Douglas-Peucker tolerance, and rounded to five decimal places. Features without geometry and isolated segments smaller than 0.02 degrees in both dimensions are omitted at globe scale. The snapshot has 194 administrative area groups, including an unassigned group, and 8,662 line strings. Coverage reflects the source and is not universal or a cadastral authority.

State/province geometry loads as a separate local application chunk when zoom exceeds 1.18. Subdivision strokes fade in through zoom 1.42 and use fine dashed pale-gold lines; national borders remain solid white with a dark underlay. A failed state chunk retains country borders and the satellite surface and can retry after 15 seconds. No paid service, API key, or runtime third-party boundary fetch is needed.

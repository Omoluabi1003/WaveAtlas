import type { StyleSpecification } from "maplibre-gl";

// Public map sources only. Map view must work without credentials or environment configuration.
export type BasemapKey = "atlasStreets" | "atlas" | "satellite" | "terrain" | "streets" | "night" | "blueMarble";

export const basemapStyles: Record<BasemapKey, { label: string; name: string; description: string; style: string | StyleSpecification }> = {
  atlasStreets: { label: "🛣 Atlas Streets", name: "Atlas Streets", description: "Free vector streets for arrival zoom, powered by OpenStreetMap/OpenFreeMap.", style: "https://tiles.openfreemap.org/styles/liberty" },
  atlas: { label: "🌎 Atlas", name: "Atlas", description: "Free dark vector streets, powered by OpenStreetMap/OpenFreeMap.", style: "https://tiles.openfreemap.org/styles/dark" },
  satellite: { label: "🛰 Satellite", name: "Satellite", description: "Realistic Earth imagery", style: { version: 8, sources: { esri: { type: "raster", tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" } }, layers: [{ id: "esri-world-imagery", type: "raster", source: "esri" }] } },
  terrain: { label: "🏔 Terrain", name: "Terrain", description: "Topographic terrain", style: { version: 8, sources: { terrain: { type: "raster", tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap (CC-BY-SA)" } }, layers: [{ id: "opentopomap-terrain", type: "raster", source: "terrain" }] } },
  streets: { label: "🗺 OSM Streets", name: "OSM Streets", description: "Classic OpenStreetMap vector style", style: "https://tiles.openfreemap.org/styles/liberty" },
  night: { label: "🌃 Night", name: "Night Lights", description: "Earth at night", style: { version: 8, sources: { nasa: { type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"], tileSize: 256, attribution: "NASA GIBS / VIIRS City Lights" } }, layers: [{ id: "viirs-night-lights", type: "raster", source: "nasa" }] } },
  blueMarble: { label: "🌊 Blue Marble", name: "Blue Marble", description: "Clean global Earth aesthetic", style: { version: 8, sources: { marble: { type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"], tileSize: 256, attribution: "NASA GIBS / Blue Marble" } }, layers: [{ id: "blue-marble", type: "raster", source: "marble" }] } },
};

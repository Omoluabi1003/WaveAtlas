"use client";
import { useEffect, useMemo } from "react";
import type { Map, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { usePublicSignalPolling, usePublicSignals, visiblePublicSignals } from "@/hooks/usePublicSignals";
import { SIGNAL_LAYERS } from "@/lib/public-signals";
import PublicSignalPanel from "./PublicSignalPanel";

export const PUBLIC_SIGNAL_MAP_LAYER = "public-signals-dot";
export default function PublicSignalMapLayer({ map, mobile, anchor }: { map: Map | null; mobile: boolean; anchor: { lat: number; lng: number } | null }) {
  usePublicSignalPolling();
  const state = usePublicSignals();
  const points = useMemo(() => visiblePublicSignals(state), [state]);
  useEffect(() => {
    if (!map) return;
    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: points.map(p => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { id: p.id, color: SIGNAL_LAYERS[p.layer].color, selected: p.id === state.selected?.id } })) };
    const install = () => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource("public-signals")) map.addSource("public-signals", { type: "geojson", data });
      else (map.getSource("public-signals") as GeoJSONSource).setData(data);
      if (!map.getLayer(PUBLIC_SIGNAL_MAP_LAYER)) map.addLayer({ id: PUBLIC_SIGNAL_MAP_LAYER, type: "circle", source: "public-signals", paint: { "circle-radius": ["case", ["get", "selected"], 9, 5], "circle-color": ["get", "color"], "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff", "circle-opacity": 0.9 } });
    };
    const inspect = (event: MapLayerMouseEvent) => { const point = points.find(p => p.id === event.features?.[0]?.properties?.id); if (point) usePublicSignals.getState().select(point); };
    install(); map.on("style.load", install); map.on("click", PUBLIC_SIGNAL_MAP_LAYER, inspect);
    return () => { map.off("style.load", install); map.off("click", PUBLIC_SIGNAL_MAP_LAYER, inspect); };
  }, [map, points, state.selected?.id]);
  return <PublicSignalPanel mobile={mobile} anchor={anchor} onLocate={point => map?.flyTo({ center: [point.lng, point.lat], zoom: 4, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1200 })} />;
}

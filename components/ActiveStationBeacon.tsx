"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import { haversineKm, prefersReducedMotion } from "@/lib/map-camera";
import {
  drawSignalBeacon,
  interpolateSignalBeacon,
  signalBeaconClassName,
  signalBeaconHtml,
  signalBeaconTravelDuration,
  type SignalBeaconStatus,
} from "@/lib/signal-beacon-engine";

export type ActiveStationBeaconGeo = { lat: number | null; lng: number | null; tone: string };

export function ActiveStationBeacon({ map, geo, status }: { map: Map | null; geo: ActiveStationBeaconGeo; status: SignalBeaconStatus }) {
  const markerRef = useRef<Marker | null>(null);
  const animationRef = useRef<number | null>(null);
  const hasPositionRef = useRef(false);

  useEffect(() => {
    if (!map) return;
    const element = document.createElement("div");
    element.style.transform = "translate3d(0,0,0)";
    element.style.willChange = "transform";
    const marker = new maplibregl.Marker({ element, anchor: "center" }).setLngLat([0, 0]).addTo(map);
    markerRef.current = marker;
    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      marker.remove();
      hasPositionRef.current = false;
      if (markerRef.current === marker) markerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || geo.lat === null || geo.lng === null) return;
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
    const target = { lng: geo.lng, lat: geo.lat };
    if (!hasPositionRef.current) {
      marker.setLngLat([target.lng, target.lat]);
      hasPositionRef.current = true;
      return;
    }
    const start = marker.getLngLat();
    const distanceKm = haversineKm({ lat: start.lat, lng: start.lng }, target);
    const duration = prefersReducedMotion() ? 0 : signalBeaconTravelDuration(distanceKm);
    if (duration === 0) {
      marker.setLngLat([target.lng, target.lat]);
      return;
    }
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const point = interpolateSignalBeacon({ lat: start.lat, lng: start.lng }, target, t);
      marker.setLngLat([point.lng, point.lat]);
      if (t < 1) animationRef.current = window.requestAnimationFrame(tick);
    };
    animationRef.current = window.requestAnimationFrame(tick);
    return () => { if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current); };
  }, [geo.lat, geo.lng]);

  useEffect(() => {
    const element = markerRef.current?.getElement();
    if (!element) return;
    element.className = signalBeaconClassName(geo.tone, status);
    element.innerHTML = signalBeaconHtml();
  }, [geo.tone, status]);

  return null;
}

export function drawActiveStationBeacon(...args: Parameters<typeof drawSignalBeacon>) {
  return drawSignalBeacon(...args);
}

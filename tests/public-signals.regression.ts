import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/api/public-signals/route";
import { isSignalLayer, normalizePublicSignals, safeSignalUrl, signalDistanceKm } from "../lib/public-signals";
import { usePublicSignals, visiblePublicSignals } from "../hooks/usePublicSignals";

async function main() {
  assert.equal(isSignalLayer("earthquakes"), true);
  assert.equal(isSignalLayer("__proto__"), false);
  assert.equal(safeSignalUrl("javascript:alert(1)", "https://example.com/"), "https://example.com/");
  const quake = { id: "abc", geometry: { type: "Point", coordinates: [179.5, -12, 5] }, properties: { mag: 3.8, place: "Test", time: 1_780_000_000_000, url: "https://earthquake.usgs.gov/earthquakes/eventpage/abc" } };
  const points = normalizePublicSignals("earthquakes", { features: [quake, quake, { ...quake, id: "bad", geometry: { type: "Point", coordinates: [null, 0] } }] });
  assert.equal(points.length, 1); assert.equal(points[0].lat, -12); assert.equal(points[0].lng, 179.5);
  const events = normalizePublicSignals("events", { events: [{ id: "fire", title: "Fire", categories: [{ title: "Wildfires" }], geometry: [{ type: "Point", coordinates: [1, 2], date: "2026-01-02" }, { type: "Point", coordinates: [3, 4], date: "2026-01-01" }, { type: "Polygon", coordinates: [], date: "2026-01-03" }] }] });
  assert.equal(events[0].lng, 1); assert.equal(events[0].lat, 2);
  assert.equal(normalizePublicSignals("iss", { id: 25544, latitude: 91, longitude: 0, timestamp: 100 }).length, 0);
  assert.equal(normalizePublicSignals("iss", { id: 25544, latitude: 0, longitude: 0, timestamp: 100 })[0].observedAt, "1970-01-01T00:01:40.000Z");
  assert.equal(normalizePublicSignals("events", null).length, 0);
  assert.ok(signalDistanceKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 }) < 23);
  const now = Date.now();
  const snapshot = { layer: "earthquakes" as const, fetchedAt: new Date(now).toISOString(), points };
  usePublicSignals.setState({ enabled: { earthquakes: true, events: false, iss: false }, layers: { earthquakes: { status: "ready", snapshot }, events: { status: "idle" }, iss: { status: "idle" } } });
  assert.equal(visiblePublicSignals(usePublicSignals.getState(), now).length, 1);
  assert.equal(visiblePublicSignals(usePublicSignals.getState(), now + 900_001).length, 0);
  usePublicSignals.getState().select(points[0]); usePublicSignals.getState().toggle("earthquakes");
  assert.equal(usePublicSignals.getState().selected, null); assert.equal(visiblePublicSignals(usePublicSignals.getState()).length, 0);
  usePublicSignals.setState(s => ({ enabled: { ...s.enabled, earthquakes: true }, layers: { ...s.layers, earthquakes: { status: "unavailable", snapshot } } }));
  assert.equal(visiblePublicSignals(usePublicSignals.getState()).length, 0);
  const original = globalThis.fetch;
  try {
    assert.equal((await GET(new NextRequest("http://localhost/api/public-signals?layer=constructor"))).status, 400);
    globalThis.fetch = async () => new Response(JSON.stringify({ features: [quake] }), { status: 200 });
    const response = await GET(new NextRequest("http://localhost/api/public-signals?layer=earthquakes"));
    assert.equal(response.status, 200); assert.equal((await response.json()).points.length, 1);
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    assert.equal((await GET(new NextRequest("http://localhost/api/public-signals?layer=events"))).status, 503);
    globalThis.fetch = async () => { throw new Error("Offline"); };
    const failed = await GET(new NextRequest("http://localhost/api/public-signals?layer=iss"));
    assert.equal(failed.status, 503); assert.equal(failed.headers.get("Cache-Control"), "no-store");
  } finally { globalThis.fetch = original; }
  console.log("Public signal regression checks passed");
}
void main();

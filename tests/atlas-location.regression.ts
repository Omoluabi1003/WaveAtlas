import assert from "node:assert/strict";
import { readAtlasLocation } from "../lib/atlas-location";
import { uniquePlaceLabel } from "../lib/place-label";

async function main() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } } });
  let permission = "prompt";
  let calls = 0;
  let complete: PositionCallback | undefined;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    permissions: { query: async () => ({ state: permission }) },
    geolocation: { getCurrentPosition: (success: PositionCallback) => { calls++; complete = success; } },
  } });
  assert.equal(await readAtlasLocation(), undefined);
  permission = "denied";
  assert.equal(await readAtlasLocation(), undefined);
  assert.equal(calls, 0, "Automatic activity never prompts for permission");
  const explicit = readAtlasLocation({ allowPrompt: true });
  const simultaneous = readAtlasLocation();
  assert.equal(calls, 1, "Panels and nearby discovery share the active request");
  complete!({ coords: { latitude: 6.5, longitude: 3.4, accuracy: 80 } } as GeolocationPosition);
  assert.deepEqual(await explicit, { lat: 6.5, lng: 3.4, accuracy: 80 });
  assert.deepEqual(await simultaneous, await explicit);
  assert.deepEqual(await readAtlasLocation(), await explicit);
  assert.equal(calls, 1, "Saved coordinates are reused without another GPS call");
  values.set("waveatlas.location.v1", JSON.stringify({ lat: 6.5, lng: 3.4, accuracy: 80, at: Date.now() - 16 * 60_000 }));
  assert.equal(await readAtlasLocation(), undefined, "Expired location never causes an automatic permission prompt");
  permission = "granted";
  const granted = readAtlasLocation();
  await Promise.resolve();
  complete!({ coords: { latitude: 7, longitude: 4, accuracy: 90 } } as GeolocationPosition);
  assert.deepEqual(await granted, { lat: 7, lng: 4, accuracy: 90 });
  assert.equal(calls, 2);
  assert.equal(uniquePlaceLabel(["Nigeria", " nigeria "]), "Nigeria");
  assert.equal(uniquePlaceLabel(["Lagos", "Nigeria"]), "Lagos, Nigeria");
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "navigator");
  console.log("Location permission gating, request deduplication, cache expiry and place label regressions passed.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });

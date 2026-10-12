import assert from "node:assert/strict";
import { shareStation, stationIdFromUrl, stationIdFromPath, stationLocation, stationPath, stationSharePayload } from "../lib/station-deep-link";
import { fetchStationByUuid } from "../lib/stations";

async function main() {
  const premierId = "ariyo-ai-premier-935-fm-ibadan";
  const premier = await fetchStationByUuid(premierId);

  assert.ok(premier, "Premier must resolve through the shared station catalogue");
  assert.equal(premier.name, "Premier FM 93.5 Ibadan");
  assert.equal(stationPath(premier), `/station/${premierId}`);
  assert.equal(stationIdFromPath(`/station/${premierId}`), premierId);
  assert.equal(stationIdFromPath("/station/%E0%A4%A"), "", "malformed station paths fail closed");
  assert.equal(stationLocation(premier), "Ibadan, Oyo, Nigeria");
  assert.deepEqual(stationSharePayload(premier, "https://waveatlas.example/"), {
    title: "Premier FM 93.5 Ibadan | WaveAtlas",
    text: "Listen to Premier FM 93.5 Ibadan on WaveAtlas.",
    url: `https://waveatlas.example/station/${premierId}`,
  });
  assert.equal(await fetchStationByUuid("not-a-real-waveatlas-station"), null, "invalid IDs never resolve to a substitute");

  const unicode = { ...premier, id: "short", station_uuid: "uuid-second", name: "Ọ̀yọ́ & L’Écho's Radio" };
  assert.notEqual(stationPath(unicode), stationPath(premier));
  assert.equal(stationIdFromUrl(new URL("https://waveatlas.test/?station=short")), "short");
  assert.equal(stationIdFromPath(stationPath({ id: "Ọ̀yọ́ & /", station_uuid: "" })), "Ọ̀yọ́ & /");
  assert.equal(stationSharePayload(unicode).title, `${unicode.name} | WaveAtlas`);
  const duplicate = { ...unicode, station_uuid: "different-uuid" };
  assert.notEqual(stationPath(duplicate), stationPath(unicode));
  let nativePayload: ShareData | undefined;
  let copied = "";
  const browser = { share: async (payload: ShareData) => { nativePayload = payload; }, clipboard: { writeText: async (url: string) => { copied = url; } } } as unknown as Navigator;
  assert.equal(await shareStation(unicode, browser), "shared");
  assert.equal(nativePayload?.url, stationSharePayload(unicode).url);
  browser.share = async () => { throw new Error("Native sharing unavailable"); };
  assert.equal(await shareStation(unicode, browser), "copied");
  assert.equal(copied, nativePayload?.url);
  browser.share = async () => { throw new DOMException("Cancelled", "AbortError"); };
  copied = "";
  assert.equal(await shareStation(unicode, browser), "cancelled");
  assert.equal(copied, "");

  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://catalog.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop();
    const id = url.searchParams.get("old_station_uuid");
    let rows: unknown[] = [];
    if (table === "station_redirects" && id === "eq.legacy-id") rows = [{ new_station_uuid: "canonical-id" }];
    if (table === "station_redirects" && id === "eq.cycle-a") rows = [{ new_station_uuid: "cycle-b" }];
    if (table === "station_redirects" && id === "eq.cycle-b") rows = [{ new_station_uuid: "cycle-a" }];
    if (table === "stations" && url.searchParams.get("station_uuid") === "eq.canonical-id") rows = [{ ...premier, station_uuid: "canonical-id", name: "Updated canonical name", url: "https://updated.test/live", url_resolved: "https://updated.test/live", is_active: false }];
    if (table === "station_aliases" && url.searchParams.get("alias") === "eq.old-alias") rows = [{ station_id: "db-id" }];
    if (table === "station_aliases" && url.searchParams.get("alias") === "eq.ambiguous") rows = [{ station_id: "one" }, { station_id: "two" }];
    if (table === "stations" && url.searchParams.get("id") === "eq.db-id") rows = [{ station_uuid: "canonical-id" }];
    return Response.json(rows);
  };
  try {
    const redirected = await fetchStationByUuid("legacy-id");
    assert.equal(redirected?.station_uuid, "canonical-id");
    assert.equal(redirected?.name, "Updated canonical name");
    assert.equal(redirected?.url, "https://updated.test/live");
    assert.equal(redirected?.is_active, false, "Unavailable identities retain their metadata");
    assert.equal((await fetchStationByUuid("old-alias"))?.station_uuid, "canonical-id");
    assert.equal(await fetchStationByUuid("ambiguous"), null);
    assert.equal(await fetchStationByUuid("cycle-a"), null);
    const { GET } = await import("../app/api/stations/by-uuid/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest("https://waveatlas.test/api/stations/by-uuid?uuid=legacy-id"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).station.station_uuid, "canonical-id");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
  console.log("station deep-link regression checks passed");
}

void main();

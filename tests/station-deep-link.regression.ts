import assert from "node:assert/strict";
import { stationIdFromPath, stationLocation, stationPath, stationSharePayload } from "../lib/station-deep-link";
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
    text: "Listen to Premier FM 93.5 Ibadan from Ibadan, Nigeria on WaveAtlas.",
    url: `https://waveatlas.example/station/${premierId}`,
  });
  assert.equal(await fetchStationByUuid("not-a-real-waveatlas-station"), null, "invalid IDs never resolve to a substitute");

  console.log("station deep-link regression checks passed");
}

void main();

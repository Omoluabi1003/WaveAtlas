import assert from "node:assert/strict";
import { stationNightNotice } from "../lib/station-night-notice";
import { startupStations } from "../lib/startupStations";

const station = { ...startupStations[0], id: "notice-test", station_uuid: "notice-test", name: "Test radio", city: "Ibadan", state: "Oyo", country: "Nigeria", country_code: "NG", latitude: 7.3775, longitude: 3.947 };
assert.equal(stationNightNotice(station, Date.parse("2026-10-05T12:00:00Z")), null);
assert.equal(stationNightNotice(station, Date.parse("2026-10-05T17:45:00Z")), null, "Twilight must not be presented as darkness");
assert.deepEqual(stationNightNotice(station, Date.parse("2026-10-05T21:00:00Z")), {
  title: "Nighttime in Ibadan.", subtitle: "After dusk at your listening destination.",
});
assert.equal(stationNightNotice(station, NaN), null);
assert.equal(stationNightNotice({ ...station, city: "", state: "", latitude: undefined, longitude: undefined }, Date.parse("2026-10-05T21:00:00Z")), null, "A country centroid cannot describe darkness throughout a country");
const unknown = { ...station, country_code: "ZZ", city: "Unverified", latitude: undefined, longitude: undefined };
assert.equal(stationNightNotice(unknown, Date.now()), null);
const newYork = { ...station, city: "New York", country: "United States", country_code: "US", latitude: 40.7128, longitude: -74.006 };
assert.equal(stationNightNotice(newYork, Date.parse("2026-10-05T16:00:00Z")), null);
assert.ok(stationNightNotice(newYork, Date.parse("2026-10-05T04:00:00Z")));
console.log("Station night notice passed: local darkness, daylight, twilight, missing coordinates, and geographic precision.");

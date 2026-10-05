import { solarIntensity } from "./earth-lighting";
import { resolveStationGeo } from "./geotruth-resolver";
import type { Station } from "./stations";

export function stationNightNotice(station: Station, at: number) {
  const geo = resolveStationGeo(station);
  if (!Number.isFinite(at) || geo.lat === null || geo.lng === null || !["station", "city"].includes(geo.precision)) return null;
  // Wait until civil dusk has ended, rather than calling twilight darkness.
  if (solarIntensity({ lat: geo.lat, lng: geo.lng }, at) > Math.sin(-6 * Math.PI / 180)) return null;
  const location = station.city?.trim() || station.state?.trim();
  return {
    title: location ? `Nighttime in ${location}.` : "Nighttime at this station.",
    subtitle: "After dusk at your listening destination.",
  };
}

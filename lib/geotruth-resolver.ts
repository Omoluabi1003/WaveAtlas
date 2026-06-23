import type { Station } from './stations';

export type GeoPrecision = 'station' | 'city' | 'country' | 'unknown';
export type GeoSource = 'manual_override' | 'city_gazetteer' | 'verified_api_geo' | 'country_centroid' | 'unknown';
export type ResolvedStationGeo = { lat: number | null; lng: number | null; precision: GeoPrecision; confidence: number; source: GeoSource; warning: string | null };
type ContinentKey = 'africa' | 'europe' | 'asia' | 'north_america' | 'south_america' | 'oceania' | 'antarctica';
type Point = { lat: number; lng: number };
type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

type StationGeoOverride = Point & { precision: Exclude<GeoPrecision, 'unknown'>; source: 'manual_override'; confidence: number; notes?: string };

export const stationGeoOverrides: Record<string, StationGeoOverride> = {
  'bbc-world-service': { lat: 51.5072, lng: -0.1276, precision: 'station', source: 'manual_override', confidence: 100, notes: 'Curated London broadcast identity.' },
  'ariyo-ai-agidigbo-887-fm-ibadan': { lat: 7.3775, lng: 3.9470, precision: 'station', source: 'manual_override', confidence: 100, notes: 'Curated Ibadan station.' },
  'cool-fm-lagos': { lat: 6.5244, lng: 3.3792, precision: 'station', source: 'manual_override', confidence: 100, notes: 'Curated Lagos station.' },
  'wazobia-fm-lagos': { lat: 6.5244, lng: 3.3792, precision: 'station', source: 'manual_override', confidence: 100, notes: 'Curated Lagos station.' },
  'arise-news-radio': { lat: 6.5244, lng: 3.3792, precision: 'station', source: 'manual_override', confidence: 100, notes: 'Curated Lagos station.' },
};

// Local ISO-3166 country centroids used only for station geography. Never substitute these from listener or stream-server IP data.
export const isoCountryCentroids: Record<string, Point> = {
  AD:{lat:42.5462,lng:1.6016},AE:{lat:23.4241,lng:53.8478},AF:{lat:33.9391,lng:67.71},AG:{lat:17.0608,lng:-61.7964},AI:{lat:18.2206,lng:-63.0686},AL:{lat:41.1533,lng:20.1683},AM:{lat:40.0691,lng:45.0382},AO:{lat:-11.2027,lng:17.8739},AR:{lat:-38.4161,lng:-63.6167},AT:{lat:47.5162,lng:14.5501},AU:{lat:-25.2744,lng:133.7751},AZ:{lat:40.1431,lng:47.5769},BA:{lat:43.9159,lng:17.6791},BB:{lat:13.1939,lng:-59.5432},BD:{lat:23.685,lng:90.3563},BE:{lat:50.5039,lng:4.4699},BF:{lat:12.2383,lng:-1.5616},BG:{lat:42.7339,lng:25.4858},BH:{lat:25.9304,lng:50.6378},BI:{lat:-3.3731,lng:29.9189},BJ:{lat:9.3077,lng:2.3158},BM:{lat:32.3214,lng:-64.7574},BN:{lat:4.5353,lng:114.7277},BO:{lat:-16.2902,lng:-63.5887},BR:{lat:-14.235,lng:-51.9253},BS:{lat:25.0343,lng:-77.3963},BT:{lat:27.5142,lng:90.4336},BW:{lat:-22.3285,lng:24.6849},BY:{lat:53.7098,lng:27.9534},BZ:{lat:17.1899,lng:-88.4976},CA:{lat:56.1304,lng:-106.3468},CD:{lat:-4.0383,lng:21.7587},CF:{lat:6.6111,lng:20.9394},CG:{lat:-0.228,lng:15.8277},CH:{lat:46.8182,lng:8.2275},CI:{lat:7.54,lng:-5.5471},CL:{lat:-35.6751,lng:-71.543},CM:{lat:7.3697,lng:12.3547},CN:{lat:35.8617,lng:104.1954},CO:{lat:4.5709,lng:-74.2973},CR:{lat:9.7489,lng:-83.7534},CU:{lat:21.5218,lng:-77.7812},CV:{lat:16.5388,lng:-23.0418},CY:{lat:35.1264,lng:33.4299},CZ:{lat:49.8175,lng:15.473},DE:{lat:51.1657,lng:10.4515},DJ:{lat:11.8251,lng:42.5903},DK:{lat:56.2639,lng:9.5018},DM:{lat:15.415,lng:-61.371},DO:{lat:18.7357,lng:-70.1627},DZ:{lat:28.0339,lng:1.6596},EC:{lat:-1.8312,lng:-78.1834},EE:{lat:58.5953,lng:25.0136},EG:{lat:26.8206,lng:30.8025},ER:{lat:15.1794,lng:39.7823},ES:{lat:40.4637,lng:-3.7492},ET:{lat:9.145,lng:40.4897},FI:{lat:61.9241,lng:25.7482},FJ:{lat:-17.7134,lng:178.065},FR:{lat:46.2276,lng:2.2137},GA:{lat:-0.8037,lng:11.6094},GB:{lat:55.3781,lng:-3.436},GD:{lat:12.1165,lng:-61.679},GE:{lat:42.3154,lng:43.3569},GH:{lat:7.9465,lng:-1.0232},GM:{lat:13.4432,lng:-15.3101},GN:{lat:9.9456,lng:-9.6966},GQ:{lat:1.6508,lng:10.2679},GR:{lat:39.0742,lng:21.8243},GT:{lat:15.7835,lng:-90.2308},GW:{lat:11.8037,lng:-15.1804},GY:{lat:4.8604,lng:-58.9302},HN:{lat:15.2,lng:-86.2419},HR:{lat:45.1,lng:15.2},HT:{lat:18.9712,lng:-72.2852},HU:{lat:47.1625,lng:19.5033},ID:{lat:-0.7893,lng:113.9213},IE:{lat:53.1424,lng:-7.6921},IL:{lat:31.0461,lng:34.8516},IN:{lat:20.5937,lng:78.9629},IQ:{lat:33.2232,lng:43.6793},IR:{lat:32.4279,lng:53.688},IS:{lat:64.9631,lng:-19.0208},IT:{lat:41.8719,lng:12.5674},JM:{lat:18.1096,lng:-77.2975},JO:{lat:30.5852,lng:36.2384},JP:{lat:36.2048,lng:138.2529},KE:{lat:-0.0236,lng:37.9062},KG:{lat:41.2044,lng:74.7661},KH:{lat:12.5657,lng:104.991},KI:{lat:-3.3704,lng:-168.734},KM:{lat:-11.875,lng:43.8722},KN:{lat:17.3578,lng:-62.783},KP:{lat:40.3399,lng:127.5101},KR:{lat:35.9078,lng:127.7669},KW:{lat:29.3117,lng:47.4818},KZ:{lat:48.0196,lng:66.9237},LA:{lat:19.8563,lng:102.4955},LB:{lat:33.8547,lng:35.8623},LC:{lat:13.9094,lng:-60.9789},LI:{lat:47.166,lng:9.5554},LK:{lat:7.8731,lng:80.7718},LR:{lat:6.4281,lng:-9.4295},LS:{lat:-29.61,lng:28.2336},LT:{lat:55.1694,lng:23.8813},LU:{lat:49.8153,lng:6.1296},LV:{lat:56.8796,lng:24.6032},LY:{lat:26.3351,lng:17.2283},MA:{lat:31.7917,lng:-7.0926},MC:{lat:43.7384,lng:7.4246},MD:{lat:47.4116,lng:28.3699},ME:{lat:42.7087,lng:19.3744},MG:{lat:-18.7669,lng:46.8691},MK:{lat:41.6086,lng:21.7453},ML:{lat:17.5707,lng:-3.9962},MM:{lat:21.9162,lng:95.956},MN:{lat:46.8625,lng:103.8467},MR:{lat:21.0079,lng:-10.9408},MT:{lat:35.9375,lng:14.3754},MU:{lat:-20.3484,lng:57.5522},MV:{lat:3.2028,lng:73.2207},MW:{lat:-13.2543,lng:34.3015},MX:{lat:23.6345,lng:-102.5528},MY:{lat:4.2105,lng:101.9758},MZ:{lat:-18.6657,lng:35.5296},NA:{lat:-22.9576,lng:18.4904},NE:{lat:17.6078,lng:8.0817},NG:{lat:9.082,lng:8.6753},NI:{lat:12.8654,lng:-85.2072},NL:{lat:52.1326,lng:5.2913},NO:{lat:60.472,lng:8.4689},NP:{lat:28.3949,lng:84.124},NZ:{lat:-40.9006,lng:174.886},OM:{lat:21.4735,lng:55.9754},PA:{lat:8.538,lng:-80.7821},PE:{lat:-9.19,lng:-75.0152},PG:{lat:-6.315,lng:143.9555},PH:{lat:12.8797,lng:121.774},PK:{lat:30.3753,lng:69.3451},PL:{lat:51.9194,lng:19.1451},PT:{lat:39.3999,lng:-8.2245},PY:{lat:-23.4425,lng:-58.4438},QA:{lat:25.3548,lng:51.1839},RO:{lat:45.9432,lng:24.9668},RS:{lat:44.0165,lng:21.0059},RU:{lat:61.524,lng:105.3188},RW:{lat:-1.9403,lng:29.8739},SA:{lat:23.8859,lng:45.0792},SB:{lat:-9.6457,lng:160.1562},SC:{lat:-4.6796,lng:55.492},SD:{lat:12.8628,lng:30.2176},SE:{lat:60.1282,lng:18.6435},SG:{lat:1.3521,lng:103.8198},SI:{lat:46.1512,lng:14.9955},SK:{lat:48.669,lng:19.699},SL:{lat:8.4606,lng:-11.7799},SM:{lat:43.9424,lng:12.4578},SN:{lat:14.4974,lng:-14.4524},SO:{lat:5.1521,lng:46.1996},SR:{lat:3.9193,lng:-56.0278},SS:{lat:6.877,lng:31.307},ST:{lat:0.1864,lng:6.6131},SV:{lat:13.7942,lng:-88.8965},SY:{lat:34.8021,lng:38.9968},SZ:{lat:-26.5225,lng:31.4659},TD:{lat:15.4542,lng:18.7322},TG:{lat:8.6195,lng:0.8248},TH:{lat:15.87,lng:100.9925},TJ:{lat:38.861,lng:71.2761},TL:{lat:-8.8742,lng:125.7275},TM:{lat:38.9697,lng:59.5563},TN:{lat:33.8869,lng:9.5375},TO:{lat:-21.179,lng:-175.1982},TR:{lat:38.9637,lng:35.2433},TT:{lat:10.6918,lng:-61.2225},TV:{lat:-7.1095,lng:177.6493},TZ:{lat:-6.369,lng:34.8888},UA:{lat:48.3794,lng:31.1656},UG:{lat:1.3733,lng:32.2903},US:{lat:39.8283,lng:-98.5795},UY:{lat:-32.5228,lng:-55.7658},UZ:{lat:41.3775,lng:64.5853},VA:{lat:41.9029,lng:12.4534},VC:{lat:12.9843,lng:-61.2872},VE:{lat:6.4238,lng:-66.5897},VN:{lat:14.0583,lng:108.2772},VU:{lat:-15.3767,lng:166.9592},WS:{lat:-13.759,lng:-172.1046},YE:{lat:15.5527,lng:48.5164},ZA:{lat:-30.5595,lng:22.9375},ZM:{lat:-13.1339,lng:27.8493},ZW:{lat:-19.0154,lng:29.1549}
};

export const countryBounds: Record<string, Bounds> = {
  JP:{minLat:24,maxLat:46.5,minLng:122,maxLng:146.5},NG:{minLat:3.5,maxLat:14.5,minLng:2,maxLng:15},GB:{minLat:49.5,maxLat:61,minLng:-9.5,maxLng:2.5},US:{minLat:18,maxLat:72,minLng:-172,maxLng:-66},FR:{minLat:41,maxLat:51.5,minLng:-5.5,maxLng:10},DE:{minLat:47,maxLat:55.2,minLng:5,maxLng:15.5},AE:{minLat:22,maxLat:27,minLng:51,maxLng:57},GH:{minLat:4,maxLat:12,minLng:-4,maxLng:2},BR:{minLat:-34,maxLat:6,minLng:-75,maxLng:-32},ZA:{minLat:-35,maxLat:-22,minLng:16,maxLng:33},CA:{minLat:41,maxLat:84,minLng:-142,maxLng:-52},IN:{minLat:6,maxLat:37,minLng:68,maxLng:98},AU:{minLat:-44,maxLat:-10,minLng:112,maxLng:154},MX:{minLat:14,maxLat:33,minLng:-119,maxLng:-86},ES:{minLat:27,maxLat:44,minLng:-19,maxLng:5},IT:{minLat:35,maxLat:48,minLng:6,maxLng:19},CN:{minLat:18,maxLat:54,minLng:73,maxLng:135},KR:{minLat:33,maxLat:39,minLng:124,maxLng:132},NL:{minLat:50,maxLat:54,minLng:3,maxLng:8},SE:{minLat:55,maxLat:69.5,minLng:10,maxLng:25},NO:{minLat:57,maxLat:72,minLng:4,maxLng:32},IE:{minLat:51,maxLat:56,minLng:-11,maxLng:-5},CH:{minLat:45,maxLat:48,minLng:5,maxLng:11},BE:{minLat:49,maxLat:52,minLng:2,maxLng:7},PT:{minLat:32,maxLat:42.5,minLng:-32,maxLng:-6},AR:{minLat:-56,maxLat:-21,minLng:-74,maxLng:-53},CL:{minLat:-56,maxLat:-17,minLng:-76,maxLng:-66},CO:{minLat:-5,maxLat:13,minLng:-82,maxLng:-66},PE:{minLat:-19,maxLat:1,minLng:-82,maxLng:-68}
};

const cityGazetteer: Record<string, Point & { countryCode: string }> = {
  'GH:accra': { lat: 5.6037, lng: -0.1870, countryCode: 'GH' }, 'GH:kumasi': { lat: 6.6666, lng: -1.6163, countryCode: 'GH' }, 'GH:tamale': { lat: 9.4034, lng: -0.8424, countryCode: 'GH' },
  'NG:lagos': { lat: 6.5244, lng: 3.3792, countryCode: 'NG' }, 'NG:abuja': { lat: 9.0765, lng: 7.3986, countryCode: 'NG' }, 'NG:ibadan': { lat: 7.3775, lng: 3.9470, countryCode: 'NG' }, 'NG:oyo': { lat: 7.3775, lng: 3.9470, countryCode: 'NG' },
  'GB:london': { lat: 51.5072, lng: -0.1276, countryCode: 'GB' }, 'JP:tokyo': { lat: 35.6762, lng: 139.6503, countryCode: 'JP' }, 'JP:osaka': { lat: 34.6937, lng: 135.5023, countryCode: 'JP' },
  'US:new york': { lat: 40.7128, lng: -74.006, countryCode: 'US' }, 'US:washington': { lat: 38.9072, lng: -77.0369, countryCode: 'US' },
  'FR:paris': { lat: 48.8566, lng: 2.3522, countryCode: 'FR' }, 'AE:dubai': { lat: 25.2048, lng: 55.2708, countryCode: 'AE' }
};

function finitePoint(lat: unknown, lng: unknown): Point | null { return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null; }
function finiteSwappedPoint(lat: unknown, lng: unknown): Point | null { return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lng >= -90 && lng <= 90 && lat >= -180 && lat <= 180 ? { lat: lng, lng: lat } : null; }
function inBounds(point: Point, bounds: Bounds, padding = 0.75) { return point.lat >= bounds.minLat - padding && point.lat <= bounds.maxLat + padding && point.lng >= bounds.minLng - padding && point.lng <= bounds.maxLng + padding; }
function roughContinent(point: Point): ContinentKey | null {
  const { lat, lng } = point;
  if (lat < -60) return 'antarctica';
  if (lng >= -170 && lng <= -25 && lat >= -5) return 'north_america';
  if (lng >= -92 && lng <= -25 && lat < 13) return 'south_america';
  if (lng >= -25 && lng <= 55 && lat >= -35 && lat <= 38) return 'africa';
  if (lng >= -25 && lng <= 45 && lat > 35) return 'europe';
  if (lng >= 25 && lng <= 180 && lat >= -12) return 'asia';
  if ((lng >= 95 || lng <= -140) && lat < 5) return 'oceania';
  return null;
}
function sameContinentAsCountry(point: Point, code: string) {
  const centroid = isoCountryCentroids[code];
  if (!centroid) return false;
  const expected = roughContinent(centroid);
  const actual = roughContinent(point);
  return Boolean(expected && actual && expected === actual);
}
function normalizedCode(code?: string) { return (code ?? '').trim().toUpperCase(); }
function stationKeys(station: Station) { return [station.station_uuid, station.id].filter(Boolean); }
function cityKey(station: Station) { const city = (station.city || station.state || '').trim().toLowerCase(); return city ? `${normalizedCode(station.country_code)}:${city}` : ''; }

export function coordinateMatchesStationCountry(lat: number, lng: number, countryCode?: string) {
  const code = normalizedCode(countryCode);
  const point = { lat, lng };
  const bounds = countryBounds[code];
  if (bounds) return inBounds(point, bounds);
  return sameContinentAsCountry(point, code);
}

function logCoordinateMismatch(station: Station, supplied: Point | null, resolved: ResolvedStationGeo) {
  if (!supplied || !resolved.warning || typeof console === 'undefined') return;
  console.debug('[WaveAtlas geotruth] coordinate mismatch', {
    station: station.name,
    country_code: normalizedCode(station.country_code) || null,
    supplied: { lat: supplied.lat, lng: supplied.lng },
    resolved: { lat: resolved.lat, lng: resolved.lng },
    precision: resolved.precision,
    source: resolved.source,
    warning: resolved.warning,
  });
}

function resolvedWithMismatchLog(station: Station, supplied: Point | null, resolved: ResolvedStationGeo) {
  logCoordinateMismatch(station, supplied, resolved);
  return resolved;
}

export function resolveStationGeo(station: Station): ResolvedStationGeo {
  const code = normalizedCode(station.country_code);
  for (const key of stationKeys(station)) {
    const override = stationGeoOverrides[key];
    if (override) return { lat: override.lat, lng: override.lng, precision: override.precision, confidence: override.confidence, source: override.source, warning: null };
  }
  const reportedPoint = finitePoint(station.latitude, station.longitude);
  if (reportedPoint) {
    if (coordinateMatchesStationCountry(reportedPoint.lat, reportedPoint.lng, code)) return { lat: reportedPoint.lat, lng: reportedPoint.lng, precision: 'station', confidence: 95, source: 'verified_api_geo', warning: null };
    const swappedPoint = finiteSwappedPoint(station.latitude, station.longitude);
    if (swappedPoint && coordinateMatchesStationCountry(swappedPoint.lat, swappedPoint.lng, code)) {
      return { lat: null, lng: null, precision: 'unknown', confidence: 0, source: 'unknown', warning: `Station coordinates for ${station.name} look swapped (lat=${station.latitude}, lng=${station.longitude}); refusing to reverse them automatically.` };
    }
  }
  const city = cityGazetteer[cityKey(station)];
  if (city) {
    const cityResolved = { lat: city.lat, lng: city.lng, precision: 'city' as const, confidence: 90, source: 'city_gazetteer' as const, warning: reportedPoint ? `Rejected mismatched coordinates for ${code}; using verified city centroid.` : null };
    return reportedPoint ? resolvedWithMismatchLog(station, reportedPoint, cityResolved) : cityResolved;
  }
  if (reportedPoint) {
    const centroid = isoCountryCentroids[code];
    if (centroid) return resolvedWithMismatchLog(station, reportedPoint, { lat: centroid.lat, lng: centroid.lng, precision: 'country', confidence: 60, source: 'country_centroid', warning: `Rejected mismatched coordinates for ${code}; using verified country centroid as last resort.` });
    return resolvedWithMismatchLog(station, reportedPoint, { lat: null, lng: null, precision: 'unknown', confidence: 0, source: 'unknown', warning: `Rejected mismatched coordinates and no verified centroid exists for ${code || 'unknown country'}.` });
  }
  const centroid = isoCountryCentroids[code];
  if (centroid) return { lat: centroid.lat, lng: centroid.lng, precision: 'country', confidence: 60, source: 'country_centroid', warning: 'Station coordinates missing; using verified country centroid.' };
  return { lat: null, lng: null, precision: 'unknown', confidence: 0, source: 'unknown', warning: 'Station country/coordinates are unverified; precise beacon suppressed.' };
}

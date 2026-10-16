export type NigeriaGeoTruthRecord = {
  station: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  precision: 'station' | 'city';
  confidence: number;
  source: string;
  notes?: string;
};

// Geographic baseline for WaveAtlas Nigeria remediation.
// Coordinates marked city precision locate the station in its verified broadcast city,
// not at an invented transmitter/studio position. Upgrade to station precision only
// when an authoritative station/transmitter address is available.
export const nigeriaGeoTruth: NigeriaGeoTruthRecord[] = [
  { station: 'Premier FM 93.5 Ibadan', city: 'Ibadan', state: 'Oyo', latitude: 7.3775, longitude: 3.9470, precision: 'city', confidence: 0.98, source: 'FRCN / Radio Nigeria Ibadan', notes: 'Studios at Broadcasting House, Dugbe; transmitter identified at Moniya. City coordinate retained until facility coordinate is independently verified.' },
  { station: 'Amuludun FM 99.1', city: 'Ibadan', state: 'Oyo', latitude: 7.3775, longitude: 3.9470, precision: 'city', confidence: 0.98, source: 'FRCN / Radio Nigeria Ibadan' },
  { station: 'Asabari FM 88.3', city: 'Saki', state: 'Oyo', latitude: 8.6676, longitude: 3.3939, precision: 'city', confidence: 0.96, source: 'FRCN / Radio Nigeria Ibadan' },
  { station: 'Gold FM 95.5', city: 'Ilesa', state: 'Osun', latitude: 7.6279, longitude: 4.7416, precision: 'city', confidence: 0.96, source: 'FRCN / Radio Nigeria Ibadan' },
  { station: 'Ogo Ilu FM 89.3', city: 'Ogbomoso', state: 'Oyo', latitude: 8.1337, longitude: 4.2401, precision: 'city', confidence: 0.96, source: 'FRCN / Radio Nigeria Ibadan' },
  { station: 'Paramount FM 94.5', city: 'Abeokuta', state: 'Ogun', latitude: 7.1475, longitude: 3.3619, precision: 'city', confidence: 0.96, source: 'FRCN / Radio Nigeria Ibadan' },
  { station: 'Positive FM 102.5', city: 'Akure', state: 'Ondo', latitude: 7.2571, longitude: 5.2058, precision: 'city', confidence: 0.96, source: 'FRCN / Radio Nigeria Ibadan' },
  { station: 'Progress FM 100.5', city: 'Ado-Ekiti', state: 'Ekiti', latitude: 7.6210, longitude: 5.2215, precision: 'city', confidence: 0.96, source: 'FRCN / Radio Nigeria Ibadan' },
  { station: 'Kapital FM 92.9', city: 'Abuja', state: 'FCT', latitude: 9.0765, longitude: 7.3986, precision: 'city', confidence: 0.98, source: 'FRCN' },
  { station: 'Bond FM 92.9', city: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792, precision: 'city', confidence: 0.98, source: 'FRCN' },
  { station: 'Metro FM 97.7', city: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792, precision: 'city', confidence: 0.98, source: 'FRCN', notes: 'FRCN identifies Metro 97.7 FM as Lagos.' },
  { station: 'Coal City FM', city: 'Enugu', state: 'Enugu', latitude: 6.4584, longitude: 7.5464, precision: 'city', confidence: 0.97, source: 'FRCN' },
  { station: 'Pyramid FM', city: 'Kano', state: 'Kano', latitude: 12.0022, longitude: 8.5920, precision: 'city', confidence: 0.97, source: 'FRCN' },
  { station: 'Treasure FM', city: 'Port Harcourt', state: 'Rivers', latitude: 4.8156, longitude: 7.0498, precision: 'city', confidence: 0.97, source: 'FRCN' },
  { station: 'Atlantic FM', city: 'Uyo', state: 'Akwa Ibom', latitude: 5.0377, longitude: 7.9128, precision: 'city', confidence: 0.97, source: 'FRCN' },
  { station: 'Purity FM', city: 'Awka', state: 'Anambra', latitude: 6.2101, longitude: 7.0741, precision: 'city', confidence: 0.97, source: 'FRCN' },
  { station: 'Prime FM', city: 'Lokoja', state: 'Kogi', latitude: 7.8023, longitude: 6.7333, precision: 'city', confidence: 0.97, source: 'FRCN' },
  { station: 'Fombina FM', city: 'Yola', state: 'Adamawa', latitude: 9.2035, longitude: 12.4954, precision: 'city', confidence: 0.97, source: 'FRCN' }
];

export function findNigeriaGeoTruth(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return nigeriaGeoTruth.find((record) => {
    const candidate = record.station.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized);
  });
}

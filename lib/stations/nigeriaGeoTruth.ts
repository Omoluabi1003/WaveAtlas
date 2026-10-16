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

// Authoritative FRCN geographic baseline for WaveAtlas.
// City precision means the coordinate represents the verified broadcast locality,
// never an invented studio/transmitter location. Stream/CDN geography is forbidden.
// Primary identity source: official FRCN / Radio Nigeria station directory.
export const nigeriaGeoTruth: NigeriaGeoTruthRecord[] = [
  // Abuja Operations
  { station: 'ClickNaija Radio', city: 'Abuja', state: 'FCT', latitude: 9.0765, longitude: 7.3986, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Kapital FM 92.9', city: 'Abuja', state: 'FCT', latitude: 9.0765, longitude: 7.3986, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Power FM Bida 100.5', city: 'Bida', state: 'Niger', latitude: 9.0804, longitude: 6.0099, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },

  // Enugu Zone
  { station: 'Coal City FM Enugu 92.9', city: 'Enugu', state: 'Enugu', latitude: 6.4584, longitude: 7.5464, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Heartland FM Owerri 100.5', city: 'Owerri', state: 'Imo', latitude: 5.4891, longitude: 7.0176, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Pacesetter FM Umuahia 103.5', city: 'Umuahia', state: 'Abia', latitude: 5.5249, longitude: 7.4946, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Purity FM Awka 102.5', city: 'Awka', state: 'Anambra', latitude: 6.2101, longitude: 7.0741, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Unity FM Abakaliki 101.5', city: 'Abakaliki', state: 'Ebonyi', latitude: 6.3249, longitude: 8.1137, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Voice FM Nsukka 96.7', city: 'Nsukka', state: 'Enugu', latitude: 6.8560, longitude: 7.3927, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },

  // Ibadan Zone
  { station: 'Amuludun FM Ibadan 99.1', city: 'Ibadan', state: 'Oyo', latitude: 7.3775, longitude: 3.9470, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Asabari Saki FM 88.3', city: 'Saki', state: 'Oyo', latitude: 8.6676, longitude: 3.3939, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Gold FM Ilesa 95.5', city: 'Ilesa', state: 'Osun', latitude: 7.6279, longitude: 4.7416, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Ogo Ilu FM Oko 89.3', city: 'Oko', state: 'Oyo', latitude: 8.0300, longitude: 4.4000, precision: 'city', confidence: 0.95, source: 'FRCN official station directory + Radio Nigeria Ibadan', notes: 'Oko, Surulere LGA, Oyo State. Do not relabel as Ogbomoso.' },
  { station: 'Paramount FM Abeokuta 94.5', city: 'Abeokuta', state: 'Ogun', latitude: 7.1475, longitude: 3.3619, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Positive FM Akure 102.5', city: 'Akure', state: 'Ondo', latitude: 7.2571, longitude: 5.2058, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Premier FM Ibadan 93.5', city: 'Ibadan', state: 'Oyo', latitude: 7.3775, longitude: 3.9470, precision: 'city', confidence: 0.99, source: 'FRCN official station directory + Radio Nigeria Ibadan', notes: 'Studios at Broadcasting House, Dugbe; city precision retained until facility coordinates are independently verified.' },
  { station: 'Progress FM Ado-Ekiti 100.5', city: 'Ado-Ekiti', state: 'Ekiti', latitude: 7.6210, longitude: 5.2215, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },

  // Kaduna Zone
  { station: 'Companion FM Katsina 104.5', city: 'Katsina', state: 'Katsina', latitude: 12.9908, longitude: 7.6018, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Equity FM Birnin Kebbi 103.5', city: 'Birnin Kebbi', state: 'Kebbi', latitude: 12.4539, longitude: 4.1975, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Hausa Service Kaduna 594 AM', city: 'Kaduna', state: 'Kaduna', latitude: 10.5105, longitude: 7.4165, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Horizon FM Dutse 100.5', city: 'Dutse', state: 'Jigawa', latitude: 11.7594, longitude: 9.3392, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Karama FM Kaduna 92.1', city: 'Kaduna', state: 'Kaduna', latitude: 10.5105, longitude: 7.4165, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Pride FM Gusau 103.5', city: 'Gusau', state: 'Zamfara', latitude: 12.1702, longitude: 6.6641, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Pyramid FM Kano 103.5', city: 'Kano', state: 'Kano', latitude: 12.0022, longitude: 8.5920, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Royal FM Sokoto 101.5', city: 'Sokoto', state: 'Sokoto', latitude: 13.0059, longitude: 5.2476, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Supreme FM Kaduna 96.1', city: 'Kaduna', state: 'Kaduna', latitude: 10.5105, longitude: 7.4165, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },

  // Lagos Operations
  { station: 'Bond FM Lagos 92.9', city: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Metro FM Lagos 97.7', city: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Radio One Lagos 103.5', city: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },

  // North Central Zone
  { station: 'Harmony FM Ilorin 103', city: 'Ilorin', state: 'Kwara', latitude: 8.4966, longitude: 4.5421, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Harvest FM Makurdi 103.5', city: 'Makurdi', state: 'Benue', latitude: 7.7337, longitude: 8.5214, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Highland FM Jos 101.5', city: 'Jos', state: 'Plateau', latitude: 9.8965, longitude: 8.8583, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Precious FM Lafia 102.5', city: 'Lafia', state: 'Nasarawa', latitude: 8.4939, longitude: 8.5153, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Prime FM Lokoja 101.5', city: 'Lokoja', state: 'Kogi', latitude: 7.8023, longitude: 6.7333, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },

  // North East Zone
  { station: 'Fombina FM Yola 101.5', city: 'Yola', state: 'Adamawa', latitude: 9.2035, longitude: 12.4954, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Gift FM Jalingo 104.5', city: 'Jalingo', state: 'Taraba', latitude: 8.8937, longitude: 11.3596, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Globe FM Bauchi 98.5', city: 'Bauchi', state: 'Bauchi', latitude: 10.3158, longitude: 9.8442, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Jewel FM Gombe 103.5', city: 'Gombe', state: 'Gombe', latitude: 10.2904, longitude: 11.1670, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Peace FM Maiduguri 102.5', city: 'Maiduguri', state: 'Borno', latitude: 11.8311, longitude: 13.1510, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Sunshine FM Potiskum 88.1', city: 'Potiskum', state: 'Yobe', latitude: 11.7091, longitude: 11.0694, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Wetland FM Gashua 90.5', city: 'Gashua', state: 'Yobe', latitude: 12.8710, longitude: 11.0482, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },

  // South South Zone
  { station: 'Atlantic FM Uyo 104.5', city: 'Uyo', state: 'Akwa Ibom', latitude: 5.0377, longitude: 7.9128, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Bronze FM Benin 101.5', city: 'Benin City', state: 'Edo', latitude: 6.3350, longitude: 5.6037, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Canaan City FM', city: 'Calabar', state: 'Cross River', latitude: 4.9757, longitude: 8.3417, precision: 'city', confidence: 0.99, source: 'FRCN South South official reporting', notes: 'Official central directory currently labels Port Harcourt, but multiple FRCN South South reports identify Canaan City FM as Calabar. Calabar is retained as the authoritative operating locality.' },
  { station: 'Charity FM 104.4', city: 'Asaba', state: 'Delta', latitude: 6.2009, longitude: 6.7333, precision: 'city', confidence: 0.98, source: 'FRCN official station directory', notes: 'Central directory displays 97.1 FM beside the Charity FM 104.4 brand; retain brand identity pending frequency reconciliation.' },
  { station: 'Creek FM Yenagoa 106.5', city: 'Yenagoa', state: 'Bayelsa', latitude: 4.9247, longitude: 6.2642, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' },
  { station: 'Paradise FM Calabar 104.5', city: 'Calabar', state: 'Cross River', latitude: 4.9757, longitude: 8.3417, precision: 'city', confidence: 0.98, source: 'FRCN official station directory' },
  { station: 'Treasure FM Port Harcourt 98.5', city: 'Port Harcourt', state: 'Rivers', latitude: 4.8156, longitude: 7.0498, precision: 'city', confidence: 0.99, source: 'FRCN official station directory' }
];

export const FRCN_EXPECTED_STATION_COUNT = 48;

export function findNigeriaGeoTruth(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return nigeriaGeoTruth.find((record) => {
    const candidate = record.station.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized);
  });
}

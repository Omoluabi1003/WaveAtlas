export type AtlasAirportCountry = {
  code: string;
  name: string;
  continent: string;
};

export type AtlasAirport = {
  ident: string;
  type: string;
  name: string;
  lat: number;
  lng: number;
  continent: string;
  countryCode: string;
  municipality: string;
  iata: string;
  icao: string;
};

const COUNTRIES_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/countries.csv';
const AIRPORTS_URL = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';

const CONTINENT_NAMES: Record<string, string> = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
};

function csvRow(line: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else current += char;
  }
  values.push(current);
  return values;
}

function table(csv: string) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [] as Record<string, string>[];
  const headers = csvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const row = csvRow(line);
    return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
  });
}

let countriesPromise: Promise<AtlasAirportCountry[]> | null = null;
let airportsPromise: Promise<AtlasAirport[]> | null = null;

async function fetchText(url: string) {
  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) throw new Error(`OurAirports request failed: ${response.status}`);
  return response.text();
}

export function continentName(code: string) {
  return CONTINENT_NAMES[code] || code;
}

export function loadAirportCountries() {
  countriesPromise ??= fetchText(COUNTRIES_URL).then((csv) => table(csv)
    .map((row) => ({
      code: row.code,
      name: row.name,
      continent: continentName(row.continent),
    }))
    .filter((row) => /^[A-Z]{2}$/.test(row.code) && row.name && row.continent)
    .sort((a, b) => a.continent.localeCompare(b.continent) || a.name.localeCompare(b.name)));
  return countriesPromise;
}

export function loadAirports() {
  airportsPromise ??= fetchText(AIRPORTS_URL).then((csv) => table(csv)
    .filter((row) => row.scheduled_service === 'yes'
      && Boolean(row.iata_code)
      && row.type !== 'closed_airport'
      && row.type !== 'heliport'
      && row.type !== 'seaplane_base'
      && row.type !== 'balloonport')
    .map((row) => ({
      ident: row.ident,
      type: row.type,
      name: row.name,
      lat: Number(row.latitude_deg),
      lng: Number(row.longitude_deg),
      continent: continentName(row.continent),
      countryCode: row.iso_country,
      municipality: row.municipality,
      iata: row.iata_code,
      icao: row.icao_code || row.gps_code || row.ident,
    }))
    .filter((airport) => Number.isFinite(airport.lat) && Number.isFinite(airport.lng) && /^[A-Z]{2}$/.test(airport.countryCode))
    .sort((a, b) => {
      const rank = (type: string) => type === 'large_airport' ? 0 : type === 'medium_airport' ? 1 : 2;
      return rank(a.type) - rank(b.type) || a.name.localeCompare(b.name);
    }));
  return airportsPromise;
}

export async function airportsForCountry(countryCode: string) {
  const code = countryCode.toUpperCase();
  return (await loadAirports()).filter((airport) => airport.countryCode === code);
}

import type { Station } from '@/lib/stations';
import { ariyoSeedStations } from '@/lib/stations';

export const COUNTRY_PACK_SIZE = 10;
export const COUNTRY_PACK_PROMOTION_RULE = 'Must pass verification before entering Tier 1.';

export const WEAK_COUNTRY_PACKS = [
  { name: 'Bhutan Pack', countryCode: 'BT', country: 'Bhutan', capitalCity: 'Thimphu' },
  { name: 'Somalia Pack', countryCode: 'SO', country: 'Somalia', capitalCity: 'Mogadishu' },
  { name: 'Sierra Leone Pack', countryCode: 'SL', country: 'Sierra Leone', capitalCity: 'Freetown' },
  { name: 'Papua New Guinea Pack', countryCode: 'PG', country: 'Papua New Guinea', capitalCity: 'Port Moresby' },
  { name: 'Mongolia Pack', countryCode: 'MN', country: 'Mongolia', capitalCity: 'Ulaanbaatar' },
] as const;

export type CountryPackDefinition = typeof WEAK_COUNTRY_PACKS[number];

export function countryPackProgress(stations: Station[], pack: CountryPackDefinition) {
  const verified = stations.filter((station) => station.country_code === pack.countryCode && ['verified', 'curated'].includes(station.validation_status ?? '')).length;
  const curatedSeeds = ariyoSeedStations.filter((station) => station.country_code === pack.countryCode).length;
  const accepted = Math.min(COUNTRY_PACK_SIZE, verified + curatedSeeds);
  return { ...pack, target: COUNTRY_PACK_SIZE, accepted, remaining: Math.max(0, COUNTRY_PACK_SIZE - accepted), promotionRule: COUNTRY_PACK_PROMOTION_RULE };
}

export function prioritizeWeakCountryPacks(stations: Station[]) {
  return WEAK_COUNTRY_PACKS.map((pack) => countryPackProgress(stations, pack)).sort((a, b) => b.remaining - a.remaining || a.country.localeCompare(b.country));
}

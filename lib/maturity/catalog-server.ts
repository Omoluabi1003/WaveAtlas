import 'server-only';
import { bundledCanonicalStations, stationFromDatabase } from '../stations';
import { database, databaseConfigured } from './server-data';
export async function canonicalInventory() {
  if (!databaseConfigured()) return { stations: bundledCanonicalStations(), rows: [] as Record<string, unknown>[], scope: 'Bundled canonical inventory', databaseAvailable: false };
  const rows: Record<string, unknown>[] = [];
  for (let offset=0; offset<100000; offset+=1000) {
    const batch=await database('stations', { select: '*', order: 'station_uuid.asc', limit: '1000', offset: String(offset) });rows.push(...batch); if(batch.length<1000) return { stations: rows.map(stationFromDatabase), rows, scope: 'Supabase canonical inventory', databaseAvailable: true };
  }
  throw new Error('Inventory exceeds reporting limit');
}

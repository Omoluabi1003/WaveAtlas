import type { Station } from './stations';
import { readBrowserStorage, writeBrowserStorage } from './browser-storage';
export const LISTENING_MEMORY_KEY = 'waveatlas:listening-memory';
export type ListeningMemory = { version: 1; favorites: string[]; history: Array<{ id: string; at: number }>; preferences: { countries: Record<string, number>; languages: Record<string, number>; genres: Record<string, number> } };
export const emptyListeningMemory = (): ListeningMemory => ({ version: 1, favorites: [], history: [], preferences: { countries: {}, languages: {}, genres: {} } });
const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200))].slice(0, 200) : [];
function signals(value: unknown) { if (!value || typeof value !== 'object') return {}; return Object.fromEntries(Object.entries(value).filter(([key, n]) => key.length <= 100 && !['__proto__','constructor','prototype'].includes(key) && typeof n === 'number' && Number.isFinite(n) && n > 0).slice(0, 100).map(([key, n]) => [key, Math.min(1000, n as number)])); }
export function deserializeListeningMemory(raw: string | null, legacyFavorites: string[] = []): ListeningMemory {
  const empty = emptyListeningMemory(); empty.favorites = ids(legacyFavorites);
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || (value.version !== 1 && value.version !== 0)) return empty;
    const history = Array.isArray(value.history) ? value.history.filter((row: { id?: unknown; at?: unknown }) => typeof row?.id === 'string' && row.id.length <= 200 && typeof row.at === 'number' && Number.isFinite(row.at) && row.at > 0) : [];
    return { version: 1, favorites: ids(value.favorites ?? legacyFavorites), history: [...new Map(history.map((row: { id: string; at: number }) => [row.id, { id: row.id, at: row.at }])).values()].slice(0, 50) as ListeningMemory['history'], preferences: { countries: signals(value.preferences?.countries), languages: signals(value.preferences?.languages), genres: signals(value.preferences?.genres) } };
  } catch { return empty; }
}
export function readListeningMemory() {
  let legacy: string[] = []; try { legacy = ids(JSON.parse(readBrowserStorage('local', 'waveatlas:favorites') || '[]')); } catch { /* optional storage */ }
  return deserializeListeningMemory(readBrowserStorage('local', LISTENING_MEMORY_KEY), legacy);
}
export function writeListeningMemory(memory: ListeningMemory) {
  const safe = deserializeListeningMemory(JSON.stringify(memory));
  writeBrowserStorage('local', LISTENING_MEMORY_KEY, JSON.stringify(safe));
  // Preserve the existing map favorite halo and older clients.
  writeBrowserStorage('local', 'waveatlas:favorites', JSON.stringify(safe.favorites));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('waveatlas:memory-changed'));
}
export function rememberSuccessfulStation(station: Station, now = Date.now()) {
  const memory = readListeningMemory(); const id = station.station_uuid || station.id;
  if (memory.history[0]?.id === id && now - memory.history[0].at < 30000) return;
  memory.history = [{ id, at: now }, ...memory.history.filter(row => row.id !== id)].slice(0, 50);
  for (const [kind, values] of [['countries', [station.country_code]], ['languages', station.language.split(/[,;]/)], ['genres', station.tags]] as const) for (const value of values) { const key = value.trim(); if (key && !['__proto__','constructor','prototype'].includes(key) && !/unknown|global|^UN$/i.test(key)) memory.preferences[kind][key] = Math.min(1000, (memory.preferences[kind][key] ?? 0) + 1); }
  writeListeningMemory(memory);
}
export function toggleFavorite(id: string) { const memory = readListeningMemory(); memory.favorites = memory.favorites.includes(id) ? memory.favorites.filter(key => key !== id) : [...memory.favorites, id]; writeListeningMemory(memory); return memory.favorites.includes(id); }

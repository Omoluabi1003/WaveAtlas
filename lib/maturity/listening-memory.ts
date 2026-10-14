import type { Station } from '../stations';
export const LISTENING_MEMORY_KEY = 'waveatlas:listening-memory:v1';
export type ListeningMemory = { version: 1; recent: { id: string; playedAt: number }[]; favorites: string[]; preferences: { countries: Record<string, number>; languages: Record<string, number>; genres: Record<string, number> } };
export const emptyMemory = (): ListeningMemory => ({ version: 1, recent: [], favorites: [], preferences: { countries: {}, languages: {}, genres: {} } });
function ids(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 257))].slice(0, 100) : []; }
export function parseListeningMemory(raw: string | null, legacyFavorites: string | null = null): ListeningMemory {
  const memory = emptyMemory();
  try {
    const data = JSON.parse(raw || 'null');
    if (data?.version === 1) {
      memory.favorites = ids(data.favorites);
      memory.recent = (Array.isArray(data.recent) ? data.recent : []).filter((item: { id?: unknown; playedAt?: unknown }) => typeof item?.id === 'string' && item.id.length < 257 && typeof item.playedAt === 'number' && Number.isFinite(item.playedAt) && item.playedAt > 0).slice(0, 40);
      for (const key of ['countries','languages','genres'] as const) memory.preferences[key] = Object.fromEntries(Object.entries(data.preferences?.[key] || {}).filter(([name, value]) => name.length < 80 && Number.isFinite(value) && Number(value) > 0).slice(0, 50).map(([name, value]) => [name, Math.min(1000, Number(value))]));
    }
  } catch { /* Corrupt or unsupported storage falls back safely. */ }
  try { memory.favorites = ids([...memory.favorites, ...ids(JSON.parse(legacyFavorites || '[]'))]); } catch { /* Legacy storage is optional. */ }
  return memory;
}
export function rememberPlayed(memory: ListeningMemory, station: Station, now = Date.now()): ListeningMemory {
  const next = structuredClone(memory); const id = station.station_uuid || station.id;
  next.recent = [{ id, playedAt: now }, ...next.recent.filter(item => item.id !== id)].slice(0, 40);
  const add = (group: keyof ListeningMemory['preferences'], values: string[]) => {
    for (const value of values.filter(value => value && !/^unknown|global$/i.test(value)).slice(0, 4)) next.preferences[group][value] = Math.min(1000, (next.preferences[group][value] || 0) + 1);
    next.preferences[group] = Object.fromEntries(Object.entries(next.preferences[group]).sort((a,b) => b[1]-a[1]).slice(0, 50));
  };
  add('countries', [station.country_code]); add('languages', station.language.split(/[,;]/).map(s => s.trim())); add('genres', station.tags.slice(0, 3));
  return next;
}
export function readListeningMemory(): ListeningMemory {
  if (typeof window === 'undefined') return emptyMemory();
  try { return parseListeningMemory(localStorage.getItem(LISTENING_MEMORY_KEY), localStorage.getItem('waveatlas:favorites')); } catch { return emptyMemory(); }
}
export function writeListeningMemory(memory: ListeningMemory) {
  try { localStorage.setItem(LISTENING_MEMORY_KEY, JSON.stringify(memory)); localStorage.setItem('waveatlas:favorites', JSON.stringify(memory.favorites)); } catch { /* Private browsing remains functional. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('waveatlas:listening-memory'));
}

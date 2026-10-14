'use client';
import { useEffect, useState } from 'react';
import type { Station } from '@/lib/stations';
import { emptyMemory, readListeningMemory, writeListeningMemory, type ListeningMemory } from '@/lib/maturity/listening-memory';
export default function ListeningLibrary({ favorites = false, onSelect }: { favorites?: boolean; onSelect: (station: Station) => void }) {
  const [memory, setMemory] = useState<ListeningMemory>(emptyMemory);
  const [stations, setStations] = useState<Station[]>([]);
  const [unavailable, setUnavailable] = useState(0);
  useEffect(() => { const refresh = () => setMemory(readListeningMemory()); queueMicrotask(refresh); window.addEventListener('waveatlas:listening-memory', refresh); window.addEventListener('storage', refresh); return () => { window.removeEventListener('waveatlas:listening-memory', refresh); window.removeEventListener('storage', refresh); }; }, []);
  const key = (favorites ? memory.favorites : memory.recent.map(item => item.id)).join('\n');
  useEffect(() => {
    const controller = new AbortController(); const ids = key.split('\n').filter(Boolean).slice(0, 40);
    void Promise.all(ids.map(async id => { try { const response = await fetch(`/api/stations/by-uuid?uuid=${encodeURIComponent(id)}`, { signal: controller.signal }); return response.ok ? (await response.json()).station as Station : null; } catch { return null; } })).then(results => { if (controller.signal.aborted) return; setStations(results.filter((station): station is Station => Boolean(station))); setUnavailable(results.filter(item => !item).length); });
    return () => controller.abort();
  }, [key]);
  return <section className="space-y-3"><h2 className="text-lg font-semibold">{favorites ? 'Favorites' : 'Recently Played'}</h2><p className="text-xs text-ivory/60">Saved on this device. No account required.</p>{stations.map(station => <div key={station.station_uuid} className="flex items-center gap-2 rounded-xl border border-white/10 p-2"><button className="min-h-11 min-w-0 flex-1 text-left" onClick={() => onSelect(station)}><b className="block truncate text-sm">{station.name}</b><span className="text-xs text-ivory/60">{station.country}</span></button>{favorites ? <button className="min-h-11 px-3 text-xs text-ivory/70" aria-label={`Remove ${station.name} from favorites`} onClick={() => writeListeningMemory({ ...readListeningMemory(), favorites: memory.favorites.filter(id => id !== station.station_uuid && id !== station.id) })}>Remove</button> : null}</div>)}{!key ? <p className="text-sm text-ivory/60">{favorites ? 'Save a station to return to it here.' : 'Stations appear after successful playback.'}</p> : null}{unavailable ? <p className="text-xs text-ivory/60">{unavailable} saved signals are currently unavailable.</p> : null}{!favorites && key ? <button className="min-h-11 rounded-full border border-white/15 px-4 text-sm" onClick={() => writeListeningMemory({ ...readListeningMemory(), recent: [], preferences: emptyMemory().preferences })}>Clear listening history</button> : null}</section>;
}

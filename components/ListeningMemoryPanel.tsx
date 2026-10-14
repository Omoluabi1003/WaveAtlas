'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Station } from '@/lib/stations';
import { emptyListeningMemory, readListeningMemory, writeListeningMemory, toggleFavorite } from '@/lib/listening-memory';
export default function ListeningMemoryPanel({ stations }: { stations: Station[] }) {
  const [memory, setMemory] = useState(emptyListeningMemory);
  useEffect(() => { const refresh = () => setMemory(readListeningMemory()); queueMicrotask(refresh); window.addEventListener('waveatlas:memory-changed', refresh); window.addEventListener('storage', refresh); return () => { window.removeEventListener('waveatlas:memory-changed', refresh); window.removeEventListener('storage', refresh); }; }, []);
  const name = (id: string) => stations.find(station => station.station_uuid === id || station.id === id)?.name ?? 'Open saved station';
  return <details className="rounded-2xl border border-white/10 bg-white/[.03] p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-gold">Your listening memory</summary><p className="mb-3 text-xs text-ivory/60">Saved on this device. No account required.</p>
    <h3 className="text-sm font-semibold">Favorites</h3>{!memory.favorites.length && <p className="py-3 text-sm text-ivory/60">Save a destination to revisit it here.</p>}
    <ul>{memory.favorites.map(id => <li className="flex items-center justify-between gap-3" key={id}><Link className="min-w-0 break-words py-3 text-sm text-radio" href={`/station/${encodeURIComponent(id)}`}>{name(id)}</Link><button className="min-h-11 shrink-0 px-3 text-xs" onClick={() => toggleFavorite(id)} aria-label={`Remove ${name(id)} from favorites`}>Remove</button></li>)}</ul>
    <h3 className="mt-3 text-sm font-semibold">Recently played</h3><ul>{memory.history.slice(0,10).map(row => <li key={row.id}><Link className="inline-block min-h-11 py-3 text-sm text-radio" href={`/station/${encodeURIComponent(row.id)}`}>{name(row.id)}</Link></li>)}</ul>
    {memory.history.length > 0 && <button className="min-h-11 rounded-full border border-white/15 px-4 text-sm" onClick={() => writeListeningMemory({ ...memory, history: [], preferences: emptyListeningMemory().preferences })}>Clear listening history</button>}
  </details>;
}

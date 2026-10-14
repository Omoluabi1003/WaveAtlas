'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Station } from '@/lib/stations';
import { AUDIO_TOURISM_JOURNEYS, resolveTourismJourney } from '@/lib/audio-tourism-journeys';
export default function AudioTourismJourneys({ stations, current, status, onSelect }: { stations: Station[]; current: Station; status: string; onSelect: (station: Station) => void }) {
  const [shareStatus, setShareStatus] = useState('');
  const [id, setId] = useState<string | null>(null); const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => { queueMicrotask(() => setId(new URLSearchParams(location.search).get('tour'))); }, []);
  const journey = AUDIO_TOURISM_JOURNEYS.find(row => row.id === id);
  const stops = useMemo(() => journey ? resolveTourismJourney(journey, stations, new Set(failed)) : [], [journey, stations, failed]);
  const index = stops.findIndex(stop => stop.station.station_uuid === current.station_uuid);
  useEffect(() => {
    const onUnavailable = (event: Event) => { const id=(event as CustomEvent<{stationId:string}>).detail?.stationId; if (id) setFailed(rows => [...new Set([...rows,id])]); };
    window.addEventListener('waveatlas:station-unavailable',onUnavailable);
    return () => window.removeEventListener('waveatlas:station-unavailable',onUnavailable);
  }, []);

  async function shareJourney() {
    if (!journey) return;
    const url = `${location.origin}/journeys/${journey.id}`;
    try { if (navigator.share) await navigator.share({ title: `${journey.name} | WaveAtlas`, text: journey.description, url }); else { await navigator.clipboard.writeText(url); setShareStatus('Journey link copied.'); } } catch { setShareStatus('Share this journey with the journey link below.'); }
  }
  if (!journey) return <details className="rounded-2xl border border-white/10 p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-gold">Atlas Journeys</summary><p className="text-xs text-ivory/60">Travel through geography, voices, and local perspectives.</p><ul>{AUDIO_TOURISM_JOURNEYS.map(row => <li key={row.id}><Link className="block min-h-11 py-3 text-sm text-radio" href={`/journeys/${row.id}`}>{row.name}</Link></li>)}</ul></details>;
  return <section className="rounded-2xl border border-gold/20 bg-white/[.03] p-4"><h3 className="text-sm font-semibold text-gold">{journey.name}</h3><p className="mt-2 text-sm text-ivory/70">{index >= 0 ? stops[index].description : journey.description}</p><p role="status" className="mt-2 text-xs text-ivory/60">{status === 'failed' ? 'This destination is unavailable. Continue to another verified signal.' : index >= 0 ? `Destination ${index + 1} of ${stops.length}` : stops.length ? 'Select your next destination.' : 'No verified signals are available right now.'}</p><div className="mt-3 flex flex-wrap gap-2"><button className="min-h-11 rounded-full border border-white/15 px-4 text-sm disabled:opacity-40" disabled={index <= 0} onClick={() => onSelect(stops[index - 1].station)}>Previous Station</button><button className="min-h-11 rounded-full border border-white/15 px-4 text-sm disabled:opacity-40" disabled={!stops[index + 1]} onClick={() => onSelect(stops[index + 1].station)}>Next Station</button><button className="min-h-11 rounded-full border border-white/15 px-4 text-sm" onClick={shareJourney}>Share journey</button><Link className="min-h-11 px-3 py-3 text-xs text-radio" href={`/journeys/${journey.id}`}>Journey link</Link></div><p role="status" className="mt-2 text-xs text-radio">{shareStatus}</p></section>;
}

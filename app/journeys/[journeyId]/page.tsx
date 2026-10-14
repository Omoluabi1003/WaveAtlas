import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AUDIO_TOURISM_JOURNEYS, resolveTourismJourney } from '@/lib/audio-tourism-journeys';
import { fetchJourneyInventory } from '@/lib/journey-inventory';
import { stationPath } from '@/lib/station-deep-link';
export async function generateMetadata({ params }: { params: Promise<{ journeyId: string }> }) { const { journeyId } = await params; const journey = AUDIO_TOURISM_JOURNEYS.find(row => row.id === journeyId); return { title: `${journey?.name ?? 'Journey'} | WaveAtlas`, description: journey?.description }; }
export default async function JourneyPage({ params }: { params: Promise<{ journeyId: string }> }) {
 const { journeyId } = await params; const journey = AUDIO_TOURISM_JOURNEYS.find(row => row.id === journeyId);
 if (journey) { const resolved = resolveTourismJourney(journey, await fetchJourneyInventory(journey)); if (resolved[0]) redirect(`${stationPath(resolved[0].station)}?tour=${journey.id}`); }
 return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-center text-white"><div><h1 className="text-3xl">{journey?.name ?? 'Journey unavailable'}</h1><p className="mt-4">No recently verified destinations are available for this journey.</p><Link className="mt-4 inline-block min-h-11 px-4 py-3 text-radio" href="/">Explore WaveAtlas</Link></div></main>;
}

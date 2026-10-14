import { AUDIO_TOURISM_JOURNEYS } from '@/lib/audio-tourism-journeys';
import { fetchJourneyInventory } from '@/lib/journey-inventory';
import type { Metadata } from "next";
import Link from "next/link";
import WaveAtlasExperience from "@/components/WaveAtlasExperience";
import { stationSocialMetadata } from "@/lib/station-social-metadata";
import { fetchStationByUuid, fetchStations, getStationInventoryStats } from "@/lib/stations";

type Props = { params: Promise<{ stationId: string }>; searchParams?: Promise<{ tour?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stationId } = await params;
  const station = await fetchStationByUuid(stationId).catch(() => null);
  if (!station) return { title: "Station Not Found | WaveAtlas", robots: { index: false, follow: false } };
  return stationSocialMetadata(station);
}

export default async function StationPage({ params, searchParams }: Props) {
  const { stationId } = await params;
  const station = await fetchStationByUuid(stationId).catch(() => null);
  if (!station) return <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center text-white"><div><p className="text-sm font-bold uppercase tracking-[.25em] text-radio">Station Not Found</p><h1 className="mt-3 text-4xl font-bold">This signal is not in the Atlas.</h1><p className="mt-3 text-ivory/70">The shared station may be unavailable or the link may be incorrect.</p><Link href="/" className="mt-7 inline-block rounded-full bg-radio px-6 py-3 font-bold text-midnight">Back to WaveAtlas discovery</Link></div></main>;
  const [stations, inventoryStats] = await Promise.all([fetchStations({ limit: "32", allowFallback: "true" }), getStationInventoryStats()]);
  const query = searchParams ? await searchParams : {};
  const journey = AUDIO_TOURISM_JOURNEYS.find(row => row.id === query.tour);
  const journeyStations = journey ? await fetchJourneyInventory(journey) : [];
  const stationPool = [...new Map([station, ...journeyStations, ...stations].map(item => [item.station_uuid, item])).values()];
  return <WaveAtlasExperience stations={stationPool} inventoryStats={inventoryStats} initialStation={station} />;
}

import type { Metadata } from "next";
import Link from "next/link";
import WaveAtlasExperience from "@/components/WaveAtlasExperience";
import { WAVEATLAS_SHARE_IMAGE_URL } from "@/lib/branding";
import { stationPath } from "@/lib/station-deep-link";
import { fetchStationByUuid, fetchStations, getStationInventoryStats } from "@/lib/stations";

type Props = { params: Promise<{ stationId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stationId } = await params;
  const station = await fetchStationByUuid(stationId);
  if (!station) return { title: "Station Not Found | WaveAtlas", robots: { index: false, follow: false } };
  const canonical = stationPath(station);
  const city = station.city || station.state;
  const location = [city, station.country].filter(Boolean).join(", ");
  const title = `${station.name} | WaveAtlas`;
  const description = `Listen to ${station.name} from ${location} on WaveAtlas. Explore humanity through sound.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description: `Listen live from ${location} on WaveAtlas.`, type: "website", url: canonical, images: [WAVEATLAS_SHARE_IMAGE_URL] },
    twitter: { card: "summary_large_image", title, description, images: [WAVEATLAS_SHARE_IMAGE_URL] },
  };
}

export default async function StationPage({ params }: Props) {
  const { stationId } = await params;
  const station = await fetchStationByUuid(stationId);
  if (!station) return <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center text-white"><div><p className="text-sm font-bold uppercase tracking-[.25em] text-radio">Station Not Found</p><h1 className="mt-3 text-4xl font-bold">This signal is not in the Atlas.</h1><p className="mt-3 text-ivory/70">The shared station may be unavailable or the link may be incorrect.</p><Link href="/" className="mt-7 inline-block rounded-full bg-radio px-6 py-3 font-bold text-midnight">Back to WaveAtlas discovery</Link></div></main>;
  const [stations, inventoryStats] = await Promise.all([fetchStations({ limit: "32", allowFallback: "true" }), getStationInventoryStats()]);
  const stationPool = [station, ...stations.filter((candidate) => candidate.station_uuid !== station.station_uuid && candidate.id !== station.id)];
  return <WaveAtlasExperience stations={stationPool} inventoryStats={inventoryStats} initialStation={station} />;
}

import WaveAtlasExperience from '@/components/WaveAtlasExperience';
import { fetchStations, getStationInventoryStats } from '@/lib/stations';
import StationPage, { generateMetadata as stationMetadata } from './station/[stationId]/page';

type Props = { searchParams: Promise<{ station?: string }> };

export async function generateMetadata({ searchParams }: Props) {
  const { station } = await searchParams;
  return station ? stationMetadata({ params: Promise.resolve({ stationId: station }) }) : {};
}

export default async function Home({ searchParams }: Props) {
  const { station } = await searchParams;
  if (station) return StationPage({ params: Promise.resolve({ stationId: station }) });
  const [stations, inventoryStats] = await Promise.all([fetchStations({ limit: '32', allowFallback: 'true' }), getStationInventoryStats()]);
  return <WaveAtlasExperience stations={stations} inventoryStats={inventoryStats}/>;
}

import WaveAtlasApp from '@/components/WaveAtlasApp';
import { StationProfileStrip } from '@/components/station-profile-strip';
import { fetchStations, getStationInventoryStats } from '@/lib/stations';

export default async function Home(){ const [stations, inventoryStats] = await Promise.all([fetchStations({ limit:'32', allowFallback:'true' }), getStationInventoryStats()]); return <><WaveAtlasApp stations={stations} inventoryStats={inventoryStats}/><StationProfileStrip /></>; }

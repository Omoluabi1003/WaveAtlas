import WaveAtlasExperience from '@/components/WaveAtlasExperience';
import { fetchStations, getStationInventoryStats } from '@/lib/stations';
export default async function Home(){ const [stations, inventoryStats] = await Promise.all([fetchStations({ limit:'32', allowFallback:'true' }), getStationInventoryStats()]); return <WaveAtlasExperience stations={stations} inventoryStats={inventoryStats}/>; }

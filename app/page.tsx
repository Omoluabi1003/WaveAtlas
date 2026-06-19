import WaveAtlasApp from '@/components/WaveAtlasApp';
import { fetchStations } from '@/lib/stations';
export default async function Home(){ const stations = await fetchStations({ limit:'32', allowFallback:'true' }); return <WaveAtlasApp stations={stations}/>; }

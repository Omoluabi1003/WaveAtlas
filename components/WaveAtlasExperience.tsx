"use client";

import { useEffect, useState } from 'react';
import WaveAtlasApp from '@/components/WaveAtlasApp';
import { AtlasAssistant } from '@/components/AtlasAssistant';
import type { Station, StationInventoryStats } from '@/lib/stations';

type Props = { stations: Station[]; inventoryStats: StationInventoryStats };

export default function WaveAtlasExperience(props: Props) {
  const [station, setStation] = useState<Station | null>(null);

  useEffect(() => {
    const initial = props.stations[0] || null;
    setStation(initial);
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Station>).detail;
      if (detail?.name) setStation(detail);
    };
    window.addEventListener('waveatlas:station-context', handler);
    return () => window.removeEventListener('waveatlas:station-context', handler);
  }, [props.stations]);

  const search = (query: string) => {
    window.dispatchEvent(new CustomEvent('waveatlas:assistant-search', { detail: { query } }));
    window.dispatchEvent(new CustomEvent('waveatlas:open-mobile-search'));
  };

  return <><WaveAtlasApp {...props}/><AtlasAssistant station={station} onSearch={search}/></>;
}

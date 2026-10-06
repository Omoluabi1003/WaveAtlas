"use client";

import { useEffect, useState } from 'react';
import WaveAtlasApp from '@/components/WaveAtlasApp';
import { AtlasAssistant } from '@/components/AtlasAssistant';
import type { AtlasAssistantAction } from '@/lib/atlas-assistant';
import { stationPath } from '@/lib/station-deep-link';
import type { Station, StationInventoryStats } from '@/lib/stations';

type Props = { stations: Station[]; inventoryStats: StationInventoryStats };

function visibleButtonMatching(pattern: RegExp) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    if (button.disabled || button.offsetParent === null) return false;
    const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent].filter(Boolean).join(' ');
    return pattern.test(label);
  });
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function openSearchWithQuery(query: string) {
  window.dispatchEvent(new Event('waveatlas:open-mobile-search'));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, attempt ? 120 : 60));
    const input = Array.from(document.querySelectorAll<HTMLInputElement>('input')).find((candidate) => {
      const hint = `${candidate.placeholder} ${candidate.getAttribute('aria-label') || ''}`;
      return /search/i.test(hint) && candidate.offsetParent !== null;
    });
    if (input) {
      setReactInputValue(input, query);
      input.focus();
      return true;
    }
  }
  return false;
}

async function playFirstAtlasMatch(query: string) {
  const response = await fetch(`/api/stations/search?q=${encodeURIComponent(query)}&limit=12`);
  if (!response.ok) return false;
  const data = await response.json() as { stations?: Station[] };
  const match = data.stations?.find((candidate) => Boolean(candidate.station_uuid || candidate.id));
  if (!match) return false;
  window.history.pushState({ atlasAssistant: true }, '', stationPath(match));
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  return true;
}

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

  const search = (query: string) => { void openSearchWithQuery(query); };

  const executeAction = async (action: AtlasAssistantAction) => {
    if (action.type === 'search') return openSearchWithQuery(action.query);
    if (action.type === 'play') {
      if (action.query) return playFirstAtlasMatch(action.query);
      const media = document.querySelector<HTMLMediaElement>('audio');
      if (media) { await media.play(); return true; }
      return false;
    }
    if (action.type === 'pause') {
      const media = document.querySelector<HTMLMediaElement>('audio');
      if (media && !media.paused) { media.pause(); return true; }
      visibleButtonMatching(/^pause$/i)?.click();
      return true;
    }
    if (action.type === 'resume') {
      const media = document.querySelector<HTMLMediaElement>('audio');
      if (media) { await media.play(); return true; }
      visibleButtonMatching(/^play$/i)?.click();
      return true;
    }
    if (action.type === 'volume') {
      const media = document.querySelector<HTMLMediaElement>('audio');
      if (media) { media.muted = false; media.volume = Math.min(1, Math.max(0, action.value)); }
      return Boolean(media);
    }
    if (action.type === 'teleport') {
      if (action.query) return playFirstAtlasMatch(action.query);
      visibleButtonMatching(/teleport/i)?.click();
      return true;
    }
    if (action.type === 'wander') {
      visibleButtonMatching(/(?:start\s+continuous\s+)?wanderer|wander/i)?.click();
      return true;
    }
    if (action.type === 'open_settings') {
      visibleButtonMatching(/settings|controls/i)?.click();
      return true;
    }
    if (action.type === 'open_brief') {
      window.dispatchEvent(new Event('waveatlas:open-mobile-brief'));
      visibleButtonMatching(/brief|news/i)?.click();
      return true;
    }
    if (action.type === 'switch_view') {
      const pattern = action.view === 'map' ? /map(?:\s+view)?|2d/i : /globe|atlas(?:\s+view)?|earth/i;
      visibleButtonMatching(pattern)?.click();
      return true;
    }
    return false;
  };

  return <><WaveAtlasApp {...props}/><AtlasAssistant station={station} onSearch={search} onAction={executeAction}/></>;
}

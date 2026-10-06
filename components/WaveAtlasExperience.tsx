"use client";

import { useEffect, useState } from 'react';
import WaveAtlasApp from '@/components/WaveAtlasApp';
import { AtlasAssistant } from '@/components/AtlasAssistant';
import type { AtlasAssistantAction } from '@/lib/atlas-assistant';
import { stationPath } from '@/lib/station-deep-link';
import type { Station, StationInventoryStats } from '@/lib/stations';

type Props = { stations: Station[]; inventoryStats: StationInventoryStats };
type PlaybackContext = { current?: Station; status: string };

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

function sendPlaybackCommand(command: 'play' | 'pause' | 'volume', value?: number) {
  window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback', { detail: { command, ...(typeof value === 'number' ? { value } : {}) } }));
  return true;
}

export default function WaveAtlasExperience(props: Props) {
  const [station, setStation] = useState<Station | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState('idle');

  useEffect(() => {
    const stationHandler = (event: Event) => {
      const detail = (event as CustomEvent<Station | null>).detail;
      if (detail?.name) setStation(detail);
    };
    const playbackHandler = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackContext>).detail;
      if (detail?.status) setPlaybackStatus(detail.status);
      if (detail?.current?.name) setStation(detail.current);
    };
    window.addEventListener('waveatlas:station-context', stationHandler);
    window.addEventListener('waveatlas:playback-context', playbackHandler);
    const request = () => window.dispatchEvent(new Event('waveatlas:request-station-context'));
    request();
    const retry = window.setTimeout(request, 350);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener('waveatlas:station-context', stationHandler);
      window.removeEventListener('waveatlas:playback-context', playbackHandler);
    };
  }, []);

  const search = (query: string) => { void openSearchWithQuery(query); };

  const executeAction = async (action: AtlasAssistantAction) => {
    if (action.type === 'search') return openSearchWithQuery(action.query);
    if (action.type === 'play') return action.query ? playFirstAtlasMatch(action.query) : sendPlaybackCommand('play');
    if (action.type === 'pause') return sendPlaybackCommand('pause');
    if (action.type === 'resume') return sendPlaybackCommand('play');
    if (action.type === 'volume') return sendPlaybackCommand('volume', action.value);
    if (action.type === 'teleport') {
      if (action.query) return playFirstAtlasMatch(action.query);
      const button = visibleButtonMatching(/teleport/i);
      if (!button) return false;
      button.click(); return true;
    }
    if (action.type === 'wander') {
      const button = visibleButtonMatching(/(?:start\s+continuous\s+)?wanderer|wander/i);
      if (!button) return false;
      button.click(); return true;
    }
    if (action.type === 'open_settings') {
      const button = visibleButtonMatching(/settings|controls/i);
      if (!button) return false;
      button.click(); return true;
    }
    if (action.type === 'open_brief') {
      window.dispatchEvent(new Event('waveatlas:open-mobile-brief'));
      visibleButtonMatching(/brief|news/i)?.click();
      return true;
    }
    if (action.type === 'switch_view') {
      const pattern = action.view === 'map' ? /map(?:\s+view)?|2d/i : /globe|atlas(?:\s+view)?|earth/i;
      const button = visibleButtonMatching(pattern);
      if (!button) return false;
      button.click(); return true;
    }
    return false;
  };

  return <><WaveAtlasApp {...props}/><AtlasAssistant station={station} playbackStatus={playbackStatus} onSearch={search} onAction={executeAction}/></>;
}

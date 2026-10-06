"use client";

import { useEffect, useState } from 'react';
import WaveAtlasApp from '@/components/WaveAtlasApp';
import { AtlasAssistant } from '@/components/AtlasAssistant';
import type { AtlasActionResult, AtlasAssistantAction } from '@/lib/atlas-assistant';
import { rankStationsWithAIE } from '@/lib/atlas-intelligence-engine';
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

function queryRelevance(station: Station, query: string) {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
  const haystack = [station.name, station.country, station.country_code, station.state, station.city, station.language, ...(station.tags || [])].filter(Boolean).join(' ').toLowerCase();
  if (!tokens.length) return 50;
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return Math.min(100, 35 + (hits / tokens.length) * 65);
}

function stationIdentity(station?: Station | null) {
  return station?.station_uuid || station?.id || station?.name?.trim().toLowerCase() || '';
}

function stationPlace(station: Station) {
  return [station.city || station.state, station.country].filter(Boolean).join(', ');
}

function waitForPlayback(target: Station, timeoutMs = 3200): Promise<'playing' | 'failed' | 'connecting'> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: 'playing' | 'failed' | 'connecting') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('waveatlas:playback-context', handler);
      resolve(status);
    };
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackContext>).detail;
      if (!detail?.current || stationIdentity(detail.current) !== stationIdentity(target)) return;
      if (/playing|live/i.test(detail.status)) finish('playing');
      else if (/error|failed|offline|unavailable/i.test(detail.status)) finish('failed');
    };
    const timer = window.setTimeout(() => finish('connecting'), timeoutMs);
    window.addEventListener('waveatlas:playback-context', handler);
  });
}

async function playBestAtlasMatch(query: string, current: Station | null, playbackStatus: string, excludeCurrent = false): Promise<AtlasActionResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`/api/stations/search?q=${encodeURIComponent(query)}&limit=20`, { signal: controller.signal });
    if (!response.ok) return { ok: false, status: 'failed', message: 'I could not reach the station directory.' };
    const data = await response.json() as { stations?: Station[] };
    let candidates = (data.stations || []).filter((candidate) => Boolean(candidate.station_uuid || candidate.id));
    if (excludeCurrent && current) candidates = candidates.filter((candidate) => stationIdentity(candidate) !== stationIdentity(current));
    if (!candidates.length) return { ok: false, status: 'not_found', message: `I couldn't find a playable station matching ${query}.` };
    const ranked = rankStationsWithAIE(candidates, (candidate) => ({ kind: 'discovery', geographicRelevance: queryRelevance(candidate, query) }));
    const choices = ranked.slice(0, 3).map((entry) => entry.station);
    const first = choices[0];
    if (!first) return { ok: false, status: 'not_found', message: `I couldn't find a playable station matching ${query}.` };
    if (!excludeCurrent && current && stationIdentity(first) === stationIdentity(current) && /playing|live/i.test(playbackStatus)) {
      return { ok: true, status: 'already_playing', station: first, message: `You're already listening to ${first.name}.`, terminal: true };
    }

    for (let index = 0; index < choices.length; index += 1) {
      const match = choices[index];
      const playback = waitForPlayback(match, index < choices.length - 1 ? 2600 : 3200);
      window.history.pushState({ atlasAssistant: true }, '', stationPath(match));
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
      const outcome = await playback;
      const place = stationPlace(match);
      if (outcome === 'playing') return { ok: true, status: 'playing', station: match, message: `Playing ${match.name}${place ? `, ${place}` : ''}.`, terminal: true };
      if (outcome === 'connecting') return { ok: true, status: 'connecting', station: match, message: `Found ${match.name}${place ? `, ${place}` : ''}. Connecting.`, terminal: true };
      if (outcome === 'failed') {
        // A confirmed failure advances quietly to the next AIE-ranked candidate.
        continue;
      }
    }
    return { ok: false, status: 'failed', message: `I found stations for ${query}, but their streams did not respond. Want me to try something nearby?` };
  } catch {
    return { ok: false, status: 'failed', message: 'I lost the station search for a moment. Try that request again.' };
  } finally { window.clearTimeout(timeout); }
}

function completed(message?: string): AtlasActionResult { return { ok: true, status: 'completed', ...(message ? { message } : {}) }; }
function failed(message?: string): AtlasActionResult { return { ok: false, status: 'failed', ...(message ? { message } : {}) }; }
function sendPlaybackCommand(command: 'play' | 'pause' | 'volume', value?: number) {
  window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback', { detail: { command, ...(typeof value === 'number' ? { value } : {}) } }));
  return completed();
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

  const executeAction = async (action: AtlasAssistantAction): Promise<AtlasActionResult> => {
    if (action.type === 'search') {
      if (!await openSearchWithQuery(action.query)) return failed('I could not open search.');
      try {
        const response = await fetch(`/api/stations/search?q=${encodeURIComponent(action.query)}&limit=20`, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) return failed('Search is open, but I could not reach the station directory.');
        const data = await response.json() as { stations?: Station[] };
        const matches = data.stations || [];
        if (!matches.length) return { ok: false, status: 'not_found', message: `I couldn't find a station matching ${action.query}. Try a station name, city, or genre.` };
        return { ok: true, status: 'completed', message: `I found ${matches[0].name}${matches.length > 1 ? ' and other matches' : ''}. The results are open. Say play followed by the station name to listen.`, terminal: true };
      } catch { return failed('Search is open, but the directory took too long to respond. Please try again.'); }
    }
    if (action.type === 'play') return action.query ? playBestAtlasMatch(action.query, station, playbackStatus, action.excludeCurrent) : sendPlaybackCommand('play');
    if (action.type === 'pause') return sendPlaybackCommand('pause');
    if (action.type === 'resume') return sendPlaybackCommand('play');
    if (action.type === 'volume') return sendPlaybackCommand('volume', action.value);
    if (action.type === 'teleport') {
      if (action.query) return playBestAtlasMatch(action.query, station, playbackStatus);
      const button = visibleButtonMatching(/teleport/i);
      if (!button) return failed('I could not find the teleport control.');
      button.click(); return completed();
    }
    if (action.type === 'wander') {
      const button = visibleButtonMatching(/(?:start\s+continuous\s+)?wanderer|wander/i);
      if (!button) return failed('I could not start Wanderer.');
      button.click(); return completed();
    }
    if (action.type === 'open_settings') {
      const button = visibleButtonMatching(/settings|controls/i);
      if (!button) return failed('I could not open settings.');
      button.click(); return completed();
    }
    if (action.type === 'open_brief') {
      window.dispatchEvent(new Event('waveatlas:open-mobile-brief'));
      visibleButtonMatching(/brief|news/i)?.click();
      return completed();
    }
    if (action.type === 'switch_view') {
      const pattern = action.view === 'map' ? /map(?:\s+view)?|2d/i : /globe|atlas(?:\s+view)?|earth/i;
      const button = visibleButtonMatching(pattern);
      if (!button) return failed(`I could not switch to the ${action.view}.`);
      button.click(); return completed();
    }
    return failed();
  };

  return <><WaveAtlasApp {...props}/><AtlasAssistant station={station} playbackStatus={playbackStatus} onSearch={search} onAction={executeAction}/></>;
}

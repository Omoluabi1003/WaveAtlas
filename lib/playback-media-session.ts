import type { Station } from './stations';
import { WAVEATLAS_LOGO_URL } from './branding';

export type MediaPlayerSnapshot = { current?: Station; status: string };
type AtlasPlaybackCommand = { command?: 'play' | 'pause' | 'volume'; value?: number };

export function stationMediaMetadata(station: Station): MediaMetadataInit {
  const journey = station.sourceType === 'geoaudio' ? station.geoAudio : undefined;
  return {
    title: journey?.currentTrackTitle || station.name,
    artist: journey?.artist || [station.city || station.state, station.country].filter(Boolean).join(', ') || 'WaveAtlas',
    album: journey?.albumTitle || 'WaveAtlas Live Radio',
    artwork: [{ src: WAVEATLAS_LOGO_URL, sizes: '512x512', type: 'image/png' }],
  };
}

function publishAtlasContext(snapshot: MediaPlayerSnapshot) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('waveatlas:station-context', { detail: snapshot.current ?? null }));
  window.dispatchEvent(new CustomEvent('waveatlas:playback-context', { detail: snapshot }));
}

export function bindPlaybackMediaSession(options: {
  read: () => MediaPlayerSnapshot;
  subscribe: (refresh: () => void) => () => void;
  play: () => void;
  pause: () => void;
  session?: MediaSession;
  Metadata?: typeof MediaMetadata;
  document: Pick<Document, 'title' | 'addEventListener' | 'removeEventListener'>;
  audio: Pick<HTMLAudioElement, 'addEventListener' | 'removeEventListener' | 'volume' | 'muted'>;
}) {
  const { session, Metadata, document: doc, audio } = options;
  const originalTitle = doc.title;
  let closed = false;
  const refresh = () => {
    if (closed) return;
    const snapshot = options.read();
    const { current, status } = snapshot;
    const hasMedia = current && !['idle', 'failed', 'blocked'].includes(status);
    doc.title = hasMedia ? `${current.name} | WaveAtlas` : 'WaveAtlas | Explore Humanity Through Sound';
    publishAtlasContext(snapshot);
    if (!session) return;
    try { session.metadata = hasMedia && Metadata ? new Metadata(stationMediaMetadata(current)) : null; } catch { /* Optional OS integration cannot interrupt playback. */ }
    try { session.playbackState = hasMedia ? status === 'playing' ? 'playing' : 'paused' : 'none'; } catch { /* Partial browser support. */ }
    try { session.setPositionState?.(); } catch { /* Unsupported on some browsers. */ }
  };
  const actions: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
    ['play', () => options.play()], ['pause', () => options.pause()], ['stop', () => options.pause()],
    ['seekbackward', null], ['seekforward', null], ['seekto', null], ['previoustrack', null], ['nexttrack', null],
  ];
  for (const [action, handler] of actions) { try { session?.setActionHandler(action, handler); } catch { /* Unsupported action. */ } }

  const onAtlasContextRequest = () => publishAtlasContext(options.read());
  const onAtlasPlaybackCommand = (event: Event) => {
    const detail = (event as CustomEvent<AtlasPlaybackCommand>).detail;
    if (detail?.command === 'pause') options.pause();
    if (detail?.command === 'play') options.play();
    if (detail?.command === 'volume' && typeof detail.value === 'number') {
      const value = Math.min(1, Math.max(0, detail.value));
      audio.volume = value;
      audio.muted = value === 0;
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('waveatlas:request-station-context', onAtlasContextRequest);
    window.addEventListener('waveatlas:assistant-playback', onAtlasPlaybackCommand);
  }

  const unsubscribe = options.subscribe(refresh);
  for (const event of ['playing', 'loadedmetadata']) audio.addEventListener(event, refresh);
  doc.addEventListener('visibilitychange', refresh);
  refresh();
  return () => {
    closed = true;
    unsubscribe();
    for (const event of ['playing', 'loadedmetadata']) audio.removeEventListener(event, refresh);
    doc.removeEventListener('visibilitychange', refresh);
    if (typeof window !== 'undefined') {
      window.removeEventListener('waveatlas:request-station-context', onAtlasContextRequest);
      window.removeEventListener('waveatlas:assistant-playback', onAtlasPlaybackCommand);
    }
    for (const [action] of actions) { try { session?.setActionHandler(action, null); } catch { /* Unsupported action. */ } }
    try { if (session) { session.metadata = null; session.playbackState = 'none'; } } catch { /* Partial browser support. */ }
    doc.title = originalTitle;
  };
}

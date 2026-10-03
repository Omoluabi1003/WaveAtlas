import type { Station } from './stations';
import { WAVEATLAS_LOGO_URL } from './branding';

export type MediaPlayerSnapshot = { current?: Station; status: string };
export function stationMediaMetadata(station: Station): MediaMetadataInit {
  const journey = station.sourceType === 'geoaudio' ? station.geoAudio : undefined;
  return {
    title: journey?.currentTrackTitle || station.name,
    artist: journey?.artist || [station.city || station.state, station.country].filter(Boolean).join(', ') || 'WaveAtlas',
    album: journey?.albumTitle || 'WaveAtlas Live Radio',
    artwork: [{ src: WAVEATLAS_LOGO_URL, sizes: '512x512', type: 'image/png' }],
  };
}

export function bindPlaybackMediaSession(options: {
  read: () => MediaPlayerSnapshot;
  subscribe: (refresh: () => void) => () => void;
  play: () => void;
  pause: () => void;
  session?: MediaSession;
  Metadata?: typeof MediaMetadata;
  document: Pick<Document, 'title' | 'addEventListener' | 'removeEventListener'>;
  audio: Pick<HTMLAudioElement, 'addEventListener' | 'removeEventListener'>;
}) {
  const { session, Metadata, document: doc, audio } = options;
  const originalTitle = doc.title;
  let closed = false;
  const refresh = () => {
    if (closed) return;
    const { current, status } = options.read();
    const hasMedia = current && !['idle', 'failed', 'blocked'].includes(status);
    doc.title = hasMedia ? `${current.name} | WaveAtlas` : 'WaveAtlas | Explore Humanity Through Sound';
    if (!session) return;
    try { session.metadata = hasMedia && Metadata ? new Metadata(stationMediaMetadata(current)) : null; } catch { /* Optional OS integration cannot interrupt playback. */ }
    try { session.playbackState = hasMedia ? status === 'playing' ? 'playing' : 'paused' : 'none'; } catch { /* Partial browser support. */ }
    // Live radio has no finite seek position. Clear any previous track's timeline.
    try { session.setPositionState?.(); } catch { /* Unsupported on some browsers. */ }
  };
  const actions: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
    ['play', () => options.play()], ['pause', () => options.pause()], ['stop', () => options.pause()],
    ['seekbackward', null], ['seekforward', null], ['seekto', null], ['previoustrack', null], ['nexttrack', null],
  ];
  for (const [action, handler] of actions) { try { session?.setActionHandler(action, handler); } catch { /* Unsupported action. */ } }
  const unsubscribe = options.subscribe(refresh);
  for (const event of ['playing', 'loadedmetadata']) audio.addEventListener(event, refresh);
  doc.addEventListener('visibilitychange', refresh);
  refresh();
  return () => {
    closed = true;
    unsubscribe();
    for (const event of ['playing', 'loadedmetadata']) audio.removeEventListener(event, refresh);
    doc.removeEventListener('visibilitychange', refresh);
    for (const [action] of actions) { try { session?.setActionHandler(action, null); } catch { /* Unsupported action. */ } }
    try { if (session) { session.metadata = null; session.playbackState = 'none'; } } catch { /* Partial browser support. */ }
    doc.title = originalTitle;
  };
}

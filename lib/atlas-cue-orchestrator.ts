import type { ReciprocalAtlasSignal } from './atlas-reciprocal-intelligence';

export type AtlasCueAction = 'open_brief' | 'open_search' | 'none';

export type AtlasCue = {
  id: string;
  title: string;
  detail: string;
  action: AtlasCueAction;
  actionLabel?: string;
  priority: 'low' | 'medium' | 'high';
};

export function deriveAtlasCue(signal?: ReciprocalAtlasSignal | null): AtlasCue | null {
  if (!signal || signal.mode === 'ambient') return null;

  if (signal.mode === 'awareness') {
    return {
      id: 'awareness-brief',
      title: 'Local context is elevated',
      detail: 'Open the Daily Brief for destination news and trusted local context while playback continues.',
      action: 'open_brief',
      actionLabel: 'Open Daily Brief',
      priority: 'high',
    };
  }

  if (signal.mode === 'resilience') {
    return {
      id: 'resilience-search',
      title: 'Signal recovery is active',
      detail: 'Review available signals while WaveAtlas keeps reliability weighted more heavily.',
      action: 'open_search',
      actionLabel: 'Review signals',
      priority: 'high',
    };
  }

  if (signal.mode === 'discovery') {
    return {
      id: 'discovery-search',
      title: 'Local discovery is ready',
      detail: 'Explore nearby and geographically relevant signals without changing your current playback.',
      action: 'open_search',
      actionLabel: 'Explore signals',
      priority: 'medium',
    };
  }

  return {
    id: 'focused-brief',
    title: 'Your current destination is in focus',
    detail: 'Open the Daily Brief when you want more context around what you are hearing.',
    action: 'open_brief',
    actionLabel: 'Open Daily Brief',
    priority: 'low',
  };
}

export function executeAtlasCue(cue: AtlasCue) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('waveatlas:adaptive-cue', { detail: cue }));
  if (cue.action === 'open_brief') window.dispatchEvent(new Event('waveatlas:open-mobile-brief'));
  if (cue.action === 'open_search') window.dispatchEvent(new Event('waveatlas:open-mobile-search'));
}

import type { AtlasTravelProfile } from './atlas-travel-mode';

export type AtlasTravelPresentation = {
  profile: AtlasTravelProfile;
  label: string;
  followLabel: string;
  timeLabel: string;
  guideLabel: string;
  introVerb: string;
  simulatedLabel: string;
};

const PRESENTATION: Record<AtlasTravelProfile, AtlasTravelPresentation> = {
  flight: {
    profile: 'flight',
    label: 'Flight',
    followLabel: 'Follow aircraft',
    timeLabel: 'Flight time remaining',
    guideLabel: 'Atlas flight guide',
    introVerb: 'flying',
    simulatedLabel: 'Simulated flight',
  },
  drive: {
    profile: 'drive',
    label: 'Drive',
    followLabel: 'Follow route',
    timeLabel: 'Drive time remaining',
    guideLabel: 'Atlas road guide',
    introVerb: 'driving',
    simulatedLabel: 'Simulated drive',
  },
  bicycle: {
    profile: 'bicycle',
    label: 'Bicycle',
    followLabel: 'Follow ride',
    timeLabel: 'Ride time remaining',
    guideLabel: 'Atlas ride guide',
    introVerb: 'cycling',
    simulatedLabel: 'Simulated ride',
  },
  walk: {
    profile: 'walk',
    label: 'Walk',
    followLabel: 'Follow walk',
    timeLabel: 'Walk time remaining',
    guideLabel: 'Atlas walking guide',
    introVerb: 'walking',
    simulatedLabel: 'Simulated walk',
  },
};

export function atlasTravelPresentation(profile: AtlasTravelProfile) {
  return PRESENTATION[profile];
}

export function atlasTravelDurationLabel(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${String(remainder).padStart(2, '0')}m` : `${hours}h`;
}

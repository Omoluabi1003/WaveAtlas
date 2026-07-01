export const ChannelType = {
  LIVE_RADIO: 'LIVE_RADIO',
  GEOAUDIO: 'GEOAUDIO',
  PODCAST: 'PODCAST',
  AUDIOBOOK: 'AUDIOBOOK',
  GUIDED_TOUR: 'GUIDED_TOUR',
  LECTURE: 'LECTURE',
  EDITORIAL: 'EDITORIAL',
} as const;

export type ChannelType = typeof ChannelType[keyof typeof ChannelType];
export type ChannelProvider = { id: string; name: string; producer?: string; studio?: string; homepage?: string };
export type QueueItem = { id: string; title: string; url: string; duration?: string; index: number; playable: boolean };
export type Queue = { id: string; label: string; items: QueueItem[] };
export type ChannelCapabilities = { playable: boolean; sequentialPlayback: boolean; queueNavigation: boolean; searchable: boolean; discoverableByDefault: boolean; geographicAnchor: boolean; verifiedActive: boolean };
export type Channel = { id: string; type: ChannelType; title: string; provider: ChannelProvider; queue: Queue; capabilities: ChannelCapabilities; unavailableReason?: string };
export type DiscoveryResult = { channel: Channel; highlightedQueueItemId?: string; score: number };

export const liveRadioCapabilities: ChannelCapabilities = {
  playable: true,
  sequentialPlayback: false,
  queueNavigation: false,
  searchable: true,
  discoverableByDefault: true,
  geographicAnchor: true,
  verifiedActive: true,
};

export function geoAudioCapabilities(playable: boolean): ChannelCapabilities {
  return { playable, sequentialPlayback: true, queueNavigation: true, searchable: true, discoverableByDefault: false, geographicAnchor: true, verifiedActive: playable };
}

import { nigeriaGeoTruth } from './nigeriaGeoTruth';

export type FrcnStreamStatus = 'verified' | 'candidate' | 'pending';

export type FrcnNetworkRecord = {
  station: string;
  streamStatus: FrcnStreamStatus;
  streamUrl?: string;
  discoveryHints: string[];
  notes?: string;
};

// FRCN network identity is complete via nigeriaGeoTruth.
// Playback is deliberately separate: no outlet is marked verified until a direct
// audio endpoint passes WaveAtlas stream probing. Never fabricate a URL merely
// because an FRCN station is known to exist.
export const frcnNetwork: FrcnNetworkRecord[] = nigeriaGeoTruth.map((record) => ({
  station: record.station,
  streamStatus: 'pending',
  discoveryHints: [
    record.station,
    `${record.station} Radio Nigeria`,
    `${record.station} FRCN`,
    `${record.city} Radio Nigeria live stream`,
  ],
}));

// First independently discovered direct endpoint. It remains a candidate until
// probeStream validates audio transport at runtime; the endpoint is never treated
// as geographic evidence.
const kapital = frcnNetwork.find((record) => record.station === 'Kapital FM 92.9');
if (kapital) {
  kapital.streamStatus = 'candidate';
  kapital.streamUrl = 'https://cast4.asurahosting.com/proxy/radioni1/stream/;/';
  kapital.notes = 'Direct stream candidate discovered independently of FRCN geography; must pass WaveAtlas probe before playback admission.';
}

export function frcnPendingStreams() {
  return frcnNetwork.filter((record) => record.streamStatus !== 'verified');
}

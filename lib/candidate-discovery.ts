export type CandidateDiscoverySource = 'official_station_website' | 'tunein_metadata' | 'streema_metadata' | 'radio_garden_metadata' | 'online_radio_box_metadata' | 'mytuner_metadata';

export type DiscoveredSignalCandidate = {
  stationName: string;
  country?: string;
  city?: string;
  homepage?: string;
  streamCandidate?: string;
  source: CandidateDiscoverySource;
  status: 'candidate';
  autoPublish: false;
  discoveredAt: string;
  notes: string[];
};

const METADATA_ONLY_SOURCES: CandidateDiscoverySource[] = ['tunein_metadata', 'streema_metadata', 'radio_garden_metadata', 'online_radio_box_metadata', 'mytuner_metadata'];

export function createSignalCandidate(input: Omit<DiscoveredSignalCandidate, 'status' | 'autoPublish' | 'discoveredAt' | 'notes'> & { notes?: string[] }): DiscoveredSignalCandidate {
  const notes = [
    ...(input.notes ?? []),
    input.source === 'official_station_website' ? 'Official website discovery still requires stream verification.' : 'Metadata-only discovery source; never use as a runtime dependency.',
    'Pass to Signal Review Agent before promotion.',
  ];
  return { ...input, status: 'candidate', autoPublish: false, discoveredAt: new Date().toISOString(), notes };
}

export function isMetadataOnlySource(source: CandidateDiscoverySource) {
  return METADATA_ONLY_SOURCES.includes(source);
}

export function candidateNeedsOfficialWebsite(candidate: DiscoveredSignalCandidate) {
  return !candidate.homepage || isMetadataOnlySource(candidate.source);
}

export function hasCommittedJourney(locationLike: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const params = new URLSearchParams(locationLike.search);
  if (params.get('journey')) return true;
  const path = `${locationLike.pathname}${locationLike.hash}`.toLowerCase();
  return path.includes('/journey/');
}

export function shouldStartJourneyPlannerSession(args: {
  journeyDialogVisible: boolean;
  wasJourneyDialogVisible: boolean;
  committedJourney: boolean;
}) {
  return args.journeyDialogVisible && !args.wasJourneyDialogVisible && !args.committedJourney;
}

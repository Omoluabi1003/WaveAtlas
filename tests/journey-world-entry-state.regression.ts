import assert from 'node:assert/strict';
import { hasCommittedJourney, shouldStartJourneyPlannerSession } from '../lib/journey-world-entry-state';

const route = encodeURIComponent(JSON.stringify({ from: { label: 'JAX', lat: 30.49, lng: -81.69 }, to: { label: 'LHR', lat: 51.47, lng: -0.45 } }));

assert.equal(hasCommittedJourney({ pathname: '/', search: `?journey=${route}`, hash: '' } as Location), true);
assert.equal(hasCommittedJourney({ pathname: '/', search: '', hash: '' } as Location), false);
assert.equal(hasCommittedJourney({ pathname: '/journey/demo', search: '', hash: '' } as Location), true);

assert.equal(shouldStartJourneyPlannerSession({ journeyDialogVisible: true, wasJourneyDialogVisible: false, committedJourney: false }), true);
assert.equal(shouldStartJourneyPlannerSession({ journeyDialogVisible: true, wasJourneyDialogVisible: false, committedJourney: true }), false);
assert.equal(shouldStartJourneyPlannerSession({ journeyDialogVisible: true, wasJourneyDialogVisible: true, committedJourney: false }), false);

console.log('Journey world-entry regression checks passed.');

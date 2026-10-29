import assert from 'node:assert/strict';
import { shouldGuardColdStart } from '../hooks/useMapCameraController';

assert.equal(shouldGuardColdStart('/', {}), true, 'cold home startup must reject an arbitrary station center');
assert.equal(shouldGuardColdStart('/', { resumeLastStation: true }), false, 'explicit resume preference remains authoritative');
assert.equal(shouldGuardColdStart('/', { homeStationStartup: true, homeStationId: 'station-123' }), false, 'explicit home station remains authoritative');
assert.equal(shouldGuardColdStart('/station/station-123', {}), false, 'station deep links must preserve the selected station');
assert.equal(shouldGuardColdStart('/journeys', {}), false, 'non-home experiences own their camera context');

console.log('map cold-start location regression passed');

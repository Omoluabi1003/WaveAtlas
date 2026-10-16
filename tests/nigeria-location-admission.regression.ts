import assert from 'node:assert/strict';
import { hasAtlasLocation, locationAdmission, nigeriaLocationAudit } from '../lib/agents/station-location-policy';
import type { Station } from '../lib/stations';

const base: Station = {
  id:'test', station_uuid:'test', name:'Test FM', url:'https://example.com/live.mp3', country:'Nigeria', country_code:'NG', language:'English', tags:[], codec:'MP3', bitrate:128, votes:0, click_count:0, health_score:90, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:0,
};
const located: Station = { ...base, city:'Ibadan', state:'Oyo', latitude:7.3775, longitude:3.947 };
assert.equal(hasAtlasLocation(located), true);
assert.equal(locationAdmission(located).admitted, true);
assert.equal(locationAdmission(base).admitted, false);
assert.equal(locationAdmission(base, { city:'Ibadan', state:'Oyo', latitude:7.3775, longitude:3.947, source:'official station page', confidence:0.95, precision:'city' }).admitted, true);
assert.equal(locationAdmission(base, { city:'Ibadan', state:'Oyo', latitude:7.3775, longitude:3.947, source:'directory guess', confidence:0.5, precision:'city' }).admitted, false);
const audit = nigeriaLocationAudit([located, base]);
assert.equal(audit.total, 2);
assert.equal(audit.locationComplete, 1);
assert.equal(audit.pendingLocation, 1);
console.log('Nigeria location admission regression passed');

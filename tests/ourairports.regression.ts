import assert from 'node:assert/strict';
import { continentName } from '../lib/ourairports';

assert.equal(continentName('AF'), 'Africa');
assert.equal(continentName('AS'), 'Asia');
assert.equal(continentName('EU'), 'Europe');
assert.equal(continentName('NA'), 'North America');
assert.equal(continentName('OC'), 'Oceania');
assert.equal(continentName('SA'), 'South America');
assert.equal(continentName('AN'), 'Antarctica');
assert.equal(continentName('XX'), 'XX');

console.log('OurAirports continent hierarchy mapping passed');

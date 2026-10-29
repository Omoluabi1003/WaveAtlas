import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/stations/nearby/route';

test('Explore Nearby cannot silently degrade to a worldwide candidate pool', async () => {
  const request = new NextRequest('http://localhost/api/stations/nearby?global=true&limit=24');
  const response = await GET(request);
  const body = await response.json() as { code?: string; status?: string; candidates?: unknown[] };

  assert.equal(response.status, 422);
  assert.equal(body.code, 'LOCATION_REQUIRED');
  assert.equal(body.status, 'location_required');
  assert.deepEqual(body.candidates, []);
});

test('invalid coordinate-only nearby requests still fail validation', async () => {
  const request = new NextRequest('http://localhost/api/stations/nearby?lat=999&lng=999&zoom=10');
  const response = await GET(request);
  assert.equal(response.status, 400);
});

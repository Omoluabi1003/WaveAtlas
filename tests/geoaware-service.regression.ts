import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeoAwareServiceHandler } from '../lib/geoaware-service';
import { resolveGeoAwareQuery, type GeoAwareResolution } from '../lib/geoaware-core';
import { POST } from '../app/api/geoaware/execute/route';

const token = 'test-only-authentication-value';
const reference = {
  id: 'NG:city:lagos', kind: 'city' as const, label: 'Lagos', hierarchyLabel: 'Lagos, Nigeria',
  country: 'Nigeria', countryCode: 'NG', coordinates: { lat: 6.5244, lng: 3.3792 },
  radiusKm: 75, aliases: ['lagos nigeria', 'eko'], confidence: 96, source: 'curated-gazetteer' as const, warnings: [],
};
const resolution: GeoAwareResolution = { intent: 'geo', query: 'Lagos Nigeria', normalizedQuery: 'lagos nigeria', ambiguous: false, disambiguation: [], location: reference };
const body = { operation: 'resolve-place', input: { query: 'Lagos Nigeria' }, correlationId: 'correlation-1' };
function request(payload: unknown = body, options: RequestInit = {}) {
  return new Request('https://service.test/api/geoaware/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload), ...options,
  });
}
const handler = (resolve: (query: string) => Promise<GeoAwareResolution | null> = async () => resolution) => createGeoAwareServiceHandler({ token, resolve });

test('resolves through the supplied engine and preserves reference provenance without claiming verification', async () => {
  let query = '';
  const response = await createGeoAwareServiceHandler({ token, implementationRef: 'test-implementation-ref', resolve: async input => { query = input; return resolution; } })(request());
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = await response.json();
  assert.equal(query, 'Lagos Nigeria'); assert.equal(payload.ok, true); assert.equal(payload.source, 'GeoAware-Core');
  assert.equal(payload.correlationId, 'correlation-1');
  assert.deepEqual(payload.data.reference, reference);
  assert.equal(payload.data.reference.confidence, 96);
  assert.equal(payload.data.scope, 'place-resolution'); assert.equal(payload.data.verification, 'not-performed');
  assert.equal(payload.data.provenance.module, 'lib/geoaware-core.ts');
  assert.equal(payload.data.provenance.commit, 'test-implementation-ref');
  assert.equal(payload.data.confidence, undefined); assert.equal(payload.data.verified, undefined);
});

test('missing and invalid credentials fail before the resolver runs', async () => {
  let calls = 0;
  const resolve = async () => { calls++; return resolution; };
  const missing = await createGeoAwareServiceHandler({ resolve })(request());
  assert.equal(missing.status, 503);
  for (const authorization of ['', 'Bearer incorrect', `Basic ${token}`]) {
    const response = await createGeoAwareServiceHandler({ token, resolve })(request(body, { headers: { authorization, 'content-type': 'application/json' } }));
    assert.equal(response.status, 401); assert.ok(!(await response.text()).includes(token));
  }
  assert.equal(calls, 0);
});

test('read-only boundary rejects mutation and all external-verification operations', async () => {
  let calls = 0;
  const execute = handler(async () => { calls++; return resolution; });
  for (const operation of ['write', 'delete', 'inspect', 'verify-external-spatial-context', 'verify-external-location']) {
    const response = await execute(request({ ...body, operation }));
    const payload = await response.json();
    assert.equal(response.status, 422); assert.equal(payload.ok, false);
    assert.equal(payload.source, 'GeoAware-Core'); assert.equal(payload.correlationId, 'correlation-1');
    assert.equal(payload.data, undefined);
  }
  assert.equal(calls, 0);
});

test('validates JSON shape, queries, correlation IDs and content type', async () => {
  for (const payload of [null, [], {}, { ...body, input: [] }, { ...body, operation: 2 }, { ...body, correlationId: 42 }, { ...body, correlationId: 'x'.repeat(129) }, { ...body, input: { query: ' ' } }, { ...body, input: { query: 'x'.repeat(257) } }]) {
    assert.equal((await handler()(request(payload))).status, 400);
  }
  assert.equal((await handler()(request(body, { body: '{' }))).status, 400);
  assert.equal((await handler()(request(body, { body: undefined }))).status, 400);
  assert.equal((await handler()(request(body, { headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' } }))).status, 415);
  assert.equal((await handler()(request(body, { method: 'GET', body: undefined }))).status, 405);
});

test('bounds actual body bytes without trusting content-length', async () => {
  const response = await handler()(request({ ...body, padding: 'é'.repeat(9000) }, { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-length': '1' } }));
  assert.equal(response.status, 413); assert.equal((await response.json()).ok, false);
});

test('ambiguous and unresolved references never become successful verification', async () => {
  const ambiguous = await handler(async () => ({ ...resolution, ambiguous: true, location: undefined, disambiguation: [reference] }))(request());
  const payload = await ambiguous.json();
  assert.equal(payload.ok, false); assert.equal(payload.code, 'ambiguous_place');
  assert.deepEqual(payload.data.candidates, [reference]); assert.equal(payload.data.verification, 'not-performed');
  for (const result of [null, { ...resolution, location: undefined }]) {
    const response = await handler(async () => result)(request());
    assert.equal((await response.json()).code, 'place_not_found');
  }
});

test('resolver errors are generic and credential-bearing output is suppressed', async () => {
  const failed = await handler(async () => { throw new Error(token); })(request());
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes(token));
  const reflected = await handler(async () => ({ ...resolution, location: { ...reference, label: token } }))(request());
  assert.equal(reflected.status, 500); assert.ok(!(await reflected.text()).includes(token));
});

test('deadline bounds stalled resolution', async () => {
  const response = await createGeoAwareServiceHandler({ token, timeoutMs: 5, resolve: async () => new Promise(() => {}) })(request());
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'resolution_timeout');
});

test('deadline cancels stalled request-body reading', async () => {
  let canceled = false;
  const stream = new ReadableStream({ cancel() { canceled = true; } });
  const stalled = request(body, { body: stream, duplex: 'half' } as RequestInit);
  const response = await createGeoAwareServiceHandler({ token, timeoutMs: 5, resolve: async () => resolution })(stalled);
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'resolution_timeout'); assert.equal(canceled, true);
});

test('actual GeoAware resolver and Next route retain ambiguity and reference precision with mocked directory fetch', async () => {
  const originalFetch = globalThis.fetch;
  const previousToken = process.env.GEOAWARE_SERVICE_TOKEN;
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); calls.push(url);
    assert.ok(url.includes('/countries'), 'Only mocked country-directory lookup is expected');
    return new Response(JSON.stringify([{ name: 'Nigeria', iso_3166_1: 'NG', stationcount: 1 }, { name: 'France', iso_3166_1: 'FR', stationcount: 1 }]), { headers: { 'content-type': 'application/json' } });
  };
  process.env.GEOAWARE_SERVICE_TOKEN = token;
  try {
    const actual = await POST(request());
    assert.equal(actual.status, 200);
    const payload = await actual.json();
    assert.equal(payload.ok, true); assert.equal(payload.data.reference.source, 'curated-gazetteer');
    assert.deepEqual(payload.data.reference.coordinates, { lat: 6.5244, lng: 3.3792 });
    const ambiguous = await handler(resolveGeoAwareQuery)(request({ ...body, input: { query: 'Paris' } }));
    assert.equal((await ambiguous.json()).code, 'ambiguous_place');
    const country = await POST(request({ ...body, input: { query: 'Nigeria' } }));
    const countryPayload = await country.json();
    assert.equal(countryPayload.data.reference.kind, 'country'); assert.equal(countryPayload.data.reference.source, 'country-index');
    assert.equal(countryPayload.data.verification, 'not-performed');
    assert.ok(calls.length > 0);
    assert.ok(calls.every(url => url.includes('/countries')));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.GEOAWARE_SERVICE_TOKEN; else process.env.GEOAWARE_SERVICE_TOKEN = previousToken;
  }
});

test('retains an explicitly supplied empty correlation ID', async () => {
  const response = await handler()(request({ ...body, correlationId: '' }));
  const payload = await response.json();
  assert.equal(payload.correlationId, '');
});

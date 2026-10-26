import { timingSafeEqual } from 'node:crypto';
import type { GeoAwareResolution } from './geoaware-core';

type ServiceOptions = {
  token?: string;
  resolve: (query: string) => Promise<GeoAwareResolution | null>;
  timeoutMs?: number;
  implementationRef?: string;
};
const SOURCE = 'GeoAware-Core';
const MAX_BODY_BYTES = 16_384;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Host existing GeoAware resolution without promoting context into claim verification. */
export function createGeoAwareServiceHandler({ token, resolve, timeoutMs = 2000, implementationRef }: ServiceOptions) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 2000) throw new Error('Invalid GeoAware service deadline.');
  return async (request: Request): Promise<Response> => {
    let correlationId: string | undefined;
    const reply = (status: number, body: Record<string, unknown>) => {
      const payload = { ...body, source: SOURCE, ...(correlationId !== undefined ? { correlationId } : {}) };
      let serialized = JSON.stringify(payload);
      if (token && serialized.includes(token)) {
        status = 500;
        serialized = JSON.stringify({ ok: false, source: SOURCE, error: 'GeoAware response unavailable.', code: 'response_unavailable' });
      }
      return new Response(serialized, { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    };
    const failure = (status: number, code: string, error: string) => reply(status, { ok: false, code, error });
    if (request.method !== 'POST') return failure(405, 'method_not_allowed', 'Only POST is supported.');
    if (!token) return failure(503, 'service_not_configured', 'GeoAware service authentication is not configured.');
    const authorization = request.headers.get('authorization') ?? '';
    const expected = Buffer.from(`Bearer ${token}`);
    const supplied = Buffer.from(authorization);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return failure(401, 'unauthorized', 'GeoAware service authentication required.');
    if ((request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return failure(415, 'invalid_content_type', 'JSON content type required.');
    const reader = request.body?.getReader();
    if (!reader) return failure(400, 'invalid_request', 'A JSON request body is required.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finishedReading = false;
    try {
      return await Promise.race([
        (async () => {
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const next = await reader.read();
            if (next.done) { finishedReading = true; break; }
            size += next.value.byteLength;
            if (size > MAX_BODY_BYTES) return failure(413, 'request_too_large', 'GeoAware request exceeds its size limit.');
            chunks.push(next.value);
          }
          let body: unknown;
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { return failure(400, 'invalid_request', 'Invalid JSON request.'); }
          if (!record(body) || typeof body.operation !== 'string' || !record(body.input)
            || (body.correlationId !== undefined && (typeof body.correlationId !== 'string' || body.correlationId.length > 128))) {
            return failure(400, 'invalid_request', 'Expected operation, input and optional correlationId.');
          }
          correlationId = body.correlationId as string | undefined;
          if (body.operation.startsWith('verify-external-')) {
            return failure(422, 'verification_not_supported', 'Place resolution cannot verify external spatial claims.');
          }
          if (body.operation !== 'resolve-place') return failure(422, 'operation_not_supported', 'GeoAware operation is not supported.');
          if (typeof body.input.query !== 'string' || body.input.query.trim().length < 2 || body.input.query.length > 256) {
            return failure(400, 'invalid_query', 'A place query of 2 to 256 characters is required.');
          }
          const resolution = await resolve(body.input.query.trim());
          if (!resolution) return failure(200, 'place_not_found', 'No reference place was resolved.');
          if (resolution.ambiguous) return reply(200, { ok: false, code: 'ambiguous_place', error: 'Choose a more specific reference place.', data: { candidates: resolution.disambiguation, scope: 'place-resolution', verification: 'not-performed' } });
          if (!resolution.location) return failure(200, 'place_not_found', 'No reference place was resolved.');
          return reply(200, {
            ok: true,
            data: {
              scope: 'place-resolution', verification: 'not-performed',
              reference: resolution.location,
              provenance: { repository: 'Omoluabi1003/WaveAtlas', module: 'lib/geoaware-core.ts', resolver: 'resolveGeoAwareQuery', ...(implementationRef ? { commit: implementationRef } : {}) },
            },
          });
        })(),
        new Promise<Response>(resolveDeadline => {
          timer = setTimeout(() => resolveDeadline(failure(503, 'resolution_timeout', 'GeoAware resolution deadline exceeded.')), timeoutMs);
        }),
      ]);
    } catch {
      return failure(503, 'resolution_unavailable', 'GeoAware resolution is temporarily unavailable.');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (!finishedReading) void reader.cancel().catch(() => {});
    }
  };
}

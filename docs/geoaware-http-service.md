# GeoAware place-resolution HTTP service

## Scope and hosting

WaveAtlas already owns a working GeoAware place resolver in `lib/geoaware-core.ts`.
`POST /api/geoaware/execute` exposes that implementation through a read-only service
boundary. It does not copy spatial algorithms or reference data into OIC, change
existing product behavior, or enable OIC product feature flags. GeoAware-Core's
separate repository remains documentation-first.

This is an incremental service boundary hosted beside the existing implementation,
not a migration of the engine or an assertion that WaveAtlas is the authority for
all external spatial claims. A later shared deployment can retain this envelope
without changing the OIC GeoAware adapter. Such a migration needs separate review.

## Configuration and request contract

Set `GEOAWARE_SERVICE_TOKEN` through secure deployment settings. Missing configuration
returns HTTP 503 with `ok: false`; wrong or missing bearer authentication returns
HTTP 401. No secret values belong in source control, query parameters or logs.

The endpoint requires an authenticated POST with JSON content type. The body follows
the existing GeoAware request contract: operation, input and optional correlationId.
The supported operation is `resolve-place`; input contains a query string of 2–256
characters. correlationId, when supplied, must be a string of at most 128 characters
and is retained at the top level of the response.

Response envelopes contain `source: GeoAware-Core`. On success, `data.reference`
contains the resolver's existing GeoAwareLocation without fabricated confidence,
coordinates or timestamps. Confidence remains the resolver's original 0–100 score
inside reference data; it is not remapped into OIC's optional 0–1 confidence field.
The module path, repository and available Vercel Git commit are retained in
`data.provenance`. `data.scope` is place-resolution and `data.verification` is
not-performed. These qualifications are part of the service contract.

Ambiguity returns `ok: false`, code ambiguous_place and reference candidates. An
unresolved query returns `ok: false`, code place_not_found. Both use HTTP 200 because
the resolution operation completed without a single usable result. Unknown
operations return HTTP 422. No write or mutation operations are exposed.

## Verification is a separate capability

The resolver contains curated reference places, country centroids and geographic
fallbacks. It does not establish the location or truth of an arbitrary external
event. Country centroids remain country-level context; source labels, warnings,
ambiguity and confidence limitations must not be discarded.

All `verify-external-*` operations return HTTP 422 with `ok: false` and code
verification_not_supported. In particular, OIC currently requests
verify-external-spatial-context. Configuring this URL as GEOAWARE_URL will therefore
preserve degraded OIC behavior, not unlock verified WaveAtlas signals. Do not enable
WaveAtlas integration or claim live verified readiness on the basis of place
resolution alone. An evidence-backed spatial verifier and a live Agent Reach
HTTP gateway remain separate prerequisites.

## Resilience and security

The endpoint accepts at most 16 KiB of actual streamed request bytes without trusting
Content-Length. A two-second response deadline covers body reading and resolution;
a timed-out body reader is canceled. The existing resolver does not accept an
AbortSignal, so its own bounded directory lookup may finish after the response
has timed out. No retry is added here. Errors use fixed messages without upstream
bodies, request content, tokens or stack traces. Responses are marked no-store.

The existing resolver may read Radio Browser's country directory and fall back to
its existing reference data. Deployments must permit that read destination or expect
the resolver's documented fallback/timeout behavior. This service creates no write
path, calls no paid API and accepts no caller-controlled network destination.

## Validation

Run `npm ci`, `npm run test:geoaware-service`, `npm run test:oic`,
`npm run test:atlas-geotruth`, `npm run typecheck` and `npm run build`.
Service tests mock all directory fetches and cover the real resolver and Next route,
authentication, invalid and oversized requests, ambiguity, missing references,
unsupported verification, credential-safe errors and both deadline paths.

Before deployment, review this deliberately limited capability and configure its
service credential securely. Verify an authenticated place-resolution request and
an unsupported-verification request against the exact preview deployment. Deployment
readiness and place resolution do not demonstrate external intelligence readiness.

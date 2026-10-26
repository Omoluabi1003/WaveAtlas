import { resolveGeoAwareQuery } from '@/lib/geoaware-core';
import { createGeoAwareServiceHandler } from '@/lib/geoaware-service';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: Request): Promise<Response> {
  return createGeoAwareServiceHandler({ token: process.env.GEOAWARE_SERVICE_TOKEN, resolve: resolveGeoAwareQuery, implementationRef: process.env.VERCEL_GIT_COMMIT_SHA })(request);
}

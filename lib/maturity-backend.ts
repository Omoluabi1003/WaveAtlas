// Import only from server routes, pages, and scheduled agents.
import 'server-only';
import { timingSafeEqual, createHmac } from 'node:crypto';
export function backendConfigured() { return Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY); }
export async function maturityQuery<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!backendConfigured()) throw new Error('Backend unavailable');
  const response = await fetch(`${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers } });
  if (!response.ok) throw new Error('Backend query unavailable');
  return response.status === 204 ? undefined as T : response.json();
}
export function opsAuthorized(authorization: string | null) {
  const username = process.env.WAVEATLAS_OPS_USERNAME, password = process.env.WAVEATLAS_OPS_PASSWORD;
  if (!username || !password || !authorization?.startsWith('Basic ')) return false;
  const actual = Buffer.from(authorization.slice(6), 'base64'), expected = Buffer.from(`${username}:${password}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function anonymousReporter(address: string) {
  if (!process.env.WAVEATLAS_REPORT_SECRET) throw new Error('Report protection unavailable');
  return createHmac('sha256', process.env.WAVEATLAS_REPORT_SECRET).update(address).digest('hex');
}
export async function readBoundedJson(request: Request, limit = 2048): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) return null;
  let bytes = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > limit) { await reader.cancel(); return null; } chunks.push(chunk.value); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; } finally { reader.releaseLock(); }
}

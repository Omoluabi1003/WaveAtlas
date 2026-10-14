import { createHmac, timingSafeEqual } from 'node:crypto';
export function equalSecret(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
export function signValue(value: string, secret: string) { return createHmac('sha256', secret).update(value).digest('hex'); }
export function endpointToken(stationId: string, url: string, secret: string, expires = Date.now() + 3600_000) {
  const value = Buffer.from(JSON.stringify({ stationId, url, expires })).toString('base64url'); return `${value}.${signValue(value, secret)}`;
}
export function readEndpointToken(token: string, secret: string): { stationId: string; url: string } | null {
  try { const [value, signature] = token.split('.'); if (!equalSecret(signature || '', signValue(value, secret))) return null;
    const data = JSON.parse(Buffer.from(value, 'base64url').toString()); return data.expires > Date.now() && typeof data.stationId === 'string' && typeof data.url === 'string' ? data : null;
  } catch { return null; }
}
export function sameOrigin(request: Request) { const origin = request.headers.get('origin'); return !origin || origin === new URL(request.url).origin; }
export function reporterHash(request: Request) {
  const secret = process.env.COMMUNITY_REPORT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Report storage unavailable');
  const ip = (request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  return signValue(ip, secret);
}

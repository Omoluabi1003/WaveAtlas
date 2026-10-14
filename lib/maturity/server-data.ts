import 'server-only';
export function databaseConfigured() { return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY); }
export async function database<T = Record<string, unknown>[]>(table: string, query: Record<string, string> = {}, init: RequestInit = {}): Promise<T> {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Database not configured');
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?${new URLSearchParams(query)}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(6000), headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers } });
  if (!response.ok) throw new Error('Database request unavailable');
  return (response.status === 204 ? null : await response.json()) as T;
}

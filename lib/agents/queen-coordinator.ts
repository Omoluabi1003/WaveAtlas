export type Worker = 'stream-health' | 'station-discovery' | 'operations';
export type QueenMemory = { version: 1; runs: Array<{ at: string; worker: Worker; success: boolean }>; cooldowns: Record<string, string> };
export const emptyQueenMemory = (): QueenMemory => ({ version: 1, runs: [], cooldowns: {} });
export function planWorkers(selection: string, schedule?: string): Worker[] {
  if (schedule === '17 */8 * * *') return ['stream-health', 'station-discovery'];
  if (schedule === '43 */8 * * *') return ['stream-health'];
  if (schedule === '29 */8 * * *') return ['operations'];
  if (schedule) throw new Error('Unknown Queen schedule');
  const plans: Record<string, Worker[]> = { all: ['stream-health', 'station-discovery', 'operations'], both: ['stream-health', 'station-discovery'], 'stream-health': ['stream-health'], 'station-discovery': ['station-discovery'], operations: ['operations'] };
  if (!plans[selection]) throw new Error('Unknown Queen worker selection');
  return plans[selection];
}
export function readQueenMemory(value: unknown, now = Date.now()): QueenMemory {
  const memory = value as QueenMemory;
  if (!memory || memory.version !== 1 || !Array.isArray(memory.runs) || !memory.cooldowns || typeof memory.cooldowns !== 'object') throw new Error('Invalid Queen memory');
  return { version: 1, runs: memory.runs.filter(r => r && ['stream-health', 'station-discovery', 'operations'].includes(r.worker) && typeof r.success === 'boolean' && Number.isFinite(Date.parse(r.at))).slice(-90), cooldowns: Object.fromEntries(Object.entries(memory.cooldowns).filter(([url, until]) => /^https?:\/\//.test(url) && typeof until === 'string' && Date.parse(until) > now && Date.parse(until) <= now + 86400000).slice(-1000)) };
}

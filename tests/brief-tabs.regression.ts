import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the real component's hooks and handlers without a browser or a new dependency.
const require = createRequire(import.meta.url);
type Effect = { deps: unknown[]; run: () => void | (() => void); cleanup?: () => void };
const states: unknown[] = [], effects: Effect[] = [], pending: number[] = [], timers: Array<() => void> = [];
let stateCursor = 0, effectCursor = 0;
const hooks = {
  useState(initial: unknown) {
    const slot = stateCursor++;
    if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
    return [states[slot], (value: unknown) => { states[slot] = value; }];
  },
  useMemo: (fn: () => unknown) => fn(), useRef: () => ({ current: null }),
  useEffect(run: Effect['run'], deps: unknown[]) {
    const slot = effectCursor++, old = effects[slot];
    if (!old || deps.some((value, i) => value !== old.deps[i])) { effects[slot] = { run, deps, cleanup: old?.cleanup }; pending.push(slot); }
  },
};
const storage = new Map([['waveatlas_daily_cache_v2', JSON.stringify({ stale: 'Previous global Front Page must not be reused' })], ['waveatlas_daily_cache', JSON.stringify({ stale: 'Legacy category cache must not be reused' })]]);
const requests: Array<{ category: string; stationName: string; resolve: (response: Response) => void; reject: (error: Error) => void }> = [];
const modules: Record<string, unknown> = {
  react: hooks,
  'framer-motion': { AnimatePresence: 'presence', motion: { div: 'div', section: 'section' } },
  'lucide-react': { Newspaper: 'icon', Radio: 'icon', X: 'icon' },
  '@/components/NewspaperHeadline': { NewspaperHeadline: 'test-headline' },
  '@/lib/discovery/history': { stationGenre: () => 'Music' },
  '@/lib/smart-time-copy': { localTimeForStation: () => '12:00' },
  '@/lib/stations': { flagFor: () => 'NG' },
};
const componentModule = { exports: {} as Record<string, unknown> };
const code = ts.transpileModule(readFileSync(new URL('../components/NewspaperBrief.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
runInNewContext(code, {
  module: componentModule, exports: componentModule.exports, require: (name: string) => modules[name] ?? (name.startsWith('@/') ? {} : require(name)),
  Date, Intl, AbortController, DOMException, URLSearchParams,
  window: { setTimeout: (fn: () => void) => { timers.push(fn); }, addEventListener() {}, removeEventListener() {}, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) } },
  fetch: (url: string) => new Promise<Response>((resolve, reject) => { const query = new URL(url, 'https://example.com').searchParams; requests.push({ category: query.get('category')!, stationName: query.get('station_name')!, resolve, reject }); }),
});
const Component = componentModule.exports.NewspaperBrief as (props: Record<string, unknown>) => unknown;
let station = { id: 'premier', station_uuid: 'premier', name: 'Premier FM', city: 'Ibadan', country: 'Nigeria', country_code: 'NG', language: 'English' };
const onClose = () => {};
function render() { stateCursor = 0; effectCursor = 0; return Component({ station, open: true, onClose }); }
function flushEffects() { for (const slot of pending.splice(0)) { const e = effects[slot]; e.cleanup?.(); const cleanup = e.run(); e.cleanup = typeof cleanup === 'function' ? cleanup : undefined; } for (const timer of timers.splice(0)) timer(); }
type Node = { type?: unknown; props?: Record<string, unknown> };
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as Node; return [node, ...nodes(node.props?.children)];
}
function titles(tree: unknown) { return nodes(tree).filter((node) => node.type === 'test-headline').map((node) => (node.props!.headline as { title: string }).title); }
function click(tree: unknown, tab: string) { const button = nodes(tree).find((node) => node.props?.role === 'tab' && node.props.children === tab); assert(button); (button.props!.onClick as () => void)(); }
function respond(request: typeof requests[number], category: string, title: string) { request.resolve(new Response(JSON.stringify({ category, headlines: [{ title, source: 'Publisher', url: 'https://publisher.example/story' }] }))); }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

async function main() {
  let tree = render(); flushEffects(); respond(requests[0], 'front-page', 'Front Page fixture'); await settle(); tree = render();
  assert.deepEqual(titles(tree), ['Front Page fixture']);
  click(tree, 'Sports'); tree = render(); assert.deepEqual(titles(tree), []); flushEffects();
  const sports = requests.at(-1)!;
  click(tree, 'Culture'); tree = render(); assert.deepEqual(titles(tree), []); flushEffects();
  const culture = requests.at(-1)!;
  respond(sports, 'sports', 'Late Sports fixture'); await settle(); tree = render(); assert.deepEqual(titles(tree), []);
  respond(culture, 'culture', 'Culture fixture'); await settle(); tree = render(); assert.deepEqual(titles(tree), ['Culture fixture']);
  click(tree, 'Radio Signal'); tree = render(); assert.deepEqual(titles(tree), []); flushEffects();
  requests.at(-1)!.reject(new Error('Network unavailable')); await settle(); tree = render(); assert.deepEqual(titles(tree), []);
  click(tree, 'Sports'); tree = render(); flushEffects(); respond(requests.at(-1)!, 'front-page', 'Wrong Category fixture'); await settle(); tree = render(); assert.deepEqual(titles(tree), []);
  click(tree, 'Radio Signal'); tree = render(); flushEffects(); respond(requests.at(-1)!, 'radio-signal', 'Premier radio fixture'); await settle(); tree = render(); assert.deepEqual(titles(tree), ['Premier radio fixture']);
  station = { ...station, id: 'other', station_uuid: 'other', name: 'Other FM' }; tree = render(); assert.deepEqual(titles(tree), []); flushEffects();
  assert.equal(requests.at(-1)!.stationName, 'Other FM');
  assert(storage.has('waveatlas_daily_cache_v3'));
  console.log('Brief tabs: immediate stale-content clearing, rapid-switch races, provider failures, wrong-category rejection, cache versioning, and station isolation passed');
}
main().catch((error) => { console.error(error); process.exit(1); });

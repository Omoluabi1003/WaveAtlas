"use client";
import { useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Layers, X } from "lucide-react";
import { usePublicSignals, visiblePublicSignals } from "@/hooks/usePublicSignals";
import { SIGNAL_LAYERS, signalDistanceKm, type PublicSignal, type SignalLayer } from "@/lib/public-signals";

const subscribeClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export default function PublicSignalPanel({ mobile = false, anchor, onLocate }: { mobile?: boolean; anchor?: { lat: number; lng: number } | null; onLocate: (point: PublicSignal) => void }) {
  const client = useSyncExternalStore(subscribeClient, clientSnapshot, serverSnapshot);
  const state = usePublicSignals();
  const points = useMemo(() => visiblePublicSignals(state), [state]);
  const contacts = useMemo(() => [...points].sort((a, b) => anchor ? signalDistanceKm(anchor, a) - signalDistanceKm(anchor, b) : b.observedAt.localeCompare(a.observedAt)).slice(0, 30), [points, anchor]);
  const selected = state.selected && points.find(p => p.id === state.selected?.id);
  const expanded = state.panelOpen || Boolean(selected);
  const close = state.closePanel;
  if (!client) return null;
  return createPortal(<div className={`pointer-events-auto fixed z-[90] ${mobile ? "right-3 top-[calc(env(safe-area-inset-top)+124px)] md:hidden" : "right-6 top-6 hidden md:block"}`} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    <button type="button" aria-expanded={expanded} aria-controls={`public-signals-${mobile ? "mobile" : "desktop"}`} onClick={() => expanded ? close() : state.openPanel()} className="flex min-h-12 items-center gap-3 rounded-2xl border border-sky-200/50 bg-sky-950 px-4 py-2 text-left text-sm font-semibold text-white shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200"><Layers className="size-5 text-sky-200" /><span><span className="block">World signals{Object.values(state.enabled).filter(Boolean).length ? ` · ${points.length}` : ""}</span><span className="block text-[10px] font-medium text-sky-200">Earthquakes · Events · ISS</span></span></button>
    {expanded ? <section id={`public-signals-${mobile ? "mobile" : "desktop"}`} aria-label="World signal layers" className="mt-2 w-[min(340px,calc(100vw-24px))] max-h-[min(calc(100dvh-300px),560px)] overflow-y-auto overscroll-contain rounded-2xl border border-sky-200/20 bg-slate-950/95 p-4 text-sm text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between"><h2 className="font-semibold">World signals</h2><button type="button" onClick={close} aria-label="Close world signals" className="grid size-11 place-items-center"><X className="size-4" /></button></div>
      <p className="mb-3 text-xs leading-5 text-slate-300">Select a layer below to show earthquakes, natural events or the space station. Tap a marker for details.</p>
      {(Object.keys(SIGNAL_LAYERS) as SignalLayer[]).map(layer => {
        const config = SIGNAL_LAYERS[layer], info = state.layers[layer];
        return <div key={layer} className="mb-3 rounded-xl border border-white/10 p-3">
          <label className="flex min-h-8 cursor-pointer items-center gap-3 font-medium"><input type="checkbox" checked={state.enabled[layer]} onChange={() => state.toggle(layer)} className="size-4 accent-sky-300" /><span style={{ color: config.color }}>{config.label}</span></label>
          <p className="mt-1 text-xs leading-5 text-slate-300">{config.description}</p>
          <p className="mt-1 text-xs text-slate-400" role="status">{!state.enabled[layer] ? "Off" : info.status === "loading" ? "Updating…" : info.status === "unavailable" ? "Source unavailable. Retrying automatically." : info.status === "ready" ? `${points.filter(p => p.layer === layer).length} plotted · checked ${new Date(info.snapshot!.fetchedAt).toLocaleTimeString()}` : "Preparing…"}</p>
          <a href={config.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-sky-200 underline">{config.source}</a>
        </div>;
      })}
      {selected ? <article className="mb-3 rounded-xl border border-sky-200/30 p-3">
        <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{selected.title}</h3><button type="button" aria-label="Clear selected signal" onClick={() => state.select(null)} className="shrink-0 p-2"><X className="size-4" /></button></div>
        <p className="mt-2 text-xs text-slate-300">{selected.detail}</p>
        <p className="mt-1 text-xs text-slate-400">Observation: {new Date(selected.observedAt).toLocaleString()}</p>
        <p className="mt-1 text-xs text-slate-400">{selected.lat.toFixed(3)}°, {selected.lng.toFixed(3)}°</p>
        <div className="mt-2 flex gap-4"><button type="button" onClick={() => onLocate(selected)} className="min-h-10 text-xs text-sky-200 underline">Locate</button><a href={selected.url} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center text-xs text-sky-200 underline">Source details</a></div>
      </article> : null}
      {contacts.length ? <><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">{anchor ? "Closest to your station" : "Recent reports"} · {Math.min(30, points.length)} of {points.length}</h3>{contacts.map(p => <button type="button" key={p.id} onClick={() => { state.select(p); onLocate(p); }} className="mb-1 block min-h-11 w-full rounded-lg p-2 text-left text-xs hover:bg-white/10"><span className="block" style={{ color: SIGNAL_LAYERS[p.layer].color }}>{p.title}</span><span className="text-slate-400">{anchor ? `${Math.round(signalDistanceKm(anchor, p)).toLocaleString()} km · ` : ""}{SIGNAL_LAYERS[p.layer].source}</span></button>)}</> : Object.values(state.enabled).some(Boolean) ? <p className="text-xs text-slate-400">No reports to plot. Check the layer status above.</p> : null}
      <p className="mt-3 text-[11px] leading-4 text-slate-400">Up to 200 recent points per report layer. Coverage varies by source. These reports are not an emergency warning service.</p>
    </section> : null}
  </div>, document.body);
}

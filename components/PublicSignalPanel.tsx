"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Activity, Flame, Layers, Satellite, X } from "lucide-react";
import { usePublicSignals, visiblePublicSignals } from "@/hooks/usePublicSignals";
import { SIGNAL_LAYERS, signalDistanceKm, type PublicSignal, type SignalLayer } from "@/lib/public-signals";

const subscribeClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const layerIcons = { earthquakes: Activity, events: Flame, iss: Satellite };

export default function PublicSignalPanel({ mobile = false, showMobileLauncher = false, anchor, onLocate }: {
  mobile?: boolean;
  showMobileLauncher?: boolean;
  anchor?: { lat: number; lng: number } | null;
  onLocate: (point: PublicSignal) => void;
}) {
  const client = useSyncExternalStore(subscribeClient, clientSnapshot, serverSnapshot);
  const state = usePublicSignals();
  const panelRef = useRef<HTMLElement>(null);
  const points = useMemo(() => visiblePublicSignals(state), [state]);
  const contacts = useMemo(() => [...points].sort((a, b) => anchor ? signalDistanceKm(anchor, a) - signalDistanceKm(anchor, b) : b.observedAt.localeCompare(a.observedAt)).slice(0, 30), [points, anchor]);
  const selected = state.selected && points.find(p => p.id === state.selected?.id);
  const expanded = state.panelOpen || Boolean(selected);
  const close = state.closePanel;

  useEffect(() => {
    if (!client || !expanded || window.matchMedia("(max-width: 767px)").matches !== mobile) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (mobile) {
      document.body.style.overflow = "hidden";
      panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (!mobile || event.key !== "Tab") return;
      const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]") ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (mobile) {
        document.body.style.overflow = previousOverflow;
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      }
    };
  }, [client, expanded, mobile, close]);

  const locate = (point: PublicSignal) => {
    if (mobile) close();
    onLocate(point);
  };
  if (!client) return null;

  return createPortal(
    <div className={mobile ? "pointer-events-none fixed inset-0 z-[95] md:hidden" : "pointer-events-auto fixed right-6 top-6 z-[90] hidden md:block"} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {(!mobile || showMobileLauncher) ? (
        <button type="button" aria-expanded={expanded} aria-controls={`public-signals-${mobile ? "mobile" : "desktop"}`} onClick={() => expanded ? close() : state.openPanel()}
          className={mobile ? "pointer-events-auto fixed right-4 top-[calc(env(safe-area-inset-top)+12px)] flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-slate-950/70 px-4 text-xs font-semibold text-ivory shadow-lg backdrop-blur-xl" : "flex min-h-12 items-center gap-3 rounded-2xl border border-sky-200/50 bg-sky-950 px-4 py-2 text-left text-sm font-semibold text-white shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200"}>
          <Layers className={mobile ? "size-4 text-radio" : "size-5 text-sky-200"} />
          <span><span className="block">World signals{Object.values(state.enabled).filter(Boolean).length ? ` · ${points.length}` : ""}</span>{!mobile ? <span className="block text-[10px] font-medium text-sky-200">Earthquakes · Events · ISS</span> : null}</span>
        </button>
      ) : null}
      {expanded ? <>
        {mobile ? <button type="button" aria-label="Dismiss World signals" onClick={close} className="pointer-events-auto absolute inset-0 bg-black/55 backdrop-blur-sm" /> : null}
        <section ref={panelRef} id={`public-signals-${mobile ? "mobile" : "desktop"}`} role={mobile ? "dialog" : undefined} aria-modal={mobile ? true : undefined} aria-label="World signal layers"
          className={mobile ? "pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col overflow-hidden rounded-t-[2rem] border-t border-white/15 bg-[#08111D] text-sm text-white shadow-[0_-16px_64px_rgba(0,0,0,.45)]" : "mt-2 flex max-h-[min(calc(100dvh-180px),560px)] w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-sky-200/20 bg-slate-950/95 text-sm text-white shadow-2xl backdrop-blur-xl"}>
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div><h2 className="text-base font-semibold tracking-tight">World signals</h2><p className="mt-0.5 text-xs text-ivory/60">Explore Earth and space</p></div>
            <button type="button" onClick={close} aria-label="Close World signals" className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-ivory/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-radio"><X className="size-4" /></button>
          </header>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
            <p className="mb-4 text-xs leading-5 text-ivory/65">Choose the signals to display on your atlas.</p>
            {selected ? <article className="mb-4 rounded-2xl border border-radio/25 bg-radio/5 p-4">
              <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{selected.title}</h3><button type="button" aria-label="Clear selected signal" onClick={() => state.select(null)} className="shrink-0 p-2"><X className="size-4" /></button></div>
              <p className="mt-2 text-xs text-ivory/70">{selected.detail}</p>
              <p className="mt-1 text-xs text-ivory/55">Observation: {new Date(selected.observedAt).toLocaleString()}</p>
              <p className="mt-1 text-xs text-ivory/55">{selected.lat.toFixed(3)}°, {selected.lng.toFixed(3)}°</p>
              <div className="mt-3 flex items-center gap-4"><button type="button" onClick={() => locate(selected)} className="min-h-11 rounded-full bg-radio px-4 text-xs font-semibold text-midnight">Locate on atlas</button><a href={selected.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-xs text-ivory/80 underline">Source details</a></div>
            </article> : null}
            <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
              {(Object.keys(SIGNAL_LAYERS) as SignalLayer[]).map(layer => {
                const config = SIGNAL_LAYERS[layer], info = state.layers[layer], Icon = layerIcons[layer];
                return <div key={layer} className="border-b border-white/10 p-4 last:border-b-0">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/5" style={{ color: config.color }}><Icon className="size-4" /></span>
                    <span className="flex-1 font-medium">{config.label}</span>
                    <span className="relative shrink-0"><input type="checkbox" checked={state.enabled[layer]} onChange={() => state.toggle(layer)} aria-label={config.label} className="peer sr-only" /><span aria-hidden="true" className="block h-6 w-11 rounded-full border border-white/20 bg-white/10 transition-colors peer-checked:border-radio peer-checked:bg-radio peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-radio" /><span aria-hidden="true" className="pointer-events-none absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5 peer-checked:bg-midnight motion-reduce:transition-none" /></span>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-ivory/65">{config.description}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"><a href={config.url} target="_blank" rel="noopener noreferrer" className="text-ivory/65 underline underline-offset-2">{config.source}</a><span className="text-ivory/50" role="status">{!state.enabled[layer] ? "Off" : info.status === "loading" ? "Updating…" : info.status === "unavailable" ? "Unavailable · auto retry" : info.status === "ready" ? `${points.filter(p => p.layer === layer).length} plotted · ${new Date(info.snapshot!.fetchedAt).toLocaleTimeString()}` : "Preparing…"}</span></div>
                </div>;
              })}
            </div>
            {contacts.length ? <><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ivory/60">{anchor ? "Closest to your station" : "Recent reports"} · {Math.min(30, points.length)} of {points.length}</h3>{contacts.map(p => <button type="button" key={p.id} onClick={() => { state.select(p); if (!mobile) onLocate(p); panelRef.current?.querySelector("article")?.scrollIntoView({ block: "nearest" }); }} className="mb-1 block min-h-11 w-full rounded-xl p-3 text-left text-xs hover:bg-white/5"><span className="block" style={{ color: SIGNAL_LAYERS[p.layer].color }}>{p.title}</span><span className="mt-1 block text-ivory/50">{anchor ? `${Math.round(signalDistanceKm(anchor, p)).toLocaleString()} km · ` : ""}{SIGNAL_LAYERS[p.layer].source}</span></button>)}</> : Object.values(state.enabled).some(Boolean) ? <p className="text-xs text-ivory/55">No reports to plot. Check the layer status above.</p> : null}
            <p className="mt-4 text-[11px] leading-4 text-ivory/45">Up to 200 recent points per report layer. Coverage varies by source. These reports are not an emergency warning service.</p>
          </div>
        </section>
      </> : null}
    </div>, document.body,
  );
}

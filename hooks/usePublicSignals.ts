"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { SIGNAL_LAYERS, type PublicSignal, type SignalLayer, type SignalSnapshot } from "@/lib/public-signals";

type LayerState = { status: "idle" | "loading" | "ready" | "unavailable"; snapshot?: SignalSnapshot };
type State = {
  enabled: Record<SignalLayer, boolean>; layers: Record<SignalLayer, LayerState>; selected: PublicSignal | null;
  toggle: (layer: SignalLayer) => void; select: (point: PublicSignal | null) => void;
};
export const usePublicSignals = create<State>((set) => ({
  enabled: { earthquakes: false, events: false, iss: false },
  layers: { earthquakes: { status: "idle" }, events: { status: "idle" }, iss: { status: "idle" } }, selected: null,
  toggle: layer => set(state => ({ enabled: { ...state.enabled, [layer]: !state.enabled[layer] }, selected: state.selected?.layer === layer ? null : state.selected })),
  select: selected => set({ selected }),
}));
const pending = new Map<SignalLayer, Promise<void>>();
const attemptedAt = new Map<SignalLayer, number>();
async function refresh(layer: SignalLayer) {
  if (pending.has(layer)) return pending.get(layer);
  const store = usePublicSignals.getState();
  if (!store.enabled[layer] || Date.now() - (attemptedAt.get(layer) ?? 0) < SIGNAL_LAYERS[layer].refreshMs) return;
  attemptedAt.set(layer, Date.now());
  usePublicSignals.setState(s => ({ layers: { ...s.layers, [layer]: { ...s.layers[layer], status: "loading" } } }));
  const promise = (async () => {
    try {
      const response = await fetch(`/api/public-signals?layer=${layer}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Unavailable");
      const snapshot = await response.json() as SignalSnapshot;
      usePublicSignals.setState(s => ({ layers: { ...s.layers, [layer]: { status: "ready", snapshot } }, selected: s.selected?.layer === layer ? snapshot.points.find(p => p.id === s.selected?.id) ?? null : s.selected }));
    } catch {
      usePublicSignals.setState(s => ({ layers: { ...s.layers, [layer]: { ...s.layers[layer], status: "unavailable" } } }));
    } finally { pending.delete(layer); }
  })();
  pending.set(layer, promise);
  return promise;
}
export function visiblePublicSignals(state: Pick<State, "enabled" | "layers">, now = Date.now()) {
  return (Object.keys(SIGNAL_LAYERS) as SignalLayer[]).flatMap(layer => {
    const info = state.layers[layer];
    if (!state.enabled[layer] || info.status === "unavailable" || !info.snapshot || now - Date.parse(info.snapshot.fetchedAt) > SIGNAL_LAYERS[layer].refreshMs * 3) return [];
    // An old orbital position must never be presented as a current location.
    return info.snapshot.points.filter(p => layer !== "iss" || now - Date.parse(p.observedAt) < 120_000);
  });
}
export function usePublicSignalPolling() {
  const enabled = usePublicSignals(s => s.enabled);
  useEffect(() => {
    if (!Object.values(enabled).some(Boolean)) return;
    const update = () => { if (document.visibilityState === "hidden") return; for (const layer of Object.keys(SIGNAL_LAYERS) as SignalLayer[]) if (enabled[layer]) void refresh(layer); };
    update();
    const timer = window.setInterval(update, 15_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [enabled]);
}

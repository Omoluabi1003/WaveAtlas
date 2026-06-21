"use client";
export function AudioEarthLayerToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) { return <button type="button" onClick={() => onChange(!enabled)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-ivory/70">Audio Earth {enabled ? "on" : "off"} · NASA GIBS ready</button>; }

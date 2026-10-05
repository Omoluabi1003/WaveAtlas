"use client";
import { requestAppearanceLocation, useAppearance } from "@/hooks/useSolarAppearance";
import type { AppearanceMode } from "@/lib/solar-appearance";
export default function AppearanceControls() {
  const {mode,resolved,source,setMode,locationMessage} = useAppearance();
  return <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-3" aria-label="Day and night appearance">
    <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-radio/80">Appearance</p>
    <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Appearance mode">
      {(["auto","day","night"] as AppearanceMode[]).map((value)=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)} className={`rounded-2xl px-3 py-3 text-sm font-semibold capitalize transition ${mode===value?"bg-radio text-midnight":"bg-white/[0.05] text-ivory/75 hover:bg-white/10"}`}>{value[0].toUpperCase()+value.slice(1)}</button>)}
    </div>
    <p className="mt-2 px-1 text-[11px] leading-5 text-ivory/65">{mode==="auto"?`Auto · ${resolved} · ${source==="location"?"local daylight":"device appearance"}`:`${mode==="day"?"Day":"Night"} appearance selected.`} Auto keeps the globe’s natural sunlight. Night adds cinematic city lights to the satellite globe.</p>
    {mode==="auto"&&source!=="location"?<button type="button" onClick={requestAppearanceLocation} className="mt-2 rounded-full border border-radio/25 px-3 py-2 text-xs font-semibold text-radio">Use local sunrise and sunset</button>:null}
    {locationMessage?<p className="mt-2 text-xs text-ivory/65" role="status">{locationMessage}</p>:null}
  </section>;
}

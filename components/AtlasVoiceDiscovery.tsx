"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Mic, X } from 'lucide-react';
import { readBrowserStorage, writeBrowserStorage } from '@/lib/browser-storage';

export type AtlasDiscoveryStatus = 'preparing' | 'ready' | 'unavailable' | 'listening' | 'understanding' | 'speaking';
const Discovery = createContext({ status: 'preparing' as AtlasDiscoveryStatus, setStatus: (_status: AtlasDiscoveryStatus) => {} });
const USED_KEY = 'waveatlas:atlas-voice-used';
let sessionUsed = false;
function subscribeUsage(callback: () => void) {
  const understood = () => { sessionUsed = true; writeBrowserStorage('local', USED_KEY, 'true'); callback(); };
  window.addEventListener('waveatlas:atlas-used', understood);
  window.addEventListener('storage', callback);
  return () => { window.removeEventListener('waveatlas:atlas-used', understood); window.removeEventListener('storage', callback); };
}
const usageSnapshot = () => sessionUsed || readBrowserStorage('local', USED_KEY) === 'true';
const examples = ['Take me to Lagos.', 'Find gospel in Ghana.', "What's nearby?", 'Surprise me.'];
const capabilities = {
  Explore: ['Take me to Lagos.', 'Find stations around Kinshasa.', 'Take me somewhere unexpected.'],
  Listen: ['Play Premier FM.', 'Find gospel in Ghana.', 'Find something like this.'],
  Understand: ['What am I listening to?', 'Where is this station?', 'What language is this?'],
  Control: ['Pause.', 'Resume.', 'Volume down.', 'Show the globe.'],
};

export function AtlasVoiceDiscoveryProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AtlasDiscoveryStatus>('preparing');
  return <Discovery.Provider value={{ status, setStatus }}>{children}</Discovery.Provider>;
}
export const useAtlasVoiceDiscovery = () => useContext(Discovery);

export function AtlasVoiceSurface({ stationName }: { stationName?: string }) {
  const { status } = useAtlasVoiceDiscovery();
  const used = useSyncExternalStore(subscribeUsage, usageSnapshot, () => false);
  const [example, setExample] = useState(0);
  const [preview, setPreview] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setExample(value => (value + 1) % examples.length); }, 18000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!preview) return;
    const previous = document.activeElement;
    sheet.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(false);
      if (event.key !== 'Tab') return;
      const buttons = Array.from(sheet.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('keydown', keys); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [preview]);
  const talk = () => { setPreview(false); window.dispatchEvent(new Event('waveatlas:open-atlas-voice')); };
  const label = { preparing: 'ATLAS VOICE · PREPARING', ready: 'ATLAS VOICE · READY', unavailable: 'ATLAS · TEXT AVAILABLE', listening: 'LISTENING', understanding: 'UNDERSTANDING', speaking: 'ATLAS SPEAKING' }[status];
  const active = ['listening', 'understanding', 'speaking'].includes(status);
  return <section className="atlas-voice-surface" aria-label="Atlas voice guide" data-geometry-region="atlas" data-atlas-active={active}>
    <button type="button" className="atlas-launcher-button atlas-talk-button" onClick={event => { event.stopPropagation(); talk(); }} aria-label="Talk to Atlas" title="Talk to Atlas"><span className="atlas-voice-orb" aria-hidden="true"><span /></span></button>
    <div className="atlas-launcher-popover">
      <strong>Talk to Atlas</strong>
      <p className="atlas-voice-readiness" role="status">{label}</p>
      <button ref={trigger} type="button" className="atlas-capabilities-button" onClick={event => { event.stopPropagation(); setPreview(true); }} aria-label="See what Atlas can do">Atlas help</button>
    </div>
    {preview && createPortal(<div className="atlas-capabilities-layer" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) setPreview(false); }}>
      <section ref={sheet} className="atlas-capabilities-sheet" role="dialog" aria-modal="true" aria-label="What Atlas can do">
        <header><h2>See what Atlas can do</h2><button type="button" onClick={() => setPreview(false)} aria-label="Close Atlas capabilities"><X size={20} /></button></header>
        {!used && <div className="atlas-voice-invitation"><h3>Meet Atlas</h3><p>Your voice guide to the world&apos;s live radio.</p><p>Try saying: &ldquo;Atlas, take me somewhere.&rdquo;</p></div>}
        <p className="atlas-voice-example">{stationName ? [`Ask Atlas about ${stationName}`, 'Ask Atlas to find something similar', "Ask Atlas what's nearby", 'Ask Atlas to take you somewhere else'][example] : `Try: “${examples[example]}”`}</p>
        {status === 'unavailable' && <p className="atlas-voice-recovery">Use text, or allow microphone access in your browser and try again.</p>}
        <div className="atlas-capabilities-scroll">{Object.entries(capabilities).map(([category, commands]) => <section key={category}><h3>{category}</h3><ul>{commands.map(command => <li key={command}>{command}</li>)}</ul></section>)}</div>
        <button type="button" className="atlas-talk-button" onClick={event => { event.stopPropagation(); talk(); }}><Mic size={18} />Talk to Atlas</button>
      </section>
    </div>, document.body)}
  </section>;
}

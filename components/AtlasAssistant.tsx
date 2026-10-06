"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { AtlasAssistantAction } from '@/lib/atlas-assistant';
import type { Station } from '@/lib/stations';
import { getSpeechRecognitionConstructor, type BrowserSpeechRecognition } from '@/lib/voice-command-engine';

type Props = {
  station: Station | null;
  playbackStatus?: string;
  onSearch?: (query: string) => void;
  onAction?: (action: AtlasAssistantAction) => boolean | Promise<boolean>;
};
type Line = { role: 'user' | 'atlas'; text: string };
type NeuralVoiceState = 'idle' | 'loading' | 'ready' | 'unavailable';
type NeuralMessage = { type?: 'ready' | 'unavailable' | 'audio' | 'error'; id?: string; buffer?: ArrayBuffer; mime?: string; engine?: string; message?: string };
type PendingNeural = { resolve: (message: NeuralMessage) => void; reject: (error: Error) => void; timer: number };
type AudioSessionKind = 'auto' | 'playback' | 'play-and-record' | 'ambient';
type AudioSessionLike = { type: AudioSessionKind; state?: string };

const NATURAL_VOICE_HINTS = /siri|premium|enhanced|natural|samantha|ava|allison|serena|daniel|karen|moira|rishi|eddy|reed|flo|sandy|shelley/i;
const SYNTHETIC_VOICE_HINTS = /compact|espeak|festival|robot/i;
const QUICK_COMMANDS = ['Surprise me', 'Play jazz', 'Open the map', 'What am I listening to?'];

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function isIOSFamily() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function audioSession() { return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession; }
function setAudioSession(type: AudioSessionKind) { try { const session = audioSession(); if (session) session.type = type; } catch { /* Experimental API. */ } }

function bestSystemVoice(language: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const voices = [...window.speechSynthesis.getVoices()];
  const target = language.toLowerCase();
  const base = target.split('-')[0];
  const score = (voice: SpeechSynthesisVoice) => {
    const lang = voice.lang.toLowerCase();
    let value = lang === target ? 80 : lang.startsWith(`${base}-`) || lang === base ? 55 : 0;
    if (NATURAL_VOICE_HINTS.test(voice.name)) value += 70;
    if (voice.localService) value += 8;
    if (SYNTHETIC_VOICE_HINTS.test(voice.name)) value -= 80;
    return value;
  };
  if (isIOSFamily()) {
    return voices.find((voice) => /samantha|ava/i.test(voice.name) && voice.lang.toLowerCase().startsWith(base))
      ?? voices.filter((voice) => voice.lang.toLowerCase().startsWith(base)).sort((a, b) => score(b) - score(a))[0]
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en'))
      ?? voices[0];
  }
  return voices.sort((a, b) => score(b) - score(a))[0];
}

export function AtlasAssistant({ station, playbackStatus = 'idle', onSearch, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [question, setQuestion] = useState('');
  const [lines, setLines] = useState<Line[]>([{ role: 'atlas', text: 'I’m Atlas. Talk to me about this signal, or tell me where you want to go.' }]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceMessage, setVoiceMessage] = useState('Tap the orb and speak');
  const [neuralState, setNeuralState] = useState<NeuralVoiceState>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionWatchdogRef = useRef<number | null>(null);
  const openRef = useRef(false);
  const conversationModeRef = useRef(false);
  const busyRef = useRef(false);
  const voiceEnabledRef = useRef(true);
  const neuralStateRef = useRef<NeuralVoiceState>('idle');
  const neuralWorkerRef = useRef<Worker | null>(null);
  const neuralPendingRef = useRef(new Map<string, PendingNeural>());
  const voiceContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const radioDuckedRef = useRef(false);
  const systemSpeechPrimedRef = useRef(false);

  useEffect(() => { openRef.current = open; if (open && textMode) setTimeout(() => inputRef.current?.focus(), 80); }, [open, textMode]);
  useEffect(() => { conversationModeRef.current = conversationMode; }, [conversationMode]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { neuralStateRef.current = neuralState; }, [neuralState]);
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.getVoices();
    const load = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, []);
  useEffect(() => () => {
    recognitionRef.current?.abort();
    if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    try { voiceSourceRef.current?.stop(); } catch { /* Already stopped. */ }
    void voiceContextRef.current?.close();
    neuralWorkerRef.current?.terminate();
    neuralPendingRef.current.forEach(({ reject, timer }) => { window.clearTimeout(timer); reject(new Error('Atlas voice closed')); });
    neuralPendingRef.current.clear();
    restoreRadio();
  }, []);

  function sendPlayback(command: 'play' | 'pause' | 'volume' | 'duck' | 'restore', value?: number) {
    window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback', { detail: { command, ...(typeof value === 'number' ? { value } : {}) } }));
  }
  function duckRadio() {
    if (radioDuckedRef.current) return;
    radioDuckedRef.current = true;
    sendPlayback('duck', playbackStatus === 'playing' ? 0.012 : 0.02);
  }
  function restoreRadio() {
    if (!radioDuckedRef.current) return;
    radioDuckedRef.current = false;
    sendPlayback('restore');
  }
  function stopRecognitionWatchdog() {
    if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current);
    recognitionWatchdogRef.current = null;
  }
  function getVoiceContext() {
    if (typeof window === 'undefined') return null;
    if (voiceContextRef.current && voiceContextRef.current.state !== 'closed') return voiceContextRef.current;
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    voiceContextRef.current = new Context({ latencyHint: 'interactive' });
    return voiceContextRef.current;
  }
  async function resumeVoiceContext() {
    const context = getVoiceContext();
    if (!context) return null;
    if (context.state === 'suspended' || String(context.state) === 'interrupted') {
      try { await context.resume(); } catch { return null; }
    }
    return context;
  }
  async function primeVoiceOutput() {
    const context = await resumeVoiceContext();
    if (!context) return false;
    try {
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      source.connect(context.destination); source.start(0); return true;
    } catch { return false; }
  }
  function primeSystemSpeech() {
    if (systemSpeechPrimedRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      synth.speak(unlock);
      systemSpeechPrimedRef.current = true;
    } catch { systemSpeechPrimedRef.current = false; }
  }
  function stopVoiceOutput() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    try { voiceSourceRef.current?.stop(); } catch { /* Already stopped. */ }
    voiceSourceRef.current = null; setSpeaking(false);
  }
  async function prepareAudiblePlayback() {
    const session = audioSession();
    if (session) {
      try { session.type = 'ambient'; await sleep(0); session.type = 'playback'; } catch { /* Keep normal output path. */ }
    }
    return resumeVoiceContext();
  }
  async function playVoiceBuffer(buffer: ArrayBuffer) {
    const context = await prepareAudiblePlayback();
    if (!context) return false;
    try {
      const decoded = await context.decodeAudioData(buffer.slice(0));
      const source = context.createBufferSource();
      const compressor = context.createDynamicsCompressor();
      const gain = context.createGain();
      gain.gain.value = 1.28; compressor.threshold.value = -10; compressor.knee.value = 16; compressor.ratio.value = 3;
      source.buffer = decoded; source.connect(compressor); compressor.connect(gain); gain.connect(context.destination);
      voiceSourceRef.current = source; setSpeaking(true); setVoiceMessage('Atlas is speaking');
      return await new Promise<boolean>((resolve) => {
        source.onended = () => { if (voiceSourceRef.current === source) voiceSourceRef.current = null; resolve(true); };
        try { source.start(0); } catch { resolve(false); }
      });
    } catch { return false; }
  }

  function warmNeuralVoice() {
    if (typeof window === 'undefined' || isIOSFamily()) {
      setNeuralState('unavailable'); neuralStateRef.current = 'unavailable';
      return;
    }
    if (!('Worker' in window) || neuralStateRef.current !== 'idle') return;
    setNeuralState('loading'); neuralStateRef.current = 'loading';
    try {
      const worker = new Worker('/atlas-neural-voice-worker.mjs', { type: 'module' });
      neuralWorkerRef.current = worker;
      worker.onmessage = (event: MessageEvent<NeuralMessage>) => {
        const message = event.data;
        if (message.type === 'ready') { setNeuralState('ready'); neuralStateRef.current = 'ready'; return; }
        if (message.type === 'unavailable') { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; return; }
        if (!message.id) return;
        const pending = neuralPendingRef.current.get(message.id);
        if (!pending) return;
        window.clearTimeout(pending.timer); neuralPendingRef.current.delete(message.id);
        if (message.type === 'audio') pending.resolve(message); else pending.reject(new Error(message.message || 'Neural voice unavailable'));
      };
      worker.onerror = () => { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; };
      worker.postMessage({ type: 'warm' });
    } catch { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; }
  }
  async function waitForNeuralVoice() {
    const initial = neuralStateRef.current as NeuralVoiceState;
    if (initial === 'ready') return true;
    if (initial !== 'loading') return false;
    const started = Date.now();
    setVoiceMessage('Preparing Atlas voice…');
    while (Date.now() - started < 5000) {
      await sleep(200);
      const current = neuralStateRef.current as NeuralVoiceState;
      if (current === 'ready') return true;
      if (current === 'unavailable') return false;
    }
    return false;
  }
  async function speakNeural(text: string) {
    const worker = neuralWorkerRef.current;
    if (!worker || neuralStateRef.current !== 'ready') return false;
    const id = `atlas-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      setVoiceMessage('Forming response…');
      const message = await new Promise<NeuralMessage>((resolve, reject) => {
        const timer = window.setTimeout(() => { neuralPendingRef.current.delete(id); reject(new Error('Neural voice timeout')); }, 20000);
        neuralPendingRef.current.set(id, { resolve, reject, timer }); worker.postMessage({ type: 'speak', id, text });
      });
      if (!message.buffer) return false;
      return playVoiceBuffer(message.buffer);
    } catch { return false; }
  }
  function speakSystem(text: string) {
    return new Promise<boolean>((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) { resolve(false); return; }
      void prepareAudiblePlayback();
      const synth = window.speechSynthesis;
      synth.cancel(); synth.resume();
      const utterance = new SpeechSynthesisUtterance(text);
      const language = navigator.language || 'en-US';
      const voice = bestSystemVoice(language);
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = language;
      utterance.rate = 0.97; utterance.pitch = 1; utterance.volume = 1;
      let settled = false; let started = false;
      const finish = (ok: boolean) => { if (settled) return; settled = true; resolve(ok); };
      const guard = window.setTimeout(() => { if (!started) { synth.cancel(); finish(false); } }, 3000);
      utterance.onstart = () => { started = true; window.clearTimeout(guard); setSpeaking(true); setVoiceMessage('Atlas is speaking'); };
      utterance.onend = () => { window.clearTimeout(guard); setSpeaking(false); finish(true); };
      utterance.onerror = () => { window.clearTimeout(guard); setSpeaking(false); finish(false); };
      synth.speak(utterance);
    });
  }
  async function speak(text: string) {
    if (!voiceEnabledRef.current) { restoreRadio(); return; }
    recognitionRef.current?.abort(); recognitionRef.current = null; stopRecognitionWatchdog(); setListening(false); duckRadio();
    let spoken = false;
    if (isIOSFamily()) {
      spoken = await speakSystem(text);
    } else {
      if (await waitForNeuralVoice()) spoken = await speakNeural(text);
      if (!spoken) spoken = await speakSystem(text);
    }
    setSpeaking(false);
    if (!spoken) setVoiceMessage('Voice output is blocked. Tap the orb once, then try again.');
    if (conversationModeRef.current && openRef.current && spoken) {
      setVoiceMessage('Your turn'); setAudioSession('play-and-record');
      window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, isIOSFamily() ? 650 : 350);
    } else {
      if (spoken) setVoiceMessage('Tap the orb and speak');
      setAudioSession('playback'); restoreRadio();
    }
  }
  function endConversation(message = 'Tap the orb and speak') {
    conversationModeRef.current = false; setConversationMode(false);
    recognitionRef.current?.abort(); recognitionRef.current = null; stopRecognitionWatchdog(); stopVoiceOutput();
    setListening(false); setVoiceMessage(message); setAudioSession('playback'); restoreRadio();
  }

  async function ask(text: string) {
    const value = text.trim(); if (!value || busyRef.current) return;
    setLines((old) => [...old, { role: 'user', text: value }]); setQuestion(''); setBusy(true); busyRef.current = true;
    try {
      const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value, context: { station } }) });
      const data = await response.json() as { answer?: string; action?: AtlasAssistantAction };
      let answer = data.answer || 'I could not answer that from the Atlas yet.';
      if (data.action) {
        try { const handled = await onAction?.(data.action); if (handled === false) answer = `${answer} I could not complete that action.`; }
        catch { answer = `${answer} I could not complete that action.`; }
      } else if ((data as { action?: { type?: string; query?: string } }).action?.type === 'search') {
        const query = (data as { action?: { query?: string } }).action?.query; if (query) onSearch?.(query);
      }
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (voiceEnabledRef.current) void speak(answer); else restoreRadio();
    } catch {
      const answer = 'I lost the signal for a moment. Try that again.';
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (voiceEnabledRef.current) void speak(answer); else restoreRadio();
    } finally { setBusy(false); busyRef.current = false; }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }

  async function listen(fromConversation = false) {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!fromConversation) { conversationModeRef.current = true; setConversationMode(true); }
    stopVoiceOutput(); duckRadio(); setAudioSession('play-and-record');
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { endConversation('Voice input is unavailable here. Use the keyboard button.'); setTextMode(true); return; }
    setVoiceMessage(fromConversation ? 'Listening…' : 'Opening microphone…');
    try {
      await sleep(fromConversation ? 420 : 180);
      if (!conversationModeRef.current || !openRef.current) return;
      const recognition = new Recognition(); recognitionRef.current = recognition;
      let receivedResult = false;
      recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        setListening(true); setVoiceMessage('Listening'); stopRecognitionWatchdog();
        recognitionWatchdogRef.current = window.setTimeout(() => { recognition.abort(); recognitionRef.current = null; setListening(false); endConversation('Listening stalled. Tap the orb to reconnect.'); }, 12000);
      };
      recognition.onend = () => {
        stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null;
        if (!receivedResult && conversationModeRef.current) { setVoiceMessage('Still listening…'); window.setTimeout(() => { if (conversationModeRef.current && openRef.current) void listen(true); }, 800); }
      };
      recognition.onerror = (event) => {
        stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null;
        const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
        if (denied) { endConversation('Microphone access is blocked. Allow it and tap the orb again.'); setTextMode(true); }
        else { setVoiceMessage('Reconnecting…'); window.setTimeout(() => { if (conversationModeRef.current && openRef.current) void listen(true); }, 950); }
      };
      recognition.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript?.trim(); if (!text) return;
        receivedResult = true; stopRecognitionWatchdog(); setListening(false); setVoiceMessage('Got it');
        recognition.abort(); recognitionRef.current = null; void ask(text);
      };
      recognition.start();
    } catch { setListening(false); recognitionRef.current = null; stopRecognitionWatchdog(); endConversation('Microphone could not start. Tap the orb to retry.'); }
  }
  function activateAtlas() {
    // iOS removes its speech-start restriction only when speechSynthesis.speak()
    // is called synchronously inside the physical user gesture. Do this before
    // any promise, timeout, worker message, fetch, or recognition startup.
    primeSystemSpeech();
    void primeVoiceOutput();
    warmNeuralVoice();
    if (!open) { openRef.current = true; setOpen(true); setTextMode(false); window.setTimeout(() => void listen(), 60); return; }
    if (conversationModeRef.current) endConversation('Conversation paused. Tap the orb to continue.'); else void listen();
  }

  const voiceActive = listening || speaking || conversationMode;
  const stationLabel = station?.name || 'Current signal';
  const orbState = listening ? 'listening' : speaking ? 'speaking' : busy ? 'thinking' : conversationMode ? 'live' : 'idle';

  return <>
    <style>{`
      @keyframes atlasOrbit { to { transform: rotate(360deg); } }
      @keyframes atlasBreathe { 0%,100% { transform: scale(.96); filter: brightness(.95); } 50% { transform: scale(1.045); filter: brightness(1.18); } }
      @keyframes atlasListen { 0%,100% { transform: scale(.92); } 45% { transform: scale(1.09); } }
      @keyframes atlasHalo { 0%,100% { opacity:.24; transform:scale(.9); } 50% { opacity:.7; transform:scale(1.16); } }
    `}</style>
    <button onClick={activateAtlas} aria-label={conversationMode ? 'Pause Atlas conversation' : 'Talk to Atlas'} className="fixed bottom-[13.1rem] left-1/2 z-[240] grid size-[5.4rem] -translate-x-1/2 place-items-center rounded-full outline-none transition-transform active:scale-95 md:bottom-6 md:left-auto md:right-6 md:translate-x-0">
      <span className="absolute inset-[-8px] rounded-full bg-[conic-gradient(from_20deg,transparent_0_12%,rgba(78,199,194,.72)_24%,transparent_42%,rgba(212,166,74,.72)_64%,transparent_82%)] blur-[1px]" style={{ animation: `atlasOrbit ${voiceActive ? '2.2s' : '7s'} linear infinite` }} aria-hidden="true" />
      <span className="absolute inset-[-12px] rounded-full border border-emerald-200/20 shadow-[0_0_42px_rgba(78,199,194,.24)]" style={{ animation: voiceActive ? 'atlasHalo 1.55s ease-in-out infinite' : 'none' }} aria-hidden="true" />
      <span className="relative grid size-[4.7rem] place-items-center overflow-hidden rounded-full border border-white/25 shadow-[inset_-14px_-18px_28px_rgba(0,0,0,.46),inset_12px_10px_22px_rgba(255,255,255,.08),0_0_36px_rgba(78,199,194,.32),0_18px_55px_rgba(0,0,0,.5)]" style={{ background: 'radial-gradient(circle at 32% 25%, rgba(247,244,239,.88) 0 3%, rgba(78,199,194,.72) 8%, rgba(0,214,143,.42) 24%, rgba(8,17,29,.94) 64%, rgba(3,7,15,1) 100%)', animation: orbState === 'listening' ? 'atlasListen .92s ease-in-out infinite' : orbState === 'speaking' ? 'atlasBreathe .72s ease-in-out infinite' : 'atlasBreathe 3.8s ease-in-out infinite' }} aria-hidden="true">
        <span className="absolute left-[17%] top-[13%] h-[24%] w-[31%] rotate-[-24deg] rounded-full bg-white/30 blur-[7px]" />
        <span className="absolute bottom-[12%] right-[13%] size-[36%] rounded-full bg-[#d4a64a]/20 blur-[10px]" />
        <span className="absolute inset-[26%] rounded-full bg-emerald-200/15 blur-[5px]" />
      </span><span className="sr-only">Atlas {orbState}</span>
    </button>
    {open && !textMode && <section role="dialog" aria-label="Atlas voice conversation" className="fixed bottom-[19.2rem] left-1/2 z-[235] w-[min(86vw,350px)] -translate-x-1/2 rounded-[1.45rem] border border-white/10 bg-[#050b19]/82 px-4 py-3 shadow-[0_24px_70px_rgba(0,0,0,.5)] backdrop-blur-2xl md:bottom-24 md:left-auto md:right-6 md:w-[350px] md:translate-x-0">
      <div className="flex items-center gap-3"><div className={`size-2.5 shrink-0 rounded-full ${voiceActive ? 'bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,.9)]' : 'bg-slate-500'}`} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{voiceMessage}</div><div className="truncate text-[11px] text-slate-400">{stationLabel}{neuralState === 'loading' ? ' · voice preparing' : ''}</div></div><button onClick={() => setTextMode(true)} aria-label="Open keyboard and transcript" className="grid size-9 place-items-center rounded-full bg-white/[.06] text-slate-300"><Keyboard size={17}/></button><button onClick={() => { endConversation(); setOpen(false); }} aria-label="Close Atlas" className="grid size-9 place-items-center rounded-full bg-white/[.06] text-slate-300"><X size={17}/></button></div>
    </section>}
    {open && textMode && <section role="dialog" aria-label="Atlas Assistant" className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+12.5rem)] z-[250] mx-auto flex max-h-[58dvh] max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050b19]/96 shadow-[0_30px_90px_rgba(0,0,0,.58)] backdrop-blur-2xl md:inset-x-auto md:bottom-20 md:right-5 md:w-[390px]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="font-semibold tracking-tight text-white">Atlas</div><div className="mt-0.5 text-[11px] text-slate-400">{stationLabel}</div></div><div className="flex items-center gap-1"><button onClick={() => setVoiceEnabled((value) => !value)} aria-label={voiceEnabled ? 'Mute Atlas voice' : 'Enable Atlas voice'} className="grid size-9 place-items-center rounded-full text-slate-300 hover:bg-white/10">{voiceEnabled ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button><button onClick={() => setTextMode(false)} aria-label="Return to voice view" className="grid size-9 place-items-center rounded-full text-emerald-300 hover:bg-white/10"><Mic size={17}/></button><button onClick={() => { endConversation(); setOpen(false); }} aria-label="Close Atlas" className="grid size-9 place-items-center rounded-full text-slate-300 hover:bg-white/10"><X size={18}/></button></div></header>
      <div className="min-h-28 flex-1 space-y-3 overflow-y-auto p-4">{lines.map((line, i) => <div key={i} className={line.role === 'user' ? 'ml-8 rounded-2xl rounded-br-md bg-emerald-400/15 px-3.5 py-2.5 text-sm leading-5 text-emerald-50' : 'mr-5 rounded-2xl rounded-bl-md bg-white/[.06] px-3.5 py-2.5 text-sm leading-5 text-slate-100'}>{line.text}</div>)}{busy && <div className="px-1 text-xs text-slate-400">Atlas is thinking…</div>}</div>
      <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 pt-2">{QUICK_COMMANDS.map((command) => <button key={command} onClick={() => void ask(command)} className="shrink-0 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:border-emerald-300/30 hover:text-emerald-200">{command}</button>)}</div>
      <form onSubmit={submit} className="flex items-center gap-2 p-3"><button type="button" onClick={() => { primeSystemSpeech(); void primeVoiceOutput(); void listen(); }} className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${listening ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-white/10 bg-white/[.04] text-emerald-300'}`} aria-label={listening ? 'Stop listening' : 'Talk to Atlas'}>{listening ? <MicOff size={19}/> : <Mic size={19}/>}</button><input ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask or tell Atlas what to do…" className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"/><button type="submit" disabled={!question.trim() || busy} className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-slate-950 disabled:opacity-35" aria-label="Send"><Send size={18}/></button></form>
    </section>}
  </>;
}
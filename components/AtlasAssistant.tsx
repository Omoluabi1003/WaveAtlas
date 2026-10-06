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

const NATURAL_VOICE_HINTS = /siri|premium|enhanced|natural|samantha|ava|allison|serena|daniel|karen|moira|rishi|eddy|reed|flo|sandy|shelley/i;
const SYNTHETIC_VOICE_HINTS = /compact|espeak|festival|robot/i;
const QUICK_COMMANDS = ['Surprise me', 'Play jazz', 'Open the map', 'What am I listening to?'];
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function bestSystemVoice(language: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const voices = [...window.speechSynthesis.getVoices()];
  const target = language.toLowerCase();
  const base = target.split('-')[0];
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    const preferred = voices.find((voice) => /samantha|ava/i.test(voice.name) && voice.lang.toLowerCase().startsWith(base));
    if (preferred) return preferred;
    return undefined;
  }
  return voices.sort((a, b) => {
    const score = (voice: SpeechSynthesisVoice) => {
      const lang = voice.lang.toLowerCase();
      let value = lang === target ? 80 : lang.startsWith(`${base}-`) || lang === base ? 55 : 0;
      if (NATURAL_VOICE_HINTS.test(voice.name)) value += 70;
      if (voice.localService) value += 8;
      if (SYNTHETIC_VOICE_HINTS.test(voice.name)) value -= 80;
      return value;
    };
    return score(b) - score(a);
  })[0];
}

export function AtlasAssistant({ station, playbackStatus = 'idle', onSearch, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [question, setQuestion] = useState('');
  const [lines, setLines] = useState<Line[]>([{ role: 'atlas', text: 'I’m Atlas. Talk to me about the signal, or tell me where you want to go.' }]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceMessage, setVoiceMessage] = useState('Tap Atlas and speak');
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
  const neuralAudioRef = useRef<HTMLAudioElement | null>(null);
  const neuralPendingRef = useRef(new Map<string, PendingNeural>());
  const resumeRadioAfterVoiceRef = useRef(false);

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
    neuralAudioRef.current?.pause();
    neuralWorkerRef.current?.terminate();
    neuralPendingRef.current.forEach(({ reject, timer }) => { window.clearTimeout(timer); reject(new Error('Atlas voice closed')); });
    neuralPendingRef.current.clear();
    restoreRadioAfterVoice();
  }, []);

  function sendPlayback(command: 'play' | 'pause') {
    window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback', { detail: { command } }));
  }

  function pauseRadioForVoice() {
    if (playbackStatus === 'playing' && !resumeRadioAfterVoiceRef.current) {
      resumeRadioAfterVoiceRef.current = true;
      sendPlayback('pause');
    }
  }

  function restoreRadioAfterVoice() {
    if (!resumeRadioAfterVoiceRef.current) return;
    resumeRadioAfterVoiceRef.current = false;
    sendPlayback('play');
  }

  function stopRecognitionWatchdog() {
    if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current);
    recognitionWatchdogRef.current = null;
  }

  function stopVoiceOutput() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    const neuralAudio = neuralAudioRef.current;
    if (neuralAudio) { neuralAudio.pause(); neuralAudio.currentTime = 0; }
    setSpeaking(false);
  }

  async function primeNeuralAudio() {
    if (typeof window === 'undefined') return;
    const audio = neuralAudioRef.current ?? new Audio();
    neuralAudioRef.current = audio;
    if (audio.dataset.atlasUnlocked === 'true') return;
    audio.src = SILENT_WAV;
    audio.muted = true;
    try {
      await audio.play();
      audio.pause(); audio.currentTime = 0; audio.muted = false;
      audio.dataset.atlasUnlocked = 'true';
    } catch { audio.muted = false; }
  }

  function warmNeuralVoice() {
    if (typeof window === 'undefined' || !('Worker' in window) || neuralStateRef.current !== 'idle') return;
    setNeuralState('loading'); neuralStateRef.current = 'loading';
    try {
      const worker = new Worker('/atlas-neural-voice-worker.mjs', { type: 'module' });
      neuralWorkerRef.current = worker;
      worker.onmessage = (event: MessageEvent<NeuralMessage>) => {
        const message = event.data;
        if (message.type === 'ready') { setNeuralState('ready'); neuralStateRef.current = 'ready'; return; }
        if (message.type === 'unavailable') { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; return; }
        if (message.id) {
          const pending = neuralPendingRef.current.get(message.id);
          if (!pending) return;
          window.clearTimeout(pending.timer); neuralPendingRef.current.delete(message.id);
          if (message.type === 'audio') pending.resolve(message);
          else pending.reject(new Error(message.message || 'Neural voice unavailable'));
        }
      };
      worker.onerror = () => { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; };
      worker.postMessage({ type: 'warm' });
    } catch {
      setNeuralState('unavailable'); neuralStateRef.current = 'unavailable';
    }
  }

  async function speakNeural(text: string) {
    const worker = neuralWorkerRef.current;
    const audio = neuralAudioRef.current;
    if (!worker || !audio || neuralStateRef.current !== 'ready') return false;
    const id = `atlas-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      setVoiceMessage('Atlas is speaking');
      const message = await new Promise<NeuralMessage>((resolve, reject) => {
        const timer = window.setTimeout(() => { neuralPendingRef.current.delete(id); reject(new Error('Neural voice timeout')); }, 12000);
        neuralPendingRef.current.set(id, { resolve, reject, timer });
        worker.postMessage({ type: 'speak', id, text });
      });
      if (!message.buffer) return false;
      const url = URL.createObjectURL(new Blob([message.buffer], { type: message.mime || 'audio/wav' }));
      audio.src = url; audio.muted = false; audio.volume = 1;
      const completed = await new Promise<boolean>((resolve) => {
        const finish = (ok: boolean) => { audio.onended = null; audio.onerror = null; URL.revokeObjectURL(url); resolve(ok); };
        audio.onended = () => finish(true);
        audio.onerror = () => finish(false);
        audio.play().catch(() => finish(false));
      });
      return completed;
    } catch { return false; }
  }

  function speakSystem(text: string) {
    return new Promise<boolean>((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) { resolve(false); return; }
      window.speechSynthesis.cancel(); window.speechSynthesis.resume();
      const utterance = new SpeechSynthesisUtterance(text);
      const language = navigator.language || 'en-US';
      const voice = bestSystemVoice(language);
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = language;
      utterance.rate = 0.97; utterance.pitch = 1; utterance.volume = 1;
      let started = false;
      const guard = window.setTimeout(() => { if (!started) { window.speechSynthesis.cancel(); resolve(false); } }, 2400);
      utterance.onstart = () => { started = true; window.clearTimeout(guard); setVoiceMessage('Atlas is speaking'); };
      utterance.onend = () => { window.clearTimeout(guard); resolve(true); };
      utterance.onerror = () => { window.clearTimeout(guard); resolve(false); };
      window.speechSynthesis.speak(utterance);
    });
  }

  async function speak(text: string) {
    if (!voiceEnabledRef.current) { restoreRadioAfterVoice(); return; }
    recognitionRef.current?.abort(); recognitionRef.current = null; stopRecognitionWatchdog(); setListening(false);
    pauseRadioForVoice(); setSpeaking(true);
    let spoken = false;
    if (neuralStateRef.current === 'ready') spoken = await speakNeural(text);
    if (!spoken) spoken = await speakSystem(text);
    setSpeaking(false);
    if (!spoken) setVoiceMessage('Voice could not start. Tap Atlas once and try again.');
    if (conversationModeRef.current && openRef.current && spoken) {
      setVoiceMessage('Your turn');
      window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 700);
    } else {
      setVoiceMessage('Tap Atlas and speak');
      restoreRadioAfterVoice();
    }
  }

  function endConversation(message = 'Tap Atlas and speak') {
    conversationModeRef.current = false; setConversationMode(false);
    recognitionRef.current?.abort(); recognitionRef.current = null; stopRecognitionWatchdog(); stopVoiceOutput();
    setListening(false); setVoiceMessage(message); restoreRadioAfterVoice();
  }

  async function ask(text: string) {
    const value = text.trim(); if (!value || busyRef.current) return;
    setLines((old) => [...old, { role: 'user', text: value }]); setQuestion(''); setBusy(true); busyRef.current = true;
    try {
      const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value, context: { station } }) });
      const data = await response.json() as { answer?: string; action?: AtlasAssistantAction };
      let answer = data.answer || 'I could not answer that from the Atlas yet.';
      if (data.action) {
        if (data.action.type === 'pause') resumeRadioAfterVoiceRef.current = false;
        if (['play', 'resume', 'teleport', 'wander'].includes(data.action.type)) resumeRadioAfterVoiceRef.current = true;
        try {
          const handled = await onAction?.(data.action);
          if (handled === false) answer = `${answer} I could not complete that action.`;
        } catch { answer = `${answer} I could not complete that action.`; }
        if (['play', 'resume', 'teleport', 'wander'].includes(data.action.type)) window.setTimeout(() => sendPlayback('pause'), 120);
      } else if ((data as { action?: { type?: string; query?: string } }).action?.type === 'search') {
        const query = (data as { action?: { query?: string } }).action?.query;
        if (query) onSearch?.(query);
      }
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (voiceEnabledRef.current) void speak(answer); else restoreRadioAfterVoice();
    } catch {
      const answer = 'I lost the signal for a moment. Try that again.';
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (voiceEnabledRef.current) void speak(answer); else restoreRadioAfterVoice();
    } finally { setBusy(false); busyRef.current = false; }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }

  async function primeMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const request = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => { stream.getTracks().forEach((track) => track.stop()); })
      .catch(() => undefined);
    await Promise.race([request, sleep(2200)]);
  }

  async function listen(fromConversation = false) {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!fromConversation) { conversationModeRef.current = true; setConversationMode(true); }
    stopVoiceOutput(); pauseRadioForVoice();
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { endConversation('Voice input is unavailable here. Use the keyboard button.'); setTextMode(true); return; }
    setVoiceMessage(fromConversation ? 'Listening…' : 'Preparing to listen…');
    try {
      await primeMicrophone();
      await sleep(fromConversation ? 360 : 520);
      if (!conversationModeRef.current || !openRef.current) return;
      const recognition = new Recognition(); recognitionRef.current = recognition;
      let receivedResult = false;
      recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        setListening(true); setVoiceMessage('Listening'); stopRecognitionWatchdog();
        recognitionWatchdogRef.current = window.setTimeout(() => { recognition.abort(); recognitionRef.current = null; setListening(false); endConversation('Listening stalled. Tap Atlas to reconnect.'); }, 12000);
      };
      recognition.onend = () => {
        stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null;
        if (!receivedResult && conversationModeRef.current) {
          setVoiceMessage('Still listening…');
          window.setTimeout(() => { if (conversationModeRef.current && openRef.current) void listen(true); }, 900);
        }
      };
      recognition.onerror = (event) => {
        stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null;
        const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
        if (denied) { endConversation('Microphone access is blocked. Allow it and tap Atlas again.'); setTextMode(true); }
        else { setVoiceMessage('Reconnecting…'); window.setTimeout(() => { if (conversationModeRef.current && openRef.current) void listen(true); }, 1100); }
      };
      recognition.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript?.trim(); if (!text) return;
        receivedResult = true; stopRecognitionWatchdog(); setListening(false); setVoiceMessage('Got it');
        recognition.abort(); recognitionRef.current = null; void ask(text);
      };
      recognition.start();
    } catch {
      setListening(false); recognitionRef.current = null; stopRecognitionWatchdog(); endConversation('Microphone could not start. Tap Atlas to retry.');
    }
  }

  function activateAtlas() {
    void primeNeuralAudio(); warmNeuralVoice();
    if (!open) { openRef.current = true; setOpen(true); setTextMode(false); window.setTimeout(() => void listen(), 80); return; }
    if (conversationModeRef.current) endConversation('Conversation paused. Tap Atlas to continue.');
    else void listen();
  }

  const voiceActive = listening || speaking || conversationMode;
  const stationLabel = station?.name || 'Current signal';
  const orbLabel = listening ? 'Listening' : speaking ? 'Speaking' : busy ? 'Thinking' : 'Atlas';

  return <>
    <button onClick={activateAtlas} aria-label={conversationMode?'Pause Atlas conversation':'Talk to Atlas'} className={`fixed bottom-[13.25rem] left-1/2 z-[200] grid size-16 -translate-x-1/2 place-items-center rounded-full border backdrop-blur-2xl transition-all duration-300 md:bottom-6 md:left-auto md:right-6 md:translate-x-0 ${voiceActive?'scale-110 border-emerald-100/80 bg-emerald-300 text-slate-950 shadow-[0_0_0_9px_rgba(110,231,183,.10),0_0_48px_rgba(16,185,129,.42),0_18px_60px_rgba(0,0,0,.5)]':'border-emerald-300/35 bg-[radial-gradient(circle_at_35%_30%,rgba(110,231,183,.32),rgba(7,17,31,.96)_62%)] text-emerald-200 shadow-[0_0_34px_rgba(16,185,129,.2),0_18px_55px_rgba(0,0,0,.48)]'}`}>
      <span className={`absolute inset-[-7px] rounded-full border border-emerald-300/15 ${voiceActive?'animate-ping':''}`} aria-hidden="true" />
      <span className="flex h-6 items-end gap-[3px]" aria-hidden="true">{[11,20,15,24,13].map((height,index)=><span key={index} className={`w-[3px] rounded-full bg-current ${voiceActive?'animate-pulse':''}`} style={{height}} />)}</span>
      <span className="sr-only">{orbLabel}</span>
    </button>

    {open && !textMode && <section role="dialog" aria-label="Atlas voice conversation" className="fixed bottom-[18.4rem] left-1/2 z-[199] w-[min(88vw,360px)] -translate-x-1/2 rounded-[1.6rem] border border-white/10 bg-[#050b19]/88 px-4 py-3 shadow-[0_24px_70px_rgba(0,0,0,.48)] backdrop-blur-2xl md:bottom-24 md:left-auto md:right-6 md:w-[350px] md:translate-x-0">
      <div className="flex items-center gap-3"><div className={`size-2.5 shrink-0 rounded-full ${voiceActive?'bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,.9)]':'bg-slate-500'}`} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{voiceMessage}</div><div className="truncate text-[11px] text-slate-400">{stationLabel}{neuralState==='loading'?' · voice warming':''}</div></div><button onClick={()=>setTextMode(true)} aria-label="Open keyboard and transcript" className="grid size-9 place-items-center rounded-full bg-white/[.06] text-slate-300"><Keyboard size={17}/></button><button onClick={()=>{endConversation();setOpen(false);}} aria-label="Close Atlas" className="grid size-9 place-items-center rounded-full bg-white/[.06] text-slate-300"><X size={17}/></button></div>
    </section>}

    {open && textMode && <section role="dialog" aria-label="Atlas Assistant" className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+12.5rem)] z-[210] mx-auto flex max-h-[58dvh] max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050b19]/96 shadow-[0_30px_90px_rgba(0,0,0,.58)] backdrop-blur-2xl md:inset-x-auto md:bottom-20 md:right-5 md:w-[390px]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="font-semibold tracking-tight text-white">Atlas</div><div className="mt-0.5 text-[11px] text-slate-400">{stationLabel}</div></div><div className="flex items-center gap-1"><button onClick={()=>{setVoiceEnabled((value)=>!value);}} aria-label={voiceEnabled?'Mute Atlas voice':'Enable Atlas voice'} className="grid size-9 place-items-center rounded-full text-slate-300 hover:bg-white/10">{voiceEnabled?<Volume2 size={17}/>:<VolumeX size={17}/>}</button><button onClick={()=>setTextMode(false)} aria-label="Return to voice view" className="grid size-9 place-items-center rounded-full text-emerald-300 hover:bg-white/10"><Mic size={17}/></button><button onClick={()=>{endConversation();setOpen(false);}} aria-label="Close Atlas" className="grid size-9 place-items-center rounded-full text-slate-300 hover:bg-white/10"><X size={18}/></button></div></header>
      <div className="min-h-28 flex-1 space-y-3 overflow-y-auto p-4">{lines.map((line,i)=><div key={i} className={line.role==='user'?'ml-8 rounded-2xl rounded-br-md bg-emerald-400/15 px-3.5 py-2.5 text-sm leading-5 text-emerald-50':'mr-5 rounded-2xl rounded-bl-md bg-white/[.06] px-3.5 py-2.5 text-sm leading-5 text-slate-100'}>{line.text}</div>)}{busy&&<div className="px-1 text-xs text-slate-400">Atlas is thinking…</div>}</div>
      <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 pt-2">{QUICK_COMMANDS.map((command)=><button key={command} onClick={()=>void ask(command)} className="shrink-0 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:border-emerald-300/30 hover:text-emerald-200">{command}</button>)}</div>
      <form onSubmit={submit} className="flex items-center gap-2 p-3"><button type="button" onClick={()=>void listen()} className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${listening?'border-emerald-300 bg-emerald-300 text-slate-950':'border-white/10 bg-white/[.04] text-emerald-300'}`} aria-label={listening?'Stop listening':'Talk to Atlas'}>{listening?<MicOff size={19}/>:<Mic size={19}/>}</button><input ref={inputRef} value={question} onChange={(e)=>setQuestion(e.target.value)} placeholder="Ask or tell Atlas what to do…" className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"/><button type="submit" disabled={!question.trim()||busy} className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-slate-950 disabled:opacity-35" aria-label="Send"><Send size={18}/></button></form>
    </section>}
  </>;
}

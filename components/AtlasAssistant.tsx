"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { Station } from '@/lib/stations';
import { getSpeechRecognitionConstructor, type BrowserSpeechRecognition } from '@/lib/voice-command-engine';

type Props = { station: Station | null; onSearch?: (query: string) => void };
type Line = { role: 'user' | 'atlas'; text: string };
type MediaSnapshot = { element: HTMLMediaElement; muted: boolean };

const NATURAL_VOICE_HINTS = /siri|premium|enhanced|natural|samantha|ava|allison|serena|daniel|karen|moira|rishi|eddy|reed|flo|sandy|shelley/i;
const SYNTHETIC_VOICE_HINTS = /compact|espeak|festival|robot/i;

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function bestSystemVoice(language: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const target = language.toLowerCase();
  const base = target.split('-')[0];
  return [...window.speechSynthesis.getVoices()].sort((a, b) => {
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

export function AtlasAssistant({ station, onSearch }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [lines, setLines] = useState<Line[]>([{ role: 'atlas', text: 'Where would you like to listen next?' }]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('Tap the orb or microphone to talk');
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionWatchdogRef = useRef<number | null>(null);
  const mutedMediaRef = useRef<MediaSnapshot[]>([]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);
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
    restoreProgramAudio();
  }, []);

  function quietProgramAudio() {
    if (mutedMediaRef.current.length) return;
    mutedMediaRef.current = Array.from(document.querySelectorAll<HTMLMediaElement>('audio,video')).map((element) => ({ element, muted: element.muted }));
    mutedMediaRef.current.forEach(({ element }) => { element.muted = true; });
  }

  function restoreProgramAudio() {
    const snapshots = mutedMediaRef.current.splice(0);
    snapshots.forEach(({ element, muted }) => { if (element.isConnected) element.muted = muted; });
  }

  function stopRecognitionWatchdog() {
    if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current);
    recognitionWatchdogRef.current = null;
  }

  function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    restoreProgramAudio();
  }

  function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { restoreProgramAudio(); return; }
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    stopRecognitionWatchdog();
    setListening(false);
    quietProgramAudio();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const language = navigator.language || 'en-US';
    const voice = bestSystemVoice(language);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = language;
    utterance.rate = 0.94;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    let started = false;
    const startGuard = window.setTimeout(() => {
      if (!started) {
        setSpeaking(false);
        setVoiceMessage('Tap the speaker once to enable spoken replies on this device.');
        restoreProgramAudio();
      }
    }, 1800);
    utterance.onstart = () => { started = true; window.clearTimeout(startGuard); setSpeaking(true); setVoiceMessage('Atlas is speaking'); };
    utterance.onend = () => { window.clearTimeout(startGuard); setSpeaking(false); setVoiceMessage('Tap the orb or microphone to talk'); restoreProgramAudio(); };
    utterance.onerror = () => { window.clearTimeout(startGuard); setSpeaking(false); setVoiceMessage('Tap the speaker to hear this answer.'); restoreProgramAudio(); };
    window.speechSynthesis.speak(utterance);
  }

  async function ask(text: string, spoken = false) {
    const value = text.trim(); if (!value || busy) return;
    setLines((old) => [...old, { role: 'user', text: value }]); setQuestion(''); setBusy(true);
    try {
      const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value, context: { station } }) });
      const data = await response.json();
      const answer = data.answer || 'I could not answer that from the Atlas yet.';
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (data.action?.type === 'search' && data.action.query) onSearch?.(data.action.query);
      if (spoken) speak(answer); else restoreProgramAudio();
    } catch {
      setLines((old) => [...old, { role: 'atlas', text: 'Atlas is temporarily unavailable. Please try again.' }]);
      restoreProgramAudio();
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }

  async function primeMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    stream.getTracks().forEach((track) => track.stop());
  }

  async function listen() {
    if (listening) { recognitionRef.current?.stop(); return; }
    stopSpeaking();
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { setVoiceMessage('Voice input is unavailable in this browser. Open WaveAtlas in Safari or Chrome, or type below.'); return; }
    quietProgramAudio();
    setVoiceMessage('Preparing microphone…');
    try {
      await primeMicrophone();
      await sleep(420);
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      let receivedResult = false;
      recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        setListening(true); setVoiceMessage('Listening… speak naturally');
        stopRecognitionWatchdog();
        recognitionWatchdogRef.current = window.setTimeout(() => {
          recognition.abort();
          recognitionRef.current = null;
          setListening(false);
          setVoiceMessage('Voice listening stalled. Tap once to retry, or open WaveAtlas directly in Safari.');
          restoreProgramAudio();
        }, 12000);
      };
      recognition.onend = () => {
        stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null;
        if (!receivedResult) { setVoiceMessage('I did not catch that. Tap once and try again.'); restoreProgramAudio(); }
      };
      recognition.onerror = (event) => {
        stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null;
        setVoiceMessage(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'Microphone access is blocked. Allow microphone access and try again.' : 'I could not hear that clearly. Tap once to try again.');
        restoreProgramAudio();
      };
      recognition.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript?.trim();
        if (!text) return;
        receivedResult = true; stopRecognitionWatchdog(); setListening(false); setVoiceMessage(`Heard: “${text}”`);
        recognition.abort(); recognitionRef.current = null; void ask(text, true);
      };
      recognition.start();
    } catch (error) {
      setListening(false); recognitionRef.current = null; stopRecognitionWatchdog(); restoreProgramAudio();
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      setVoiceMessage(denied ? 'Microphone access is blocked. Allow it in browser settings and try again.' : 'Microphone could not start here. Open WaveAtlas directly in Safari and try again.');
    }
  }

  const voiceActive = listening || speaking;

  return <>
    <button onClick={() => open ? void listen() : setOpen(true)} aria-label={open?'Talk to Atlas':'Open Atlas Assistant'} className={`fixed bottom-[13.2rem] right-4 z-[88] grid size-14 place-items-center rounded-full border shadow-[0_18px_55px_rgba(0,0,0,.42)] backdrop-blur-xl transition-all md:bottom-6 md:right-5 ${voiceActive?'scale-105 border-emerald-200/80 bg-emerald-300 text-slate-950 shadow-[0_0_0_7px_rgba(110,231,183,.12),0_18px_55px_rgba(0,0,0,.42)]':'border-emerald-300/25 bg-[#07111f]/92 text-emerald-300 hover:bg-[#0b1a2b]'}`}>
      <span className="sr-only">{open?'Talk to Atlas':'Open Atlas Assistant'}</span>
      <span className="flex h-5 items-end gap-[3px]" aria-hidden="true">{[10,18,13,20].map((height,index)=><span key={index} className={`w-[3px] rounded-full bg-current ${voiceActive?'animate-pulse':''}`} style={{height}} />)}</span>
    </button>
    {open && <section role="dialog" aria-label="Atlas Assistant" className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+12.5rem)] z-[100] mx-auto flex max-h-[58dvh] max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050b19]/96 shadow-[0_30px_90px_rgba(0,0,0,.58)] backdrop-blur-2xl md:inset-x-auto md:bottom-20 md:right-5 md:w-[390px]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="font-semibold tracking-tight text-white">Atlas Assistant</div><div className="mt-0.5 text-[11px] text-slate-400">Your WaveAtlas listening guide</div></div><button onClick={() => { stopSpeaking(); recognitionRef.current?.abort(); setOpen(false); }} aria-label="Close Atlas Assistant" className="grid size-9 place-items-center rounded-full text-slate-300 transition hover:bg-white/10"><X size={18}/></button></header>
      <div className="min-h-28 flex-1 space-y-3 overflow-y-auto p-4">{lines.map((line,i)=><div key={i} className={line.role==='user'?'ml-8 rounded-2xl rounded-br-md bg-emerald-400/15 px-3.5 py-2.5 text-sm leading-5 text-emerald-50':'mr-5 rounded-2xl rounded-bl-md bg-white/[.06] px-3.5 py-2.5 text-sm leading-5 text-slate-100'}>{line.text}{line.role==='atlas'&&<button onClick={()=>speaking ? stopSpeaking() : speak(line.text)} className="ml-2 inline-flex rounded-full p-1 align-middle text-slate-400 transition hover:bg-white/10 hover:text-emerald-300" aria-label={speaking?'Stop speaking':'Hear Atlas'}>{speaking?<VolumeX size={14}/>:<Volume2 size={14}/>}</button>}</div>)}{busy&&<div className="px-1 text-xs text-slate-400">Atlas is thinking…</div>}</div>
      <div className="border-t border-white/10 bg-black/10 px-3 pt-2"><p className={`text-center text-[11px] ${voiceActive?'font-semibold text-emerald-300':'text-slate-500'}`}>{voiceMessage}</p></div>
      <form onSubmit={submit} className="flex items-center gap-2 bg-black/10 p-3 pt-2"><button type="button" onClick={()=>void listen()} className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${listening?'border-emerald-300 bg-emerald-300 text-slate-950 shadow-[0_0_0_5px_rgba(110,231,183,.12)]':'border-white/10 bg-white/[.04] text-emerald-300 hover:bg-white/[.08]'}`} aria-label={listening?'Stop listening':'Talk to Atlas'}>{listening?<MicOff size={19}/>:<Mic size={19}/>}</button><input ref={inputRef} value={question} onChange={(e)=>setQuestion(e.target.value)} placeholder="Ask Atlas…" className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"/><button type="submit" disabled={!question.trim()||busy} className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-slate-950 transition disabled:opacity-35" aria-label="Send"><Send size={18}/></button></form>
    </section>}
  </>;
}

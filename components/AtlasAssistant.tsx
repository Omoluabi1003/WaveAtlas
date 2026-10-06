"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { AtlasAssistantAction } from '@/lib/atlas-assistant';
import type { Station } from '@/lib/stations';
import { getSpeechRecognitionConstructor, type BrowserSpeechRecognition } from '@/lib/voice-command-engine';

type Props = {
  station: Station | null;
  onSearch?: (query: string) => void;
  onAction?: (action: AtlasAssistantAction) => boolean | Promise<boolean>;
};
type Line = { role: 'user' | 'atlas'; text: string };
type MediaSnapshot = { element: HTMLMediaElement; muted: boolean };

const NATURAL_VOICE_HINTS = /siri|premium|enhanced|natural|samantha|ava|allison|serena|daniel|karen|moira|rishi|eddy|reed|flo|sandy|shelley/i;
const SYNTHETIC_VOICE_HINTS = /compact|espeak|festival|robot/i;
const QUICK_COMMANDS = ['Surprise me', 'Play jazz', 'Open the map', 'What am I listening to?'];

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

export function AtlasAssistant({ station, onSearch, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [lines, setLines] = useState<Line[]>([{ role: 'atlas', text: 'Talk to me. Ask about this signal, or tell me what you want WaveAtlas to do.' }]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('Tap the orb or microphone to talk');
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionWatchdogRef = useRef<number | null>(null);
  const mutedMediaRef = useRef<MediaSnapshot[]>([]);
  const openRef = useRef(false);
  const conversationModeRef = useRef(false);
  const busyRef = useRef(false);
  const speakingAttemptRef = useRef(0);

  useEffect(() => { openRef.current = open; if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);
  useEffect(() => { conversationModeRef.current = conversationMode; }, [conversationMode]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
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

  function endConversation(message = 'Tap the orb or microphone to talk') {
    conversationModeRef.current = false;
    setConversationMode(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    stopRecognitionWatchdog();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setListening(false);
    setSpeaking(false);
    setVoiceMessage(message);
    restoreProgramAudio();
  }

  function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    if (!conversationModeRef.current) restoreProgramAudio();
  }

  function unlockSpeechOutput() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.resume();
    window.speechSynthesis.getVoices();
  }

  function speak(text: string, retry = 0) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { restoreProgramAudio(); return; }
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    stopRecognitionWatchdog();
    setListening(false);
    quietProgramAudio();
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
    const language = navigator.language || 'en-US';
    const voice = bestSystemVoice(language);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = language;
    utterance.rate = 0.96;
    utterance.pitch = 1.01;
    utterance.volume = 1;
    const attempt = ++speakingAttemptRef.current;
    let started = false;
    const startGuard = window.setTimeout(() => {
      if (started || attempt !== speakingAttemptRef.current) return;
      window.speechSynthesis.cancel();
      if (retry < 1) {
        setVoiceMessage('Reconnecting Atlas voice…');
        window.setTimeout(() => speak(text, retry + 1), 160);
      } else {
        setSpeaking(false);
        setVoiceMessage('Voice output is blocked on this device. The answer is on screen.');
        conversationModeRef.current = false;
        setConversationMode(false);
        restoreProgramAudio();
      }
    }, 1800);
    utterance.onstart = () => {
      if (attempt !== speakingAttemptRef.current) return;
      started = true;
      window.clearTimeout(startGuard);
      setSpeaking(true);
      setVoiceMessage('Atlas is speaking');
    };
    utterance.onend = () => {
      if (attempt !== speakingAttemptRef.current) return;
      window.clearTimeout(startGuard);
      setSpeaking(false);
      if (conversationModeRef.current && openRef.current) {
        setVoiceMessage('Your turn…');
        window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 650);
      } else {
        setVoiceMessage('Tap the orb or microphone to talk');
        restoreProgramAudio();
      }
    };
    utterance.onerror = () => {
      if (attempt !== speakingAttemptRef.current) return;
      window.clearTimeout(startGuard);
      setSpeaking(false);
      if (retry < 1) window.setTimeout(() => speak(text, retry + 1), 160);
      else endConversation('Voice output could not start. The answer is on screen.');
    };
    window.speechSynthesis.speak(utterance);
  }

  async function ask(text: string, spoken = false) {
    const value = text.trim(); if (!value || busyRef.current) return;
    setLines((old) => [...old, { role: 'user', text: value }]); setQuestion(''); setBusy(true); busyRef.current = true;
    try {
      const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value, context: { station } }) });
      const data = await response.json() as { answer?: string; action?: AtlasAssistantAction };
      let answer = data.answer || 'I could not answer that from the Atlas yet.';
      if (data.action) {
        try {
          const handled = await onAction?.(data.action);
          if (handled === false) answer = `${answer} I could not complete the action on this device.`;
        } catch {
          answer = `${answer} I could not complete the action on this device.`;
        }
      } else if ((data as { action?: { type?: string; query?: string } }).action?.type === 'search') {
        const query = (data as { action?: { query?: string } }).action?.query;
        if (query) onSearch?.(query);
      }
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (spoken || conversationModeRef.current) speak(answer); else restoreProgramAudio();
    } catch {
      const answer = 'Atlas is temporarily unavailable. Please try again.';
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (spoken || conversationModeRef.current) speak(answer); else restoreProgramAudio();
    } finally { setBusy(false); busyRef.current = false; }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(question, conversationModeRef.current); }

  async function primeMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    stream.getTracks().forEach((track) => track.stop());
  }

  async function listen(fromConversation = false) {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!fromConversation) {
      unlockSpeechOutput();
      conversationModeRef.current = true;
      setConversationMode(true);
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { endConversation('Voice input is unavailable here. You can still type instructions below.'); return; }
    quietProgramAudio();
    setVoiceMessage(fromConversation ? 'Listening…' : 'Preparing microphone…');
    try {
      await primeMicrophone();
      await sleep(fromConversation ? 260 : 420);
      if (!conversationModeRef.current || !openRef.current) return;
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      let receivedResult = false;
      recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        setListening(true); setVoiceMessage('Listening… speak naturally');
        stopRecognitionWatchdog();
        recognitionWatchdogRef.current = window.setTimeout(() => {
          recognition.abort(); recognitionRef.current = null; setListening(false);
          endConversation('Voice listening stalled. Tap once to reconnect.');
        }, 12000);
      };
      recognition.onend = () => {
        stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null;
        if (!receivedResult && conversationModeRef.current) {
          setVoiceMessage('I didn’t catch that. Listening again…');
          window.setTimeout(() => { if (conversationModeRef.current && openRef.current) void listen(true); }, 700);
        }
      };
      recognition.onerror = (event) => {
        stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null;
        const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
        if (denied) endConversation('Microphone access is blocked. Allow microphone access and try again.');
        else {
          setVoiceMessage('I missed that. Reconnecting…');
          window.setTimeout(() => { if (conversationModeRef.current && openRef.current) void listen(true); }, 900);
        }
      };
      recognition.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript?.trim();
        if (!text) return;
        receivedResult = true; stopRecognitionWatchdog(); setListening(false); setVoiceMessage(`Heard: “${text}”`);
        recognition.abort(); recognitionRef.current = null; void ask(text, true);
      };
      recognition.start();
    } catch (error) {
      setListening(false); recognitionRef.current = null; stopRecognitionWatchdog();
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      endConversation(denied ? 'Microphone access is blocked. Allow it in browser settings and try again.' : 'Microphone could not start. Tap once to retry.');
    }
  }

  const voiceActive = listening || speaking || conversationMode;

  return <>
    <button onClick={() => { if (!open) { setOpen(true); window.setTimeout(() => void listen(), 80); } else if (conversationMode) endConversation('Conversation paused. Tap the orb to talk again.'); else void listen(); }} aria-label={conversationMode?'Stop Atlas conversation':open?'Talk to Atlas':'Open and talk to Atlas'} className={`fixed bottom-[13.2rem] right-4 z-[88] grid size-14 place-items-center rounded-full border shadow-[0_18px_55px_rgba(0,0,0,.42)] backdrop-blur-xl transition-all md:bottom-6 md:right-5 ${voiceActive?'scale-105 border-emerald-200/80 bg-emerald-300 text-slate-950 shadow-[0_0_0_7px_rgba(110,231,183,.12),0_18px_55px_rgba(0,0,0,.42)]':'border-emerald-300/25 bg-[#07111f]/92 text-emerald-300 hover:bg-[#0b1a2b]'}`}>
      <span className="sr-only">{conversationMode?'Stop Atlas conversation':open?'Talk to Atlas':'Open and talk to Atlas'}</span>
      <span className="flex h-5 items-end gap-[3px]" aria-hidden="true">{[10,18,13,20].map((height,index)=><span key={index} className={`w-[3px] rounded-full bg-current ${voiceActive?'animate-pulse':''}`} style={{height}} />)}</span>
    </button>
    {open && <section role="dialog" aria-label="Atlas Assistant" className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+12.5rem)] z-[100] mx-auto flex max-h-[62dvh] max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050b19]/96 shadow-[0_30px_90px_rgba(0,0,0,.58)] backdrop-blur-2xl md:inset-x-auto md:bottom-20 md:right-5 md:w-[390px]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="flex items-center gap-2 font-semibold tracking-tight text-white">Atlas Assistant{conversationMode&&<span className="rounded-full bg-emerald-300/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-300">Live</span>}</div><div className="mt-0.5 text-[11px] text-slate-400">Ask. Command. Explore.</div></div><button onClick={() => { endConversation(); setOpen(false); }} aria-label="Close Atlas Assistant" className="grid size-9 place-items-center rounded-full text-slate-300 transition hover:bg-white/10"><X size={18}/></button></header>
      <div className="min-h-28 flex-1 space-y-3 overflow-y-auto p-4">{lines.map((line,i)=><div key={i} className={line.role==='user'?'ml-8 rounded-2xl rounded-br-md bg-emerald-400/15 px-3.5 py-2.5 text-sm leading-5 text-emerald-50':'mr-5 rounded-2xl rounded-bl-md bg-white/[.06] px-3.5 py-2.5 text-sm leading-5 text-slate-100'}>{line.text}{line.role==='atlas'&&<button onClick={()=>speaking ? stopSpeaking() : speak(line.text)} className="ml-2 inline-flex rounded-full p-1 align-middle text-slate-400 transition hover:bg-white/10 hover:text-emerald-300" aria-label={speaking?'Stop speaking':'Hear Atlas'}>{speaking?<VolumeX size={14}/>:<Volume2 size={14}/>}</button>}</div>)}{busy&&<div className="px-1 text-xs text-slate-400">Atlas is working…</div>}</div>
      <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 py-2">{QUICK_COMMANDS.map((command)=><button key={command} type="button" onClick={()=>void ask(command, conversationModeRef.current)} className="shrink-0 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-emerald-300/30 hover:text-emerald-200">{command}</button>)}</div>
      <div className="bg-black/10 px-3 pt-2"><p className={`text-center text-[11px] ${voiceActive?'font-semibold text-emerald-300':'text-slate-500'}`}>{voiceMessage}</p></div>
      <form onSubmit={submit} className="flex items-center gap-2 bg-black/10 p-3 pt-2"><button type="button" onClick={()=>conversationMode ? endConversation('Conversation paused. Tap to talk again.') : void listen()} className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${conversationMode?'border-emerald-300 bg-emerald-300 text-slate-950 shadow-[0_0_0_5px_rgba(110,231,183,.12)]':'border-white/10 bg-white/[.04] text-emerald-300 hover:bg-white/[.08]'}`} aria-label={conversationMode?'Stop conversation':'Talk to Atlas'}>{conversationMode?<MicOff size={19}/>:<Mic size={19}/>}</button><input ref={inputRef} value={question} onChange={(e)=>setQuestion(e.target.value)} placeholder="Ask or tell Atlas what to do…" className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"/><button type="submit" disabled={!question.trim()||busy} className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-slate-950 transition disabled:opacity-35" aria-label="Send"><Send size={18}/></button></form>
    </section>}
  </>;
}

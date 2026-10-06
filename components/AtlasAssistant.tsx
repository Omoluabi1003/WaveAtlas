"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, Send, Volume2, X } from 'lucide-react';
import type { AtlasActionResult, AtlasAssistantAction, AtlasConversationLine } from '@/lib/atlas-assistant';
import type { Station } from '@/lib/stations';

type Props = { station: Station | null; playbackStatus?: string; onSearch?: (query: string) => void; onAction?: (action: AtlasAssistantAction) => AtlasActionResult | boolean | Promise<AtlasActionResult | boolean>; };
type SpeechAlt = { transcript: string; confidence?: number };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start(): void; stop(): void; abort(): void; onstart: (() => void) | null; onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null; onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<SpeechAlt> & { isFinal?: boolean }> }) => void) | null; phrases?: unknown; };
type SpeechCtor = new () => SpeechRecognitionLike;
type VoiceState = 'idle' | 'loading' | 'ready' | 'unavailable';
type VoiceMessage = { type?: string; id?: string; buffer?: ArrayBuffer; message?: string; voice?: string; engine?: string };

const RADIO_LEVEL = { listening: 0.02, thinking: 0.04, speaking: 0.015 } as const;
const COMMAND_PHRASES = ['WaveAtlas', 'Atlas', 'tune to', 'play', 'listen to', 'switch to', 'Premier FM', 'Radio Nigeria', 'Wazobia FM', 'Agidigbo FM'];
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function recognitionConstructor(): SpeechCtor | null { if (typeof window === 'undefined') return null; const w = window as typeof window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null; }
function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function stationContext(station: Station | null) { return station ? { name: station.name, country: station.country, country_code: station.country_code, city: station.city, state: station.state, language: station.language, tags: station.tags, codec: station.codec, bitrate: station.bitrate } : null; }
function normalizeActionResult(value: AtlasActionResult | boolean | undefined): AtlasActionResult { if (typeof value === 'boolean') return { ok: value, status: value ? 'completed' : 'failed' }; return value ?? { ok: false, status: 'failed' }; }

export function AtlasAssistant({ station, onAction }: Props) {
  const [open, setOpen] = useState(false); const [textMode, setTextMode] = useState(false); const [question, setQuestion] = useState('');
  const [lines, setLines] = useState<AtlasConversationLine[]>([{ role: 'atlas', text: 'I’m Atlas. Tell me what you want to hear.' }]);
  const [status, setStatus] = useState('Tap the signal and speak'); const [listening, setListening] = useState(false); const [busy, setBusy] = useState(false); const [speaking, setSpeaking] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle'); const [voiceLabel, setVoiceLabel] = useState('OMOLUABI PAUL · LOCAL');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null); const voiceWorkerRef = useRef<Worker | null>(null); const voiceStateRef = useRef<VoiceState>('idle'); const linesRef = useRef(lines); const openRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null); const sourceRef = useRef<AudioBufferSourceNode | null>(null); const vocabularyRef = useRef<string[]>(COMMAND_PHRASES); const retryLocaleRef = useRef(false); const activateRef = useRef<() => void>(() => undefined);

  useEffect(() => { linesRef.current = lines; }, [lines]); useEffect(() => { openRef.current = open; }, [open]); useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  function radio(command: 'duck' | 'restore', value?: number) { window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback', { detail: { command, ...(typeof value === 'number' ? { value } : {}) } })); }
  function stopOutput() { try { sourceRef.current?.stop(); } catch {} sourceRef.current = null; window.speechSynthesis?.cancel(); setSpeaking(false); }
  function closeAtlas() { recognitionRef.current?.abort(); recognitionRef.current = null; stopOutput(); radio('restore'); setListening(false); setBusy(false); setOpen(false); }

  async function loadVocabulary() { try { const response = await fetch('/api/atlas-speech/vocabulary', { cache: 'force-cache' }); if (!response.ok) return; const data = await response.json() as { phrases?: string[] }; if (Array.isArray(data.phrases)) vocabularyRef.current = Array.from(new Set([...COMMAND_PHRASES, ...data.phrases])).slice(0, 700); } catch {} }
  function warmVoice() {
    if (voiceStateRef.current !== 'idle' || typeof Worker === 'undefined') return;
    setVoiceState('loading'); voiceStateRef.current = 'loading'; setVoiceLabel('OMOLUABI PAUL · PREPARING');
    try {
      const worker = new Worker('/atlas-v2-voice-worker.mjs', { type: 'module' }); voiceWorkerRef.current = worker;
      worker.onmessage = (event: MessageEvent<VoiceMessage>) => { const message = event.data; if (message.type === 'ready') { setVoiceState('ready'); voiceStateRef.current = 'ready'; setVoiceLabel('OMOLUABI PAUL · READY'); } if (message.type === 'unavailable') { setVoiceState('unavailable'); voiceStateRef.current = 'unavailable'; setVoiceLabel('DEVICE VOICE · FALLBACK'); } };
      worker.onerror = () => { setVoiceState('unavailable'); voiceStateRef.current = 'unavailable'; setVoiceLabel('DEVICE VOICE · FALLBACK'); }; worker.postMessage({ type: 'warm' });
    } catch { setVoiceState('unavailable'); voiceStateRef.current = 'unavailable'; setVoiceLabel('DEVICE VOICE · FALLBACK'); }
  }
  async function voiceContext() { const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!Ctx) return null; if (!audioRef.current || audioRef.current.state === 'closed') audioRef.current = new Ctx({ latencyHint: 'interactive' }); if (audioRef.current.state === 'suspended') await audioRef.current.resume().catch(() => undefined); return audioRef.current; }
  async function speakDevice(text: string) { if (!('speechSynthesis' in window)) return false; return new Promise<boolean>((resolve) => { const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-NG'; utterance.rate = 0.98; const voices = window.speechSynthesis.getVoices(); utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === 'en-ng') ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ?? null; utterance.onend = () => resolve(true); utterance.onerror = () => resolve(false); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); }); }
  async function speakOmoluabi(text: string) {
    warmVoice(); const started = Date.now(); while (voiceStateRef.current === 'loading' && Date.now() - started < 30000) { setStatus('Preparing Omoluabi Paul…'); await sleep(250); }
    if (voiceStateRef.current !== 'ready' || !voiceWorkerRef.current) return false; const id = `atlas-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise<boolean>((resolve) => { const worker = voiceWorkerRef.current!; const timer = window.setTimeout(() => { worker.removeEventListener('message', handler); resolve(false); }, 30000); const handler = async (event: MessageEvent<VoiceMessage>) => { if (event.data.id !== id) return; if (event.data.type === 'error') { window.clearTimeout(timer); worker.removeEventListener('message', handler); resolve(false); return; } if (event.data.type !== 'audio' || !event.data.buffer) return; window.clearTimeout(timer); worker.removeEventListener('message', handler); try { const context = await voiceContext(); if (!context) { resolve(false); return; } const decoded = await context.decodeAudioData(event.data.buffer.slice(0)); const source = context.createBufferSource(); source.buffer = decoded; source.connect(context.destination); sourceRef.current = source; source.onended = () => { if (sourceRef.current === source) sourceRef.current = null; resolve(true); }; source.start(); } catch { resolve(false); } }; worker.addEventListener('message', handler); worker.postMessage({ type: 'speak', id, text }); });
  }
  async function speak(text: string) { stopOutput(); setSpeaking(true); setStatus('Speaking'); radio('duck', RADIO_LEVEL.speaking); const cloned = await speakOmoluabi(text); if (!cloned) { setVoiceLabel('DEVICE VOICE · FALLBACK'); await speakDevice(text); } setSpeaking(false); radio('restore'); if (openRef.current && !textMode) window.setTimeout(() => startListening(), 220); }
  async function resolveSpeech(alternatives: SpeechAlt[]) { const usable = alternatives.filter((item) => item.transcript?.trim()).slice(0, 8); if (!usable.length) return ''; try { const response = await fetch('/api/atlas-speech/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alternatives: usable }) }); if (response.ok) { const data = await response.json() as { transcript?: string }; if (data.transcript?.trim()) return data.transcript.trim(); } } catch {} return usable[0].transcript.trim(); }

  async function askAtlas(text: string, fromVoice = false) {
    const clean = text.trim(); if (!clean || busy) return; setBusy(true); setListening(false); radio('duck', RADIO_LEVEL.thinking); setStatus('Thinking');
    const history = [...linesRef.current, { role: 'user' as const, text: clean }].slice(-12); setLines(history); linesRef.current = history;
    try {
      const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: clean, context: { station: stationContext(station), history } }) }); if (!response.ok) throw new Error('Atlas brain unavailable');
      const reply = await response.json() as { answer?: string; action?: AtlasAssistantAction }; let answer = reply.answer?.trim() || 'I heard you.';
      if (reply.action && onAction) { const outcome = normalizeActionResult(await onAction(reply.action)); if (outcome.message) answer = outcome.message; else if (!outcome.ok) answer = 'I understood the instruction, but WaveAtlas could not complete it.'; }
      const next = [...history, { role: 'atlas' as const, text: answer }].slice(-12); setLines(next); linesRef.current = next; setStatus('Ready'); if (fromVoice) await speak(answer); else radio('restore');
    } catch { const answer = 'I heard you, but the Atlas brain did not complete that request. Try it once more.'; const next = [...history, { role: 'atlas' as const, text: answer }].slice(-12); setLines(next); linesRef.current = next; setStatus('Try again'); radio('restore'); if (fromVoice) await speak(answer); }
    finally { setBusy(false); }
  }

  function applyBias(recognition: SpeechRecognitionLike) { try { const w = window as typeof window & { SpeechRecognitionPhrase?: new (phrase: string, boost?: number) => unknown }; if (!w.SpeechRecognitionPhrase || !('phrases' in recognition)) return; const Phrase = w.SpeechRecognitionPhrase; recognition.phrases = vocabularyRef.current.slice(0, 500).map((phrase) => new Phrase(phrase, /fm|am|radio|atlas/i.test(phrase) ? 5.5 : 3.2)); } catch {} }
  function startListening(locale = 'en-NG') {
    if (!openRef.current || busy || speaking) return; const Ctor = recognitionConstructor(); if (!Ctor) { setStatus('Voice recognition is unavailable in this browser'); return; }
    recognitionRef.current?.abort(); const recognition = new Ctor(); recognitionRef.current = recognition; recognition.lang = locale; recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 8; applyBias(recognition);
    recognition.onstart = () => { setListening(true); setStatus('Listening'); radio('duck', RADIO_LEVEL.listening); };
    recognition.onresult = async (event) => { const result = event.results[event.resultIndex] ?? event.results[0]; const alternatives: SpeechAlt[] = []; if (result) for (let i = 0; i < result.length; i += 1) if (result[i]?.transcript) alternatives.push({ transcript: result[i].transcript, confidence: result[i].confidence }); recognition.onend = null; recognition.stop(); setListening(false); setStatus('Understanding'); const resolved = await resolveSpeech(alternatives); if (resolved) await askAtlas(resolved, true); else { setStatus('I did not catch that'); radio('restore'); } };
    recognition.onerror = (event) => { setListening(false); radio('restore'); if (!retryLocaleRef.current && locale === 'en-NG' && /language|not-supported|service-not-allowed/i.test(event.error || '')) { retryLocaleRef.current = true; window.setTimeout(() => startListening('en-US'), 120); return; } setStatus(event.error === 'not-allowed' ? 'Microphone permission is required' : 'I did not catch that. Tap and try again.'); };
    recognition.onend = () => { setListening(false); radio('restore'); }; try { recognition.start(); } catch { setStatus('Tap again to speak'); radio('restore'); }
  }
  function activate() { retryLocaleRef.current = false; setOpen(true); setTextMode(false); openRef.current = true; setStatus('Preparing Atlas'); void loadVocabulary(); warmVoice(); void voiceContext(); if (isIOS() && 'speechSynthesis' in window) { try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; window.speechSynthesis.speak(u); } catch {} } window.setTimeout(() => startListening(), 180); }
  activateRef.current = activate;

  useEffect(() => { const openVoice = () => activateRef.current(); const intercept = (event: MouseEvent) => { const button = event.target instanceof Element ? event.target.closest('button') : null; if (!button) return; const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`; if (!/push to talk voice command|push to talk|microphone blocked/i.test(label)) return; event.preventDefault(); event.stopPropagation(); activateRef.current(); }; window.addEventListener('waveatlas:open-atlas-voice', openVoice); document.addEventListener('click', intercept, true); return () => { window.removeEventListener('waveatlas:open-atlas-voice', openVoice); document.removeEventListener('click', intercept, true); recognitionRef.current?.abort(); voiceWorkerRef.current?.terminate(); try { sourceRef.current?.stop(); } catch {} void audioRef.current?.close(); }; }, []);
  function submit(event: FormEvent) { event.preventDefault(); const value = question.trim(); if (!value) return; setQuestion(''); void askAtlas(value, false); }

  if (!open) return <button type="button" onClick={activate} aria-label="Open Atlas voice" className="fixed bottom-24 right-4 z-[70] grid size-12 place-items-center rounded-full border border-emerald-300/30 bg-[#08111D]/90 text-[#F7F5EF] shadow-xl backdrop-blur md:bottom-8 md:right-8"><Mic className="size-5"/></button>;
  return <div className="fixed inset-0 z-[100] flex flex-col bg-[#08111D]/95 text-[#F7F5EF] backdrop-blur-xl">
    <div className="flex items-center justify-between p-4"><div><div className="text-[10px] font-semibold tracking-[.24em] text-[#D4A64A]">ATLAS VOICE</div><div className="mt-1 text-xs text-white/60">{voiceLabel}</div></div><div className="flex gap-2"><button type="button" onClick={() => setTextMode((v) => !v)} className="rounded-full border border-white/15 p-2" aria-label="Toggle keyboard"><Keyboard className="size-4"/></button><button type="button" onClick={closeAtlas} className="rounded-full border border-white/15 p-2" aria-label="Close Atlas"><X className="size-4"/></button></div></div>
    <div className="flex flex-1 flex-col items-center justify-center px-5 text-center"><button type="button" onClick={() => { if (speaking) { stopOutput(); setStatus('Listening'); } startListening(); }} className={`relative grid size-44 place-items-center rounded-full border transition-all ${listening ? 'scale-105 border-[#00D68F] shadow-[0_0_70px_rgba(0,214,143,.3)]' : speaking ? 'border-[#D4A64A] shadow-[0_0_70px_rgba(212,166,74,.25)]' : 'border-white/15'}`} aria-label="Atlas Signal"><span className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(247,245,239,.65),rgba(78,199,194,.28)_22%,rgba(0,214,143,.25)_48%,rgba(212,166,74,.22)_70%,rgba(8,17,29,.8))]"/><span className="relative"><Volume2 className="size-8"/></span></button><div className="mt-6 text-sm font-medium">{status}</div><div className="mt-2 max-w-sm text-xs leading-5 text-white/45">{station ? `${station.name} · ${station.city || station.state || station.country}` : 'No station selected'}</div><div className="mt-8 max-h-36 w-full max-w-lg overflow-y-auto text-left text-sm text-white/70">{lines.slice(-4).map((line, index) => <div key={`${line.role}-${index}`} className="mb-2"><span className="mr-2 text-[10px] uppercase tracking-wider text-white/35">{line.role}</span>{line.text}</div>)}</div></div>
    {textMode && <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-4"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Tell Atlas what to do…" className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/30"/><button type="submit" disabled={busy} className="grid size-11 place-items-center rounded-full bg-[#00D68F] text-[#08111D]"><Send className="size-4"/></button></form>}
  </div>;
}

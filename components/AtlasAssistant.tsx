"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { AtlasActionResult, AtlasAssistantAction, AtlasAssistantReply, AtlasConversationLine } from '@/lib/atlas-assistant';
import type { Station } from '@/lib/stations';
import { collectSpeechCandidates, nativeSpeechRecognitionConstructor, resolveAtlasSpeech, type AtlasSpeechRecognition } from '@/lib/atlas-speech-runtime';
import { OmoluabiPaulVoice, type OmoluabiVoiceStatus } from '@/lib/atlas-omoluabi-voice';

type Props = { station: Station | null; playbackStatus?: string; onSearch?: (query: string) => void; onAction?: (action: AtlasAssistantAction) => AtlasActionResult | boolean | Promise<AtlasActionResult | boolean> };
type SignalState = 'listening' | 'thinking' | 'speaking' | 'live';
const QUICK_COMMANDS = ['Tune to Premier FM', 'Another station', 'Open the map', 'What am I listening to?'];
const RADIO_FOCUS = { opening: 0.05, listening: 0.02, thinking: 0.04, speaking: 0.015 } as const;
const ASSISTANT_TIMEOUT_MS = 8000;
function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function AtlasSignal({ state, energy, onPress }: { state: SignalState; energy: number; onPress: () => void }) {
  const intensity = Math.max(0.08, Math.min(1, energy));
  return <button type="button" onClick={onPress} aria-label={state === 'speaking' ? 'Interrupt Atlas and listen' : 'Atlas voice signal'} className="atlas-signal relative grid size-[10.5rem] place-items-center rounded-full outline-none transition-transform active:scale-[.97] sm:size-[12rem]">
    <span className="atlas-signal-aura absolute inset-[-18%] rounded-full" style={{ opacity: 0.32 + intensity * 0.42, transform: `scale(${0.94 + intensity * 0.1})` }} aria-hidden="true" />
    <span className="atlas-signal-shell absolute inset-[5%] overflow-hidden rounded-full" aria-hidden="true"><span className="atlas-flow atlas-flow-a absolute -inset-[30%] rounded-[42%_58%_48%_52%]" /><span className="atlas-flow atlas-flow-b absolute -inset-[25%] rounded-[61%_39%_55%_45%]" /><span className="atlas-flow atlas-flow-c absolute inset-[10%] rounded-[48%_52%_38%_62%]" /><span className="atlas-glass absolute inset-0 rounded-full" /><span className="atlas-highlight absolute left-[20%] top-[13%] h-[25%] w-[38%] -rotate-[24deg] rounded-full" /></span>
    <span className="sr-only">Atlas is {state}</span>
  </button>;
}

function actionResultText(result: AtlasActionResult | boolean | undefined, fallback: string) {
  if (!result || result === true) return fallback;
  if (result === false) return 'I could not complete that action.';
  if (result.status === 'playing') return result.station?.name ? `Playing ${result.station.name}${result.station.place ? `, ${result.station.place}` : ''}.` : 'Playing now.';
  if (result.status === 'connecting') return result.station?.name ? `Connecting to ${result.station.name}.` : 'Connecting now.';
  if (result.status === 'already_playing') return result.station?.name ? `${result.station.name} is already playing.` : 'That station is already playing.';
  if (result.status === 'not_found') return result.message || 'I could not find a matching playable station.';
  if (result.status === 'failed') return result.message || 'That station did not connect. Try another one.';
  return result.message || fallback;
}

export function AtlasAssistant({ station, playbackStatus = 'idle', onSearch, onAction }: Props) {
  const initialLines: AtlasConversationLine[] = [{ role: 'atlas', text: 'I’m Atlas. Say a station, place, genre, or tell me what you want the radio to do.' }];
  const [open, setOpen] = useState(false); const [textMode, setTextMode] = useState(false); const [question, setQuestion] = useState(''); const [lines, setLines] = useState<AtlasConversationLine[]>(initialLines); const [busy, setBusy] = useState(false); const [listening, setListening] = useState(false); const [speaking, setSpeaking] = useState(false); const [voiceEnabled, setVoiceEnabled] = useState(true); const [voiceMessage, setVoiceMessage] = useState('Ready'); const [voiceStatus, setVoiceStatus] = useState<OmoluabiVoiceStatus>({ state: 'idle' }); const [signalEnergy, setSignalEnergy] = useState(0.16);
  const inputRef = useRef<HTMLInputElement>(null); const recognitionRef = useRef<AtlasSpeechRecognition | null>(null); const recognitionWatchdogRef = useRef<number | null>(null); const linesRef = useRef(initialLines); const openRef = useRef(false); const busyRef = useRef(false); const voiceEnabledRef = useRef(true); const radioDuckedRef = useRef(false); const voiceRef = useRef<OmoluabiPaulVoice | null>(null); const activateRef = useRef<() => void>(() => undefined);

  useEffect(() => { linesRef.current = lines; }, [lines]); useEffect(() => { openRef.current = open; if (open && textMode) window.setTimeout(() => inputRef.current?.focus(), 80); }, [open, textMode]); useEffect(() => { busyRef.current = busy; }, [busy]); useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { voiceRef.current = new OmoluabiPaulVoice((status) => { setVoiceStatus(status); if (status.state === 'ready') setVoiceMessage('Omoluabi Paul ready'); if (status.state === 'unavailable') setVoiceMessage('Omoluabi Paul unavailable'); }, (energy) => setSignalEnergy(Math.max(0.12, energy))); return () => { voiceRef.current?.destroy(); voiceRef.current = null; }; }, []);
  useEffect(() => { const openAtlas = () => activateRef.current(); const intercept = (event: MouseEvent) => { const target = event.target instanceof Element ? event.target.closest('button') : null; if (!target) return; const label = `${target.getAttribute('aria-label') || ''} ${target.getAttribute('title') || ''}`; if (!/push to talk voice command|push to talk|microphone blocked/i.test(label)) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); activateRef.current(); }; window.addEventListener('waveatlas:open-atlas-voice', openAtlas); document.addEventListener('click', intercept, true); return () => { window.removeEventListener('waveatlas:open-atlas-voice', openAtlas); document.removeEventListener('click', intercept, true); }; }, []);
  useEffect(() => () => { stopRecognition(); restoreRadio(); }, []);

  function sendPlayback(command: 'duck' | 'restore', value?: number) { window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback', { detail: { command, ...(typeof value === 'number' ? { value } : {}) } })); }
  function focusRadio(level: number) { radioDuckedRef.current = true; sendPlayback('duck', playbackStatus === 'playing' ? level : Math.min(level, 0.02)); }
  function restoreRadio() { if (!radioDuckedRef.current) return; radioDuckedRef.current = false; sendPlayback('restore'); }
  function stopRecognition() { if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current); recognitionWatchdogRef.current = null; const recognition = recognitionRef.current; recognitionRef.current = null; if (recognition) { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.onstart = null; try { recognition.abort(); } catch {} } setListening(false); }

  async function speak(text: string) { if (!voiceEnabledRef.current || !text.trim()) return false; stopRecognition(); focusRadio(RADIO_FOCUS.speaking); setSpeaking(true); setVoiceMessage(voiceStatus.state === 'ready' ? 'Omoluabi Paul speaking' : 'Preparing Omoluabi Paul'); const voice = voiceRef.current; if (!voice) { setSpeaking(false); return false; } const spoken = await voice.speak(text); setSpeaking(false); if (!spoken) setVoiceMessage('Reply shown as text. Omoluabi Paul is still preparing.'); return spoken; }
  function currentContext() { return station ? { country: station.country, city: station.city || station.state, stationName: station.name } : undefined; }

  async function ask(rawQuestion: string) {
    const text = rawQuestion.trim(); if (!text || busyRef.current) return; stopRecognition(); setBusy(true); busyRef.current = true; setVoiceMessage('Thinking'); focusRadio(RADIO_FOCUS.thinking); const history = linesRef.current.slice(-10); setLines((current) => [...current, { role: 'user', text }]);
    try { const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS); const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ question: text, context: { station, history } }) }).finally(() => window.clearTimeout(timeout)); if (!response.ok) throw new Error('Atlas request failed'); const reply = await response.json() as AtlasAssistantReply; let finalText = reply.answer; if (reply.action) { const result = onAction ? await onAction(reply.action) : reply.action.type === 'search' && onSearch ? (onSearch(reply.action.query), true) : false; finalText = actionResultText(result, reply.answer); } setLines((current) => [...current, { role: 'atlas', text: finalText }]); await speak(finalText); }
    catch { const message = 'I hit a local runtime problem. Try that instruction again.'; setLines((current) => [...current, { role: 'atlas', text: message }]); setVoiceMessage('Try again'); }
    finally { setBusy(false); busyRef.current = false; if (openRef.current && !textMode) { await sleep(450); listen(); } else restoreRadio(); }
  }

  function listen() {
    if (!openRef.current || busyRef.current || textMode) return; const Recognition = nativeSpeechRecognitionConstructor(); if (!Recognition) { setVoiceMessage('Voice recognition unavailable. Use keyboard mode.'); return; } stopRecognition(); const recognition = new Recognition(); recognitionRef.current = recognition; recognition.lang = navigator.language || 'en-US'; recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 5;
    recognition.onstart = () => { setListening(true); setVoiceMessage('Listening'); focusRadio(RADIO_FOCUS.listening); };
    recognition.onresult = (event) => { const candidates = collectSpeechCandidates(event); if (!candidates.length) return; stopRecognition(); setVoiceMessage('Understanding'); void resolveAtlasSpeech(candidates, currentContext()).then((resolved) => { if (!resolved?.transcript) { setVoiceMessage('I did not catch that'); window.setTimeout(() => listen(), 500); return; } void ask(resolved.transcript); }); };
    recognition.onerror = (event) => { const error = event.error || ''; stopRecognition(); if (error === 'not-allowed' || error === 'service-not-allowed') { setVoiceMessage('Microphone permission is blocked'); return; } if (error === 'no-speech' || error === 'aborted') { setVoiceMessage('Listening'); window.setTimeout(() => listen(), 650); return; } setVoiceMessage('Voice recognition interrupted'); };
    recognition.onend = () => { setListening(false); };
    try { recognition.start(); recognitionWatchdogRef.current = window.setTimeout(() => { if (recognitionRef.current !== recognition) return; stopRecognition(); setVoiceMessage('Reconnecting microphone'); window.setTimeout(() => listen(), 900); }, 12000); } catch { stopRecognition(); setVoiceMessage('Tap the signal to try again'); }
  }

  function activateAtlas() { stopRecognition(); setOpen(true); openRef.current = true; setTextMode(false); setVoiceMessage('Opening Atlas'); focusRadio(RADIO_FOCUS.opening); const voice = voiceRef.current; if (voice) { void voice.primeAudio(); void voice.prepare(); } window.setTimeout(() => listen(), 260); }
  activateRef.current = activateAtlas;
  function closeAtlas() { stopRecognition(); void voiceRef.current?.stop(); restoreRadio(); setOpen(false); openRef.current = false; setSpeaking(false); setBusy(false); busyRef.current = false; }
  function handleSignalPress() { if (speaking) { void voiceRef.current?.stop().then(() => { setSpeaking(false); window.setTimeout(() => listen(), 350); }); return; } if (listening) { stopRecognition(); setVoiceMessage('Paused'); return; } listen(); }
  function submit(event: FormEvent) { event.preventDefault(); const text = question.trim(); if (!text) return; setQuestion(''); void ask(text); }
  const signalState: SignalState = speaking ? 'speaking' : busy ? 'thinking' : listening ? 'listening' : 'live'; const progress = voiceStatus.progress != null ? `${Math.round(voiceStatus.progress * 100)}%` : '';

  return <>{open ? <div className="fixed inset-0 z-[140] flex min-h-[100dvh] flex-col overflow-hidden bg-[#030812] text-white" role="dialog" aria-modal="true" aria-label="Atlas voice mode"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,214,143,.16),transparent_24%),radial-gradient(circle_at_38%_58%,rgba(78,199,194,.11),transparent_28%),radial-gradient(circle_at_65%_50%,rgba(212,166,74,.10),transparent_24%)]" />
    <header className="relative z-10 flex items-center justify-between px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-8"><div><p className="text-[10px] font-black uppercase tracking-[.32em] text-radio">Atlas Voice</p><p className="mt-1 text-sm font-semibold text-white/72">Omoluabi Paul · local & keyless</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => { stopRecognition(); setTextMode((value) => !value); }} className="grid size-10 place-items-center rounded-full border border-white/12 bg-white/[.06] text-white/80" aria-label="Toggle keyboard mode"><Keyboard className="size-4" /></button><button type="button" onClick={closeAtlas} className="grid size-10 place-items-center rounded-full border border-white/12 bg-white/[.06] text-white/80" aria-label="Close Atlas"><X className="size-4" /></button></div></header>
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"><AtlasSignal state={signalState} energy={signalEnergy} onPress={handleSignalPress} /><p className="mt-7 text-[11px] font-black uppercase tracking-[.28em] text-radio/85">{speaking ? 'Speaking' : busy ? 'Thinking' : listening ? 'Listening' : 'Ready'}</p><p className="mt-2 max-w-md text-center text-sm text-white/62">{voiceMessage}{progress && voiceStatus.state === 'loading' ? ` · ${progress}` : ''}</p>{voiceStatus.state === 'loading' || voiceStatus.state === 'cloning' ? <p className="mt-2 max-w-sm text-center text-[11px] text-gold/70">First use downloads the free local voice model once. Later sessions use the browser cache.</p> : null}
      <div className="mt-8 w-full max-w-xl space-y-3 overflow-y-auto rounded-[1.6rem] border border-white/10 bg-white/[.035] p-4 shadow-2xl backdrop-blur-xl">{lines.slice(-6).map((line, index) => <div key={`${line.role}-${index}`} className={line.role === 'user' ? 'ml-auto max-w-[86%] rounded-2xl bg-radio/14 px-4 py-3 text-sm text-white' : 'max-w-[92%] rounded-2xl bg-white/[.055] px-4 py-3 text-sm leading-relaxed text-white/78'}>{line.text}</div>)}</div>
      {textMode ? <form onSubmit={submit} className="mt-4 flex w-full max-w-xl items-center gap-2 rounded-2xl border border-white/12 bg-white/[.055] p-2"><input ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask Atlas or type a radio command" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/35" /><button type="submit" disabled={!question.trim() || busy} className="grid size-10 place-items-center rounded-xl bg-radio text-midnight disabled:opacity-35" aria-label="Send"><Send className="size-4" /></button></form> : <div className="mt-4 flex max-w-xl flex-wrap justify-center gap-2">{QUICK_COMMANDS.map((command) => <button key={command} type="button" onClick={() => void ask(command)} className="rounded-full border border-white/10 bg-white/[.045] px-3 py-2 text-xs font-semibold text-white/62 hover:text-white">{command}</button>)}</div>}
      <div className="mt-5 flex items-center gap-3"><button type="button" onClick={() => setVoiceEnabled((value) => !value)} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.045] px-3 py-2 text-xs font-bold text-white/65">{voiceEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}{voiceEnabled ? 'Voice on' : 'Voice off'}</button><span className="flex items-center gap-2 text-xs text-white/38">{listening ? <Mic className="size-3.5 text-radio" /> : <MicOff className="size-3.5" />}{station?.name || 'No station selected'}</span></div>
    </main></div> : null}</>;
}

export default AtlasAssistant;

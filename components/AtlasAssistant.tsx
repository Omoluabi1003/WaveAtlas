"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { AtlasActionResult, AtlasAssistantAction, AtlasConversationLine } from '@/lib/atlas-assistant';
import { waitForAtlasPersonalVoice } from '@/lib/atlas-voice-readiness';
import type { Station } from '@/lib/stations';
import { getSpeechRecognitionConstructor, type BrowserSpeechRecognition } from '@/lib/voice-command-engine';

type Props = {
  station: Station | null;
  playbackStatus?: string;
  onSearch?: (query: string) => void;
  onAction?: (action: AtlasAssistantAction) => AtlasActionResult | boolean | Promise<AtlasActionResult | boolean>;
};
type Line = AtlasConversationLine;
type NeuralVoiceState = 'idle' | 'loading' | 'ready' | 'unavailable';
type NeuralMessage = { type?: 'loading' | 'progress' | 'ready' | 'unavailable' | 'audio' | 'error'; id?: string; buffer?: ArrayBuffer; message?: string; label?: string; loaded?: number; total?: number; engine?: string; voiceSource?: string };
type PendingNeural = { resolve: (message: NeuralMessage) => void; reject: (error: Error) => void; timer: number };
type AudioSessionKind = 'auto' | 'playback' | 'play-and-record' | 'ambient';
type AudioSessionLike = { type: AudioSessionKind; state?: string };
type SignalState = 'listening' | 'thinking' | 'speaking' | 'live';

const QUICK_COMMANDS = ['Surprise me', 'Play jazz', 'Open the map', 'What am I listening to?'];
const RADIO_FOCUS = { opening: 0.05, listening: 0.02, thinking: 0.04, speaking: 0.015 } as const;
const ASSISTANT_TIMEOUT_MS = 8000;

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function isIOSFamily() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function audioSession() { return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession; }
function setAudioSession(type: AudioSessionKind) { try { const session = audioSession(); if (session) session.type = type; } catch { /* Progressive enhancement only. */ } }


function AtlasSignal({ state, energy, onPress }: { state: SignalState; energy: number; onPress: () => void }) {
  const intensity = Math.max(0.08, Math.min(1, energy));
  return <button type="button" onClick={onPress} aria-label={state === 'speaking' ? 'Interrupt Atlas and listen' : 'Atlas voice signal'} className="atlas-signal relative grid size-[10.5rem] place-items-center rounded-full outline-none transition-transform active:scale-[.97] sm:size-[12rem]">
    <span className="atlas-signal-aura absolute inset-[-18%] rounded-full" style={{ opacity: 0.32 + intensity * 0.42, transform: `scale(${0.94 + intensity * 0.1})` }} aria-hidden="true" />
    <span className="atlas-signal-shell absolute inset-[5%] overflow-hidden rounded-full" aria-hidden="true">
      <span className="atlas-flow atlas-flow-a absolute -inset-[30%] rounded-[42%_58%_48%_52%]" />
      <span className="atlas-flow atlas-flow-b absolute -inset-[25%] rounded-[61%_39%_55%_45%]" />
      <span className="atlas-flow atlas-flow-c absolute inset-[10%] rounded-[48%_52%_38%_62%]" />
      <span className="atlas-glass absolute inset-0 rounded-full" />
      <span className="atlas-highlight absolute left-[20%] top-[13%] h-[25%] w-[38%] -rotate-[24deg] rounded-full" />
    </span>
    <span className="sr-only">Atlas is {state}</span>
  </button>;
}

export function AtlasAssistant({ station, playbackStatus = 'idle', onSearch, onAction }: Props) {
  const initialLines: Line[] = [{ role: 'atlas', text: 'I’m Atlas. Talk to me about this signal, or tell me where you want to go.' }];
  const [open, setOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [question, setQuestion] = useState('');
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceMessage, setVoiceMessage] = useState('Listening');
  const [voiceOutput, setVoiceOutput] = useState<'personal' | 'unavailable' | null>(null);
  const [voiceProgress, setVoiceProgress] = useState('');
  const [neuralState, setNeuralState] = useState<NeuralVoiceState>('idle');
  const [signalEnergy, setSignalEnergy] = useState(0.18);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionWatchdogRef = useRef<number | null>(null);
  const openRef = useRef(false);
  const conversationModeRef = useRef(false);
  const busyRef = useRef(false);
  const voiceEnabledRef = useRef(true);
  const neuralStateRef = useRef<NeuralVoiceState>('idle');
  const linesRef = useRef<Line[]>(initialLines);
  const neuralLoadTimerRef = useRef<number | null>(null);
  const neuralWorkerRef = useRef<Worker | null>(null);
  const neuralPendingRef = useRef(new Map<string, PendingNeural>());
  const voiceContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const radioDuckedRef = useRef(false);
  const spokenStatusRef = useRef<string | null>(null);
  const outputGenerationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const activateRef = useRef<() => void>(() => undefined);

  useEffect(() => { openRef.current = open; if (open && textMode) setTimeout(() => inputRef.current?.focus(), 80); }, [open, textMode]);
  useEffect(() => { conversationModeRef.current = conversationMode; }, [conversationMode]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { neuralStateRef.current = neuralState; }, [neuralState]);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.getVoices();
    const load = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, []);
  useEffect(() => {
    const openAtlas = () => activateRef.current();
    const interceptExistingVoiceButton = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!target) return;
      const label = `${target.getAttribute('aria-label') || ''} ${target.getAttribute('title') || ''}`;
      if (!/push to talk voice command|push to talk|microphone blocked/i.test(label)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); activateRef.current();
    };
    window.addEventListener('waveatlas:open-atlas-voice', openAtlas);
    document.addEventListener('click', interceptExistingVoiceButton, true);
    return () => { window.removeEventListener('waveatlas:open-atlas-voice', openAtlas); document.removeEventListener('click', interceptExistingVoiceButton, true); };
  }, []);
  useEffect(() => () => {
    requestControllerRef.current?.abort();
    outputGenerationRef.current += 1;
    recognitionRef.current?.abort();
    if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current);
    if (meterFrameRef.current) window.cancelAnimationFrame(meterFrameRef.current);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    try { voiceSourceRef.current?.stop(); } catch { /* Already stopped. */ }
    if (neuralLoadTimerRef.current) window.clearTimeout(neuralLoadTimerRef.current);
    void voiceContextRef.current?.close(); neuralWorkerRef.current?.terminate();
    neuralPendingRef.current.forEach(({ reject, timer }) => { window.clearTimeout(timer); reject(new Error('Atlas voice closed')); });
    neuralPendingRef.current.clear(); restoreRadio();
  }, []);

  function sendPlayback(command: 'play' | 'pause' | 'volume' | 'duck' | 'restore', value?: number) { window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback', { detail: { command, ...(typeof value === 'number' ? { value } : {}) } })); }
  function focusRadio(level: number) { radioDuckedRef.current = true; sendPlayback('duck', playbackStatus === 'playing' ? level : Math.min(level, 0.02)); }
  function restoreRadio() { if (!radioDuckedRef.current) return; radioDuckedRef.current = false; sendPlayback('restore'); }
  function stopRecognitionWatchdog() { if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current); recognitionWatchdogRef.current = null; }
  function stopMeter() { if (meterFrameRef.current) window.cancelAnimationFrame(meterFrameRef.current); meterFrameRef.current = null; setSignalEnergy(0.18); }
  function getVoiceContext() {
    if (typeof window === 'undefined') return null;
    if (voiceContextRef.current && voiceContextRef.current.state !== 'closed') return voiceContextRef.current;
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    voiceContextRef.current = new Context({ latencyHint: 'interactive' }); return voiceContextRef.current;
  }
  async function resumeVoiceContext() { const context = getVoiceContext(); if (!context) return null; if (context.state === 'suspended' || String(context.state) === 'interrupted') { try { await context.resume(); } catch { return null; } } return context; }
  async function primeVoiceOutput() { const context = await resumeVoiceContext(); if (!context) return false; try { const source = context.createBufferSource(); source.buffer = context.createBuffer(1, 1, context.sampleRate); source.connect(context.destination); source.start(0); return true; } catch { return false; } }
  function stopVoiceOutput() { outputGenerationRef.current += 1; neuralWorkerRef.current?.postMessage({ type: 'cancel' }); neuralPendingRef.current.forEach(({ reject, timer }) => { window.clearTimeout(timer); reject(new Error('Speech interrupted')); }); neuralPendingRef.current.clear(); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); try { voiceSourceRef.current?.stop(); } catch { /* Already stopped. */ } voiceSourceRef.current = null; stopMeter(); setSpeaking(false); }
  async function prepareAudiblePlayback() { const session = audioSession(); if (session) { try { session.type = 'ambient'; await sleep(0); session.type = 'playback'; } catch { /* Keep normal output path. */ } } return resumeVoiceContext(); }
  function meterAnalyser(analyser: AnalyserNode) {
    stopMeter(); analyser.fftSize = 256; const samples = new Uint8Array(analyser.fftSize);
    const frame = () => { analyser.getByteTimeDomainData(samples); let sum = 0; for (const sample of samples) { const normalized = (sample - 128) / 128; sum += normalized * normalized; } const rms = Math.sqrt(sum / samples.length); setSignalEnergy(Math.min(1, 0.16 + rms * 5.5)); meterFrameRef.current = window.requestAnimationFrame(frame); };
    frame();
  }
  async function playVoiceBuffer(buffer: ArrayBuffer, generation = outputGenerationRef.current) {
    if (generation !== outputGenerationRef.current || !openRef.current) return false;
    const context = await prepareAudiblePlayback(); if (!context) return false;
    try {
      const decoded = await context.decodeAudioData(buffer.slice(0)); if (generation !== outputGenerationRef.current || !openRef.current) return false; const source = context.createBufferSource(); const compressor = context.createDynamicsCompressor(); const gain = context.createGain(); const analyser = context.createAnalyser();
      gain.gain.value = 1.24; compressor.threshold.value = -10; compressor.knee.value = 16; compressor.ratio.value = 3;
      source.buffer = decoded; source.connect(compressor); compressor.connect(gain); gain.connect(analyser); analyser.connect(context.destination);
      voiceSourceRef.current = source; setSpeaking(true); setVoiceMessage(spokenStatusRef.current || 'Speaking'); focusRadio(RADIO_FOCUS.speaking); meterAnalyser(analyser);
      return await new Promise<boolean>((resolve) => { source.onended = () => { if (voiceSourceRef.current === source) voiceSourceRef.current = null; stopMeter(); resolve(true); }; try { source.start(0); } catch { stopMeter(); resolve(false); } });
    } catch { stopMeter(); return false; }
  }

  function warmNeuralVoice() {
    if (typeof window === 'undefined') { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; return; }
    if (!('Worker' in window)) { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; setVoiceProgress('This browser cannot run personal voice workers'); return; }
    if (neuralStateRef.current !== 'idle') return;
    setNeuralState('loading'); neuralStateRef.current = 'loading';
    try {
      const worker = new Worker('/atlas-neural-voice-worker.mjs', { type: 'module' }); neuralWorkerRef.current = worker;
      neuralLoadTimerRef.current = window.setTimeout(() => { worker.terminate(); neuralWorkerRef.current = null; setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; setVoiceProgress('Voice preparation timed out. Reopen Atlas to retry.'); }, 120000);
      worker.onmessage = (event: MessageEvent<NeuralMessage>) => { const message = event.data; if (message.type === 'progress') { setVoiceProgress(message.total ? `${message.label || 'Preparing voice'} · ${Math.min(100, Math.round((message.loaded || 0) / message.total * 100))}%` : message.label || 'Preparing your voice'); return; } if (message.type === 'ready') { if (neuralLoadTimerRef.current) window.clearTimeout(neuralLoadTimerRef.current); setVoiceProgress(''); setNeuralState('ready'); neuralStateRef.current = 'ready'; return; } if (message.type === 'unavailable') { if (neuralLoadTimerRef.current) window.clearTimeout(neuralLoadTimerRef.current); setVoiceProgress(message.message || 'Personal voice unavailable on this device'); setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; return; } if (!message.id) return; const pending = neuralPendingRef.current.get(message.id); if (!pending) return; window.clearTimeout(pending.timer); neuralPendingRef.current.delete(message.id); if (message.type === 'audio') pending.resolve(message); else pending.reject(new Error(message.message || 'Neural voice unavailable')); };
      worker.onerror = () => { if (neuralLoadTimerRef.current) window.clearTimeout(neuralLoadTimerRef.current); setVoiceProgress('Personal voice unavailable on this device'); setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; neuralPendingRef.current.forEach(({ reject, timer }) => { window.clearTimeout(timer); reject(new Error('Personal voice worker failed')); }); neuralPendingRef.current.clear(); }; worker.postMessage({ type: 'warm' });
    } catch { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; }
  }
  async function waitForNeuralVoice() {
    const generation = outputGenerationRef.current;
    if (neuralStateRef.current === 'idle') warmNeuralVoice();
    if (neuralStateRef.current === 'loading') setVoiceMessage('Preparing Omoluabi voice · your answer is ready');
    return waitForAtlasPersonalVoice({
      state: () => neuralStateRef.current,
      active: () => generation === outputGenerationRef.current && openRef.current,
      wait: sleep,
    });
  }
  async function speakNeural(text: string) {
    const generation = outputGenerationRef.current;
    const worker = neuralWorkerRef.current; if (!worker || neuralStateRef.current !== 'ready') return false; setVoiceProgress(''); setVoiceMessage('Generating Omoluabi voice'); const id = `atlas-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { const message = await new Promise<NeuralMessage>((resolve, reject) => { const timer = window.setTimeout(() => { neuralPendingRef.current.delete(id); worker.postMessage({ type: 'cancel' }); reject(new Error('Omoluabi voice took too long to generate. Your answer is in the transcript.')); }, 60000); neuralPendingRef.current.set(id, { resolve, reject, timer }); worker.postMessage({ type: 'speak', id, text }); }); if (message.engine !== 'pocket-tts-omoluabi-paul' || message.voiceSource !== 'repository-canonical') throw new Error('Personal voice identity could not be verified'); if (!message.buffer) return false; const spoken = await playVoiceBuffer(message.buffer, generation); if (spoken) setVoiceOutput('personal'); return spoken; } catch (error) { if (generation === outputGenerationRef.current) setVoiceProgress(error instanceof Error ? error.message : 'Omoluabi voice generation failed'); return false; }
  }
  async function speak(text: string, terminal = false, statusLabel?: string) {
    const generation = outputGenerationRef.current;
    spokenStatusRef.current = statusLabel || null;
    if (!voiceEnabledRef.current) { spokenStatusRef.current = null; if (terminal) endConversation(); else restoreRadio(); return; }
    recognitionRef.current?.abort(); recognitionRef.current = null; stopRecognitionWatchdog(); setListening(false); focusRadio(RADIO_FOCUS.speaking);
    let spoken = false; if (await waitForNeuralVoice()) spoken = await speakNeural(text); if (generation !== outputGenerationRef.current || !openRef.current) return;
    if (generation !== outputGenerationRef.current || !openRef.current) return;
    setSpeaking(false);
    if (!spoken) {
      setVoiceOutput('unavailable'); setVoiceMessage('Omoluabi voice unavailable · answer is in transcript');
      setTextMode(true); setAudioSession('playback'); restoreRadio();
      spokenStatusRef.current = null;
      return;
    }
    if (terminal && openRef.current) {
      setVoiceMessage(statusLabel || text); spokenStatusRef.current = null; setAudioSession('playback'); await sleep(spoken ? 220 : 500); endConversation(); return;
    }
    spokenStatusRef.current = null;
    if (conversationModeRef.current && openRef.current) {
      setVoiceMessage(spoken ? 'Listening' : 'Listening · answer is in transcript');
      setAudioSession('play-and-record'); focusRadio(RADIO_FOCUS.listening);
      window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, isIOSFamily() ? 650 : 350);
    } else { setVoiceMessage('Omoluabi voice ready'); setAudioSession('playback'); restoreRadio(); }
  }
  function endConversation() { requestControllerRef.current?.abort(); conversationModeRef.current = false; setConversationMode(false); recognitionRef.current?.abort(); recognitionRef.current = null; stopRecognitionWatchdog(); stopVoiceOutput(); setListening(false); setAudioSession('playback'); restoreRadio(); openRef.current = false; setOpen(false); setTextMode(false); }

  async function ask(text: string) {
    const value = text.trim(); if (!value || busyRef.current) return; stopVoiceOutput();
    const history = linesRef.current.slice(-8);
    const userLine: Line = { role: 'user', text: value };
    linesRef.current = [...linesRef.current, userLine]; setLines(linesRef.current); setQuestion(''); setBusy(true); busyRef.current = true; setSignalEnergy(0.34); setVoiceMessage('Thinking'); focusRadio(RADIO_FOCUS.thinking);
    const controller = new AbortController(); requestControllerRef.current = controller; const timeout = window.setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS);
    try {
      const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ question: value, context: { station, history } }) });
      if (!response.ok) throw new Error(`Atlas assistant ${response.status}`);
      if (controller.signal.aborted) return;
      const data = await response.json() as { answer?: string; action?: AtlasAssistantAction }; window.clearTimeout(timeout); let answer = data.answer || 'I could not answer that from the Atlas yet.';
      let terminalAction = false; let statusLabel: string | undefined;
      if (data.action) {
        try {
          const outcome = await onAction?.(data.action);
          if (outcome === false) answer = `${answer} I could not complete that action.`;
          else if (outcome && typeof outcome === 'object') {
            const result = outcome as AtlasActionResult;
            if (result.message) answer = result.message;
            else if (!result.ok) answer = `${answer} I could not complete that action.`;
            terminalAction = Boolean(result.terminal);
            if (result.status === 'playing' || result.status === 'connecting' || result.status === 'already_playing') statusLabel = result.message || answer;
          }
        } catch { answer = `${answer} I could not complete that action.`; }
      }
      if (controller.signal.aborted) return;
      const atlasLine: Line = { role: 'atlas', text: answer }; linesRef.current = [...linesRef.current, atlasLine]; setLines(linesRef.current);
      if (statusLabel) setVoiceMessage(statusLabel);
      if (voiceEnabledRef.current) void speak(answer, terminalAction, statusLabel); else if (terminalAction) window.setTimeout(endConversation, 450); else restoreRadio();
    } catch {
      if (controller.signal.aborted && !openRef.current) return;
      const answer = 'I lost that request for a moment, but I’m still here.'; const atlasLine: Line = { role: 'atlas', text: answer }; linesRef.current = [...linesRef.current, atlasLine]; setLines(linesRef.current); if (voiceEnabledRef.current) void speak(answer); else restoreRadio();
    } finally { window.clearTimeout(timeout); setBusy(false); busyRef.current = false; setSignalEnergy(0.18); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }
  async function listen(fromConversation = false) {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!fromConversation) { conversationModeRef.current = true; setConversationMode(true); }
    stopVoiceOutput(); focusRadio(RADIO_FOCUS.listening); setAudioSession('play-and-record'); const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { setVoiceMessage('Voice input is unavailable'); setTextMode(true); restoreRadio(); return; }
    setVoiceMessage('Listening'); setSignalEnergy(0.24);
    try {
      await sleep(fromConversation ? 300 : 80); if (!conversationModeRef.current || !openRef.current) return; const recognition = new Recognition(); recognitionRef.current = recognition; let receivedResult = false;
      recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => { setListening(true); setVoiceMessage('Listening'); stopRecognitionWatchdog(); recognitionWatchdogRef.current = window.setTimeout(() => { recognition.abort(); if (recognitionRef.current === recognition) recognitionRef.current = null; setListening(false); setVoiceMessage('Reconnecting'); }, 12000); };
      recognition.onend = () => { if (recognitionRef.current !== recognition) return; stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null; if (!receivedResult && conversationModeRef.current && openRef.current) window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 650); };
      recognition.onerror = (event) => { if (recognitionRef.current !== recognition) return; stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null; const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed'; if (denied) { conversationModeRef.current = false; setConversationMode(false); setAudioSession('playback'); setVoiceMessage('Microphone access is blocked'); setTextMode(true); restoreRadio(); } else if (conversationModeRef.current && openRef.current) { setVoiceMessage('Reconnecting'); window.setTimeout(() => { if (!busyRef.current) void listen(true); }, 700); } };
      recognition.onresult = (event) => { if (recognitionRef.current !== recognition || !openRef.current) return; const text = event.results?.[0]?.[0]?.transcript?.trim(); if (!text) return; receivedResult = true; stopRecognitionWatchdog(); setListening(false); setVoiceMessage('Thinking'); focusRadio(RADIO_FOCUS.thinking); recognition.abort(); recognitionRef.current = null; void ask(text); }; recognition.start();
    } catch { setListening(false); recognitionRef.current = null; stopRecognitionWatchdog(); if (conversationModeRef.current && openRef.current) { setVoiceMessage('Reconnecting'); window.setTimeout(() => { if (!busyRef.current) void listen(true); }, 700); } else restoreRadio(); }
  }
  function activateAtlas() {
    void primeVoiceOutput(); if (neuralStateRef.current === 'unavailable') { neuralWorkerRef.current?.terminate(); neuralWorkerRef.current = null; neuralStateRef.current = 'idle'; setNeuralState('idle'); } warmNeuralVoice();
    if (!openRef.current) { openRef.current = true; setOpen(true); setTextMode(false); setVoiceMessage('Listening'); focusRadio(RADIO_FOCUS.opening); conversationModeRef.current = true; setConversationMode(true); window.setTimeout(() => void listen(true), 40); return; }
    if (speaking) { stopVoiceOutput(); setVoiceMessage('Listening'); void listen(true); return; }
    if (conversationModeRef.current) endConversation(); else void listen();
  }
  activateRef.current = activateAtlas;

  const stationLabel = station?.name || 'Current signal'; const signalState: SignalState = listening ? 'listening' : speaking ? 'speaking' : busy ? 'thinking' : 'live';
  if (!open) return null;

  return <>
    <style>{`
      @keyframes atlasFlowA { 0%,100%{transform:rotate(0deg) scale(1)} 50%{transform:rotate(170deg) scale(1.12)} }
      @keyframes atlasFlowB { 0%,100%{transform:rotate(30deg) scale(.94)} 50%{transform:rotate(-145deg) scale(1.08)} }
      @keyframes atlasFlowC { 0%,100%{transform:translate3d(-7%,5%,0) rotate(0deg)} 50%{transform:translate3d(8%,-7%,0) rotate(130deg)} }
      @keyframes atlasAura { 0%,100%{filter:blur(22px)} 50%{filter:blur(30px)} }
      @keyframes atlasListenPulse { 0%,100%{transform:scale(.96)} 50%{transform:scale(1.055)} }
      @keyframes atlasSpeakPulse { 0%,100%{transform:scale(.94)} 35%{transform:scale(1.075)} 68%{transform:scale(.99)} }
      .atlas-signal-aura{background:radial-gradient(circle,rgba(78,199,194,.58),rgba(0,214,143,.22) 38%,rgba(212,166,74,.10) 58%,transparent 72%);animation:atlasAura 2.6s ease-in-out infinite;transition:opacity .16s ease,transform .16s ease}
      .atlas-signal-shell{background:#071522;box-shadow:inset 0 0 35px rgba(255,255,255,.10),inset -24px -30px 55px rgba(0,0,0,.58),0 0 55px rgba(78,199,194,.22);${signalState === 'listening' ? 'animation:atlasListenPulse 1.15s ease-in-out infinite;' : signalState === 'speaking' ? 'animation:atlasSpeakPulse .82s ease-in-out infinite;' : ''}}
      .atlas-flow{mix-blend-mode:screen;filter:blur(13px);will-change:transform}
      .atlas-flow-a{background:conic-gradient(from 30deg,transparent 0 8%,#4ec7c2 20%,#00d68f 36%,transparent 51%,#d4a64a 68%,transparent 84%);animation:atlasFlowA ${signalState === 'thinking' ? '1.7s' : '4.8s'} ease-in-out infinite}
      .atlas-flow-b{background:radial-gradient(ellipse at 38% 44%,rgba(247,245,239,.92),rgba(78,199,194,.72) 20%,rgba(0,214,143,.34) 44%,transparent 67%);animation:atlasFlowB ${signalState === 'speaking' ? '1.5s' : '5.4s'} ease-in-out infinite}
      .atlas-flow-c{background:linear-gradient(125deg,transparent 12%,rgba(212,166,74,.78) 37%,rgba(78,199,194,.34) 55%,transparent 74%);animation:atlasFlowC 3.8s ease-in-out infinite}
      .atlas-glass{background:radial-gradient(circle at 31% 22%,rgba(255,255,255,.42),transparent 17%),radial-gradient(circle at 65% 76%,rgba(212,166,74,.18),transparent 32%);box-shadow:inset 0 0 1px rgba(255,255,255,.9)}
      .atlas-highlight{background:rgba(255,255,255,.28);filter:blur(9px)}
      @media (prefers-reduced-motion:reduce){.atlas-signal-aura,.atlas-signal-shell,.atlas-flow{animation:none!important}}
    `}</style>
    {!textMode && <section role="dialog" aria-modal="true" aria-label="Atlas Voice" className="fixed inset-0 z-[260] flex flex-col items-center justify-center overflow-hidden bg-[#020713]/78 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(78,199,194,.10),transparent_28%),radial-gradient(circle_at_58%_50%,rgba(212,166,74,.05),transparent_38%)]" />
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex gap-2"><button onClick={() => setTextMode(true)} aria-label="Open Atlas keyboard and transcript" className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[.06] text-slate-200 backdrop-blur-xl"><Keyboard size={18}/></button><button onClick={endConversation} aria-label="Close Atlas Voice" className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[.06] text-slate-200 backdrop-blur-xl"><X size={19}/></button></div>
      <div className="relative flex flex-col items-center"><AtlasSignal state={signalState} energy={signalEnergy} onPress={activateAtlas}/><div className="mt-8 text-center"><div className="max-w-[84vw] text-[15px] font-semibold tracking-wide text-white">{voiceMessage}</div><div className="mt-2 max-w-[78vw] truncate text-xs text-slate-400">{stationLabel}{voiceOutput === 'unavailable' ? ' · Answer in transcript' : neuralState === 'loading' ? ' · Preparing Omoluabi Paul' : neuralState === 'ready' ? ' · Omoluabi Paul' : ' · Personal voice unavailable'}</div>{voiceProgress && <div role="status" className="mt-3 max-w-[78vw] text-xs text-emerald-200">{voiceProgress}</div>}</div></div>
      <div className="absolute bottom-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))] text-center text-[11px] tracking-[.16em] text-slate-500">{voiceOutput === 'unavailable' ? 'ATLAS VOICE · ANSWER IN TRANSCRIPT' : 'ATLAS VOICE · OMOLUABI PAUL'}</div>
    </section>}
    {textMode && <section role="dialog" aria-modal="true" aria-label="Atlas Assistant" className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[270] mx-auto flex max-h-[72dvh] max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050b19]/96 shadow-[0_30px_90px_rgba(0,0,0,.58)] backdrop-blur-2xl md:inset-x-auto md:bottom-20 md:right-5 md:w-[390px]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="font-semibold tracking-tight text-white">Atlas</div><div className="mt-0.5 text-[11px] text-slate-400">{stationLabel}</div></div><div className="flex items-center gap-1"><button onClick={() => { const enabled = !voiceEnabledRef.current; voiceEnabledRef.current = enabled; setVoiceEnabled(enabled); if (!enabled) { stopVoiceOutput(); restoreRadio(); } }} aria-label={voiceEnabled ? 'Mute Atlas voice' : 'Enable Atlas voice'} className="grid size-9 place-items-center rounded-full text-slate-300 hover:bg-white/10">{voiceEnabled ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button><button onClick={() => setTextMode(false)} aria-label="Return to Atlas Voice" className="grid size-9 place-items-center rounded-full text-emerald-300 hover:bg-white/10"><Mic size={17}/></button><button onClick={endConversation} aria-label="Close Atlas" className="grid size-9 place-items-center rounded-full text-slate-300 hover:bg-white/10"><X size={18}/></button></div></header>
      <div role="status" aria-live="polite" className="border-b border-white/10 px-4 py-2 text-xs text-emerald-200">{neuralState === 'ready' ? 'Omoluabi personal voice ready' : neuralState === 'loading' ? 'Preparing Omoluabi personal voice' : 'Omoluabi personal voice unavailable'}{voiceProgress ? ` · ${voiceProgress}` : ''}{neuralState === 'unavailable' && <button type="button" onClick={() => { neuralWorkerRef.current?.terminate(); neuralWorkerRef.current = null; neuralStateRef.current = 'idle'; setNeuralState('idle'); setVoiceProgress(''); warmNeuralVoice(); }} className="ml-2 underline" aria-label="Retry Omoluabi voice preparation">Retry voice</button>}</div>
      <div className="min-h-28 flex-1 space-y-3 overflow-y-auto p-4">{lines.map((line, i) => <div key={i} className={line.role === 'user' ? 'ml-8 rounded-2xl rounded-br-md bg-emerald-400/15 px-3.5 py-2.5 text-sm leading-5 text-emerald-50' : 'mr-5 rounded-2xl rounded-bl-md bg-white/[.06] px-3.5 py-2.5 text-sm leading-5 text-slate-100'}>{line.text}</div>)}{busy && <div className="px-1 text-xs text-slate-400">Atlas is thinking…</div>}</div>
      <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 pt-2">{QUICK_COMMANDS.map((command) => <button key={command} onClick={() => void ask(command)} className="shrink-0 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:border-emerald-300/30 hover:text-emerald-200">{command}</button>)}</div>
      <form onSubmit={submit} className="flex items-center gap-2 p-3"><button type="button" onClick={() => { void primeVoiceOutput(); warmNeuralVoice(); setTextMode(false); void listen(); }} className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${listening ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-white/10 bg-white/[.04] text-emerald-300'}`} aria-label={listening ? 'Stop listening' : 'Talk to Atlas'}>{listening ? <MicOff size={19}/> : <Mic size={19}/>}</button><input ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask or tell Atlas what to do…" className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"/><button type="submit" disabled={!question.trim() || busy} className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-slate-950 disabled:opacity-35" aria-label="Send"><Send size={18}/></button></form>
    </section>}
  </>;
}

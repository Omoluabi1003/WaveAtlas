"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { AtlasActionResult, AtlasAssistantAction, AtlasConversationLine } from '@/lib/atlas-assistant';
import { atlasInteractionState } from '@/lib/atlas-audio-focus';
import { AtlasVoiceCapture } from '@/lib/atlas-voice-capture';
import { AtlasPCMPlayer } from '@/lib/atlas-pcm-player';
import { ATLAS_VOICE_RUNTIME_VERSION, INITIAL_ATLAS_VOICE_STATUS, atlasVoiceStatusLabel, atlasVoiceStatusTransition, type AtlasVoiceStatusEvent } from '@/lib/atlas-voice-status';
import { answerAtlasIntelligently } from '@/lib/atlas-intelligence';
import { atlasStationVoicePhrases, readyAtlasReply } from '@/lib/atlas-ready-replies';
import type { Station } from '@/lib/stations';
import { getSpeechRecognitionConstructor, type BrowserSpeechRecognition } from '@/lib/voice-command-engine';

type Props = {
  station: Station | null;
  playbackStatus?: string;
  onSearch?: (query: string) => void;
  onAction?: (action: AtlasAssistantAction) => AtlasActionResult | boolean | Promise<AtlasActionResult | boolean>;
};
type Line = AtlasConversationLine;
type NeuralVoiceState = 'idle' | 'prepared' | 'loading' | 'ready' | 'unavailable';
type NeuralMessage = { type?: 'prepared' | 'loading' | 'progress' | 'ready' | 'unavailable' | 'audio_chunk' | 'audio_end' | 'error'; id?: string; samples?: Float32Array; sampleRate?: number; cached?: boolean; message?: string; label?: string; loaded?: number; total?: number; engine?: string; voiceSource?: string };
type PendingNeural = { resolve: (message: NeuralMessage) => void; reject: (error: Error) => void; onChunk: (message: NeuralMessage) => void; timer: number; deadline: number };
type AudioSessionKind = 'auto' | 'playback' | 'play-and-record' | 'ambient';
type AudioSessionLike = { type: AudioSessionKind; state?: string };
type SignalState = 'listening' | 'thinking' | 'speaking' | 'live';

const QUICK_COMMANDS = ['Surprise me', 'Play jazz', 'Open the map', 'What am I listening to?'];
const RADIO_FOCUS = { opening: 0, listening: 0, thinking: 0, speaking: 0 } as const;

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
  const [voiceStatus, setVoiceStatus] = useState(INITIAL_ATLAS_VOICE_STATUS);
  const [neuralState, setNeuralState] = useState<NeuralVoiceState>('idle');
  const [signalEnergy, setSignalEnergy] = useState(0.18);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const captureRef = useRef(new AtlasVoiceCapture());
  const recognitionWatchdogRef = useRef<number | null>(null);
  const followUpTimerRef = useRef<number | null>(null);
  const openRef = useRef(false);
  const conversationModeRef = useRef(false);
  const busyRef = useRef(false);
  const voiceEnabledRef = useRef(true);
  const neuralStateRef = useRef<NeuralVoiceState>('idle');
  const voiceStatusRef = useRef(INITIAL_ATLAS_VOICE_STATUS);
  const linesRef = useRef<Line[]>(initialLines);
  const neuralLoadTimerRef = useRef<number | null>(null);
  const neuralWorkerRef = useRef<Worker | null>(null);
  const neuralPendingRef = useRef(new Map<string, PendingNeural>());
  const voiceContextRef = useRef<AudioContext | null>(null);
  const pcmPlayerRef = useRef<AtlasPCMPlayer | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const radioDuckedRef = useRef(false);
  const speechPendingRef = useRef(false);
  const spokenStatusRef = useRef<string | null>(null);
  const outputGenerationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const activateRef = useRef<() => void>(() => undefined);
  const warmVoiceRef = useRef<() => void>(() => undefined);
  const stationSpeech = useMemo(() => JSON.stringify(atlasStationVoicePhrases(station)), [station]);

  useEffect(() => { const timer = window.setTimeout(() => warmVoiceRef.current(), 100); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    if (!open || !voiceEnabled) return;
    const texts = JSON.parse(stationSpeech) as string[];
    if (texts.length) neuralWorkerRef.current?.postMessage({ type: 'prefetch', texts });
  }, [open, voiceEnabled, stationSpeech]);

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
    const captureEnded = captureRef.current.stop();
    if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current);
    if (followUpTimerRef.current !== null) window.clearTimeout(followUpTimerRef.current);
    if (meterFrameRef.current) window.cancelAnimationFrame(meterFrameRef.current);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    pcmPlayerRef.current?.stop();
    if (neuralLoadTimerRef.current) window.clearTimeout(neuralLoadTimerRef.current);
    void voiceContextRef.current?.close(); neuralWorkerRef.current?.terminate();
    neuralPendingRef.current.forEach(({ reject, timer, deadline }) => { window.clearTimeout(timer); window.clearTimeout(deadline); reject(new Error('Atlas voice closed')); });
    neuralPendingRef.current.clear(); conversationModeRef.current = false; recognitionRef.current = null; busyRef.current = false; speechPendingRef.current = false; pcmPlayerRef.current = null; void captureEnded.then(restoreRadio);
  }, []);

  function sendPlayback(command: 'play' | 'pause' | 'volume' | 'duck' | 'restore', value?: number) { window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback', { detail: { command, ...(typeof value === 'number' ? { value } : {}) } })); }
  function focusRadio(level: number) { radioDuckedRef.current = true; sendPlayback('duck', level); }
  function restoreRadio() {
    const state = atlasInteractionState({
      conversation: conversationModeRef.current, capture: captureRef.current.active,
      processing: busyRef.current, speechPending: speechPendingRef.current,
      playback: Boolean(pcmPlayerRef.current), queuedSpeech: neuralPendingRef.current.size > 0,
    });
    if (!radioDuckedRef.current || state !== 'ATLAS_IDLE') return;
    radioDuckedRef.current = false; sendPlayback('restore');
  }

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
  function updateVoiceStatus(event: AtlasVoiceStatusEvent) { const next = atlasVoiceStatusTransition(voiceStatusRef.current, event); voiceStatusRef.current = next; setVoiceStatus(next); }
  function stopVoiceOutput() { if (followUpTimerRef.current !== null) window.clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; outputGenerationRef.current += 1; speechPendingRef.current = false; neuralWorkerRef.current?.postMessage({ type: 'cancel' }); neuralPendingRef.current.forEach(({ reject, timer, deadline }) => { window.clearTimeout(timer); window.clearTimeout(deadline); reject(new Error('Speech interrupted')); }); neuralPendingRef.current.clear(); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); pcmPlayerRef.current?.stop(); pcmPlayerRef.current = null; stopMeter(); setSpeaking(false); updateVoiceStatus({ type: 'idle' }); }
  async function prepareAudiblePlayback() { const session = audioSession(); if (session) { try { session.type = 'ambient'; await sleep(0); session.type = 'playback'; } catch { /* Keep normal output path. */ } } return resumeVoiceContext(); }
  function meterAnalyser(analyser: AnalyserNode) {
    stopMeter(); analyser.fftSize = 256; const samples = new Uint8Array(analyser.fftSize);
    const frame = () => { analyser.getByteTimeDomainData(samples); let sum = 0; for (const sample of samples) { const normalized = (sample - 128) / 128; sum += normalized * normalized; } const rms = Math.sqrt(sum / samples.length); setSignalEnergy(Math.min(1, 0.16 + rms * 5.5)); meterFrameRef.current = window.requestAnimationFrame(frame); };
    frame();
  }

  function warmNeuralVoice() {
    if (typeof window === 'undefined') { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; return; }
    if (!('Worker' in window)) { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; updateVoiceStatus({ type: 'failed', detail: 'This browser cannot run personal voice workers' }); return; }
    if (neuralStateRef.current !== 'idle') return;
    setNeuralState('loading'); neuralStateRef.current = 'loading';
    try {
      const worker = new Worker(`/atlas-neural-voice-worker.mjs?v=${ATLAS_VOICE_RUNTIME_VERSION}`, { type: 'module' });
      neuralWorkerRef.current = worker;
      const clearLoadTimer = () => { if (neuralLoadTimerRef.current) window.clearTimeout(neuralLoadTimerRef.current); neuralLoadTimerRef.current = null; };
      const unavailable = (reason: string, terminate = false) => {
        clearLoadTimer();
        if (terminate) { worker.terminate(); if (neuralWorkerRef.current === worker) neuralWorkerRef.current = null; }
        setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; updateVoiceStatus({ type: 'failed', detail: reason });
        neuralPendingRef.current.forEach(({ reject, timer, deadline }) => { window.clearTimeout(timer); window.clearTimeout(deadline); reject(new Error(reason)); });
        neuralPendingRef.current.clear();
      };
      const startLoadTimer = () => {
        clearLoadTimer();
        neuralLoadTimerRef.current = window.setTimeout(() => unavailable('Voice preparation timed out. Reopen Atlas to retry.', true), 120000);
      };
      startLoadTimer();
      worker.onmessage = (event: MessageEvent<NeuralMessage>) => {
        const message = event.data;
        if (message.type === 'loading') { if (neuralStateRef.current !== 'loading') startLoadTimer(); setNeuralState('loading'); neuralStateRef.current = 'loading'; return; }
        if (message.type === 'prepared' || message.type === 'ready') {
          clearLoadTimer();
          const state = message.type === 'prepared' ? 'prepared' : 'ready';
          setNeuralState(state); neuralStateRef.current = state;
          updateVoiceStatus({ type: 'progress', detail: '' });
          return;
        }
        // Inference internals stay out of the listening and response interface.
        if (message.type === 'progress') return;
        if (message.type === 'unavailable') { unavailable(message.message || 'Personal voice unavailable on this device'); return; }
        if (!message.id) return;
        const pending = neuralPendingRef.current.get(message.id); if (!pending) return;
        if (message.type === 'audio_chunk') {
          try { pending.onChunk(message); }
          catch (error) { window.clearTimeout(pending.timer); window.clearTimeout(pending.deadline); neuralPendingRef.current.delete(message.id); pending.reject(error instanceof Error ? error : new Error('Invalid voice audio')); }
          return;
        }
        window.clearTimeout(pending.timer); window.clearTimeout(pending.deadline); neuralPendingRef.current.delete(message.id);
        if (message.type === 'audio_end') pending.resolve(message); else pending.reject(new Error(message.message || 'Neural voice unavailable'));
      };
      worker.onerror = () => unavailable('Personal voice worker failed', true);
      worker.postMessage({ type: 'warm' });
    } catch { setNeuralState('unavailable'); neuralStateRef.current = 'unavailable'; }
  }
  async function speakNeural(text: string, confirmation = false) {
    const generation = outputGenerationRef.current;
    if (!neuralWorkerRef.current) warmNeuralVoice();
    const worker = neuralWorkerRef.current;
    if (!worker) return false;
    await captureRef.current.stop();
    if (generation !== outputGenerationRef.current || !openRef.current) return false;
    const context = await prepareAudiblePlayback();
    if (!context || generation !== outputGenerationRef.current || !openRef.current) return false;
    updateVoiceStatus({ type: 'preparing' }); setVoiceMessage(spokenStatusRef.current || 'Thinking');
    const player = new AtlasPCMPlayer(context, () => {
      updateVoiceStatus({ type: 'speaking' });
      setVoiceOutput('personal'); setSpeaking(true); setVoiceMessage(spokenStatusRef.current || 'Speaking');
      focusRadio(RADIO_FOCUS.speaking); meterAnalyser(player.analyser);
    }, confirmation);
    pcmPlayerRef.current = player;
    const id = `atlas-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      // Ask the worker immediately: a persistent response can play before model warmup.
      const message = await new Promise<NeuralMessage>((resolve, reject) => {
        const fail = () => { window.clearTimeout(pending.timer); window.clearTimeout(pending.deadline); neuralPendingRef.current.delete(id); worker.postMessage({ type: 'cancel' }); reject(new Error('Personal voice response timed out. Your answer is in the transcript.')); };
        const pending: PendingNeural = {
          resolve, reject, timer: window.setTimeout(fail, 120000), deadline: window.setTimeout(fail, 240000),
          onChunk: (chunk) => {
            if (generation !== outputGenerationRef.current || !openRef.current) return;
            if (chunk.engine !== 'pocket-tts-omoluabi-paul' || chunk.voiceSource !== 'repository-canonical' || !chunk.samples) throw new Error('Personal voice identity could not be verified');
            window.clearTimeout(pending.timer); pending.timer = window.setTimeout(fail, 45000);
            player.push(chunk.samples, chunk.sampleRate || 0);
          },
        };
        neuralPendingRef.current.set(id, pending); worker.postMessage({ type: 'speak', id, text });
      });
      if (message.engine !== 'pocket-tts-omoluabi-paul' || message.voiceSource !== 'repository-canonical') throw new Error('Personal voice identity could not be verified');
      if (generation !== outputGenerationRef.current || !openRef.current) { player.stop(); return false; }
      // Browsers can suspend the context during a long first synthesis.
      const resumed = await resumeVoiceContext();
      if (!resumed || resumed.state !== 'running') throw new Error('Audio playback is paused. Tap Atlas to retry.');
      if (generation !== outputGenerationRef.current || !openRef.current) { player.stop(); return false; }
      const played = await player.finish();
      if (pcmPlayerRef.current === player) pcmPlayerRef.current = null;
      if (generation === outputGenerationRef.current) { stopMeter(); updateVoiceStatus({ type: 'idle' }); } return played;
    } catch (error) {
      if (generation === outputGenerationRef.current) worker.postMessage({ type: 'cancel' });
      player.stop();
      if (pcmPlayerRef.current === player) pcmPlayerRef.current = null;
      if (generation === outputGenerationRef.current) { stopMeter(); updateVoiceStatus({ type: 'failed', detail: error instanceof Error ? error.message : 'Omoluabi voice generation failed' }); }
      return false;
    }
  }
  async function speak(text: string, terminal = false, statusLabel?: string) {
    const generation = outputGenerationRef.current;
    spokenStatusRef.current = statusLabel || null;
    if (!voiceEnabledRef.current) { spokenStatusRef.current = null; if (terminal) endConversation(); else restoreRadio(); return; }
    void captureRef.current.stop(); recognitionRef.current = null; stopRecognitionWatchdog(); setListening(false); focusRadio(RADIO_FOCUS.speaking);
    speechPendingRef.current = true; updateVoiceStatus({ type: 'preparing' });
    const spoken = await speakNeural(text, Boolean(statusLabel)); if (generation !== outputGenerationRef.current || !openRef.current) return;
    speechPendingRef.current = false; setSpeaking(false);
    if (!spoken) {
      setVoiceOutput('unavailable'); setVoiceMessage('Omoluabi voice unavailable · answer is in transcript');
      setTextMode(true); setAudioSession('playback'); restoreRadio();
      spokenStatusRef.current = null;
      return;
    }
    if (terminal && openRef.current) {
      setVoiceMessage(statusLabel || text); spokenStatusRef.current = null; setAudioSession('playback'); endConversation(); return;
    }
    spokenStatusRef.current = null;
    if (conversationModeRef.current && openRef.current) {
      setVoiceMessage(spoken ? 'Listening' : 'Listening · answer is in transcript');
      setAudioSession('play-and-record'); focusRadio(RADIO_FOCUS.listening);
      followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, isIOSFamily() ? 650 : 350);
    } else { setVoiceMessage('Ready'); setAudioSession('playback'); restoreRadio(); }
  }
  function endConversation() {
    requestControllerRef.current?.abort(); requestControllerRef.current = null;
    busyRef.current = false; setBusy(false);
    conversationModeRef.current = false; setConversationMode(false);
    const captureEnded = captureRef.current.stop(); recognitionRef.current = null;
    stopRecognitionWatchdog(); stopVoiceOutput(); setListening(false);
    openRef.current = false; setOpen(false); setTextMode(false);
    void captureEnded.then(() => {
      if (!conversationModeRef.current && !speechPendingRef.current) setAudioSession('playback');
      restoreRadio();
    });
  }

  async function ask(text: string) {
    const value = text.trim(); if (!value || busyRef.current) return; stopVoiceOutput(); void captureRef.current.stop(); recognitionRef.current = null; stopRecognitionWatchdog(); setListening(false);
    const history = linesRef.current.slice(-8);
    const userLine: Line = { role: 'user', text: value };
    linesRef.current = [...linesRef.current, userLine]; setLines(linesRef.current); setQuestion(''); setBusy(true); busyRef.current = true; setSignalEnergy(0.34); setVoiceMessage('Thinking'); focusRadio(RADIO_FOCUS.thinking);
    const controller = new AbortController(); requestControllerRef.current = controller;
    try {
      // The API already uses this pure, keyless engine. Run it here so routine
      // replies do not wait for a network round trip or serverless startup.
      const data = answerAtlasIntelligently(value, { station, history });
      if (controller.signal.aborted) return;
      let answer = data.answer || 'I could not answer that from the Atlas yet.';
      let terminalAction = false; let statusLabel: string | undefined;
      let actionOutcome: AtlasActionResult | boolean | undefined;
      if (data.action) {
        try {
          const outcome = await onAction?.(data.action);
          actionOutcome = outcome;
          if (outcome === false) answer = `${answer} I could not complete that action.`;
          else if (outcome && typeof outcome === 'object') {
            const result = outcome as AtlasActionResult;
            if (result.message) answer = result.message;
            else if (!result.ok) answer = `${answer} I could not complete that action.`;
            terminalAction = Boolean(result.terminal);
            if (result.status === 'playing' || result.status === 'connecting' || result.status === 'already_playing') statusLabel = result.message || answer;
          }
        } catch { actionOutcome = false; answer = `${answer} I could not complete that action.`; }
      }
      if (controller.signal.aborted) return;
      const atlasLine: Line = { role: 'atlas', text: answer }; linesRef.current = [...linesRef.current, atlasLine]; setLines(linesRef.current);
      if (statusLabel) setVoiceMessage(statusLabel);
      const speech = readyAtlasReply(answer, data.action, actionOutcome) || answer;
      if (voiceEnabledRef.current) void speak(speech, terminalAction, statusLabel); else if (terminalAction) endConversation(); else restoreRadio();
    } catch {
      if (controller.signal.aborted) return;
      const answer = 'I lost that request for a moment, but I’m still here.'; const atlasLine: Line = { role: 'atlas', text: answer }; linesRef.current = [...linesRef.current, atlasLine]; setLines(linesRef.current); if (voiceEnabledRef.current) void speak(answer); else restoreRadio();
    } finally { if (requestControllerRef.current === controller) { setBusy(false); busyRef.current = false; setSignalEnergy(0.18); restoreRadio(); } }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }
  async function listen(fromConversation = false) {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!fromConversation) { conversationModeRef.current = true; setConversationMode(true); }
    stopVoiceOutput(); focusRadio(RADIO_FOCUS.listening); setAudioSession('play-and-record'); const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { conversationModeRef.current = false; setConversationMode(false); setVoiceMessage('Voice input is unavailable'); setTextMode(true); restoreRadio(); return; }
    setVoiceMessage('Listening'); setSignalEnergy(0.24);
    try {
      const generation = outputGenerationRef.current; await captureRef.current.stop(); await sleep(fromConversation ? 300 : 80); if (generation !== outputGenerationRef.current || !conversationModeRef.current || !openRef.current) return; const recognition = new Recognition(); recognitionRef.current = recognition; let receivedResult = false;
      recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => { if (recognitionRef.current !== recognition || !conversationModeRef.current || !openRef.current) { recognition.abort(); return; } setListening(true); setVoiceMessage('Listening'); stopRecognitionWatchdog(); recognitionWatchdogRef.current = window.setTimeout(() => { if (recognitionRef.current !== recognition) return; void captureRef.current.stop(); setListening(false); setVoiceMessage('Reconnecting'); }, 12000); };
      recognition.onend = () => { restoreRadio(); if (recognitionRef.current !== recognition) return; stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null; if (!receivedResult && conversationModeRef.current && openRef.current) followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 650); };
      recognition.onerror = (event) => { if (recognitionRef.current !== recognition) return; stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null; const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed'; if (denied) { conversationModeRef.current = false; setConversationMode(false); setAudioSession('playback'); setVoiceMessage('Microphone access is blocked'); setTextMode(true); restoreRadio(); } else if (conversationModeRef.current && openRef.current) { setVoiceMessage('Reconnecting'); followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 700); } };
      recognition.onresult = (event) => { if (recognitionRef.current !== recognition || !openRef.current) return; const result = event.results?.[event.resultIndex ?? 0] ?? event.results?.[0]; if (result?.isFinal === false) return; const text = result?.[0]?.transcript?.trim(); if (!text) return; receivedResult = true; stopRecognitionWatchdog(); setListening(false); setVoiceMessage('Thinking'); focusRadio(RADIO_FOCUS.thinking); void captureRef.current.stop(); recognitionRef.current = null; void ask(text); }; captureRef.current.start(recognition);
    } catch { setListening(false); recognitionRef.current = null; stopRecognitionWatchdog(); if (conversationModeRef.current && openRef.current) { setVoiceMessage('Reconnecting'); followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 700); } else restoreRadio(); }
  }
  function activateAtlas() {
    void primeVoiceOutput(); if (neuralStateRef.current === 'unavailable') { neuralWorkerRef.current?.terminate(); neuralWorkerRef.current = null; neuralStateRef.current = 'idle'; setNeuralState('idle'); } warmNeuralVoice();
    if (!openRef.current) { openRef.current = true; setOpen(true); setTextMode(false); setVoiceMessage('Listening'); focusRadio(RADIO_FOCUS.opening); conversationModeRef.current = true; setConversationMode(true); followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current) void listen(true); }, 40); return; }
    if (speaking || speechPendingRef.current) { stopVoiceOutput(); setVoiceMessage('Listening'); void listen(true); return; }
    if (conversationModeRef.current) endConversation(); else void listen();
  }
  activateRef.current = activateAtlas;
  warmVoiceRef.current = warmNeuralVoice;

  const stationLabel = station?.name || 'Current signal'; const signalState: SignalState = listening ? 'listening' : speaking ? 'speaking' : busy || voiceStatus.phase === 'preparing' ? 'thinking' : 'live';
  const voiceStatusText = atlasVoiceStatusLabel(voiceStatus, neuralState);
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
      <div className="relative flex flex-col items-center"><AtlasSignal state={signalState} energy={signalEnergy} onPress={activateAtlas}/><div className="mt-8 text-center"><div className="max-w-[84vw] text-[15px] font-semibold tracking-wide text-white">{voiceMessage}</div><div className="mt-2 max-w-[78vw] truncate text-xs text-slate-400">{stationLabel}{voiceOutput === 'unavailable' ? ' · Answer in transcript' : ' · Omoluabi Paul'}</div><div role="status" className="mt-3 max-w-[78vw] text-xs text-emerald-200">{voiceStatusText}</div></div></div>
      <div className="absolute bottom-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))] text-center text-[11px] tracking-[.16em] text-slate-500">{voiceOutput === 'unavailable' ? 'ATLAS VOICE · ANSWER IN TRANSCRIPT' : 'ATLAS VOICE · OMOLUABI PAUL'}</div>
    </section>}
    {textMode && <section role="dialog" aria-modal="true" aria-label="Atlas Assistant" className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[270] mx-auto flex max-h-[72dvh] max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050b19]/96 shadow-[0_30px_90px_rgba(0,0,0,.58)] backdrop-blur-2xl md:inset-x-auto md:bottom-20 md:right-5 md:w-[390px]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="font-semibold tracking-tight text-white">Atlas</div><div className="mt-0.5 text-[11px] text-slate-400">{stationLabel}</div></div><div className="flex items-center gap-1"><button onClick={() => { const enabled = !voiceEnabledRef.current; voiceEnabledRef.current = enabled; setVoiceEnabled(enabled); if (!enabled) { stopVoiceOutput(); restoreRadio(); } }} aria-label={voiceEnabled ? 'Mute Atlas voice' : 'Enable Atlas voice'} className="grid size-9 place-items-center rounded-full text-slate-300 hover:bg-white/10">{voiceEnabled ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button><button onClick={() => setTextMode(false)} aria-label="Return to Atlas Voice" className="grid size-9 place-items-center rounded-full text-emerald-300 hover:bg-white/10"><Mic size={17}/></button><button onClick={endConversation} aria-label="Close Atlas" className="grid size-9 place-items-center rounded-full text-slate-300 hover:bg-white/10"><X size={18}/></button></div></header>
      <div role="status" aria-live="polite" className="border-b border-white/10 px-4 py-2 text-xs text-emerald-200">{voiceStatusText}{(neuralState === 'unavailable' || voiceStatus.phase === 'failed') && <button type="button" onClick={() => { neuralWorkerRef.current?.terminate(); neuralWorkerRef.current = null; neuralStateRef.current = 'idle'; setNeuralState('idle'); updateVoiceStatus({ type: 'idle' }); warmNeuralVoice(); }} className="ml-2 underline" aria-label="Retry Atlas voice">Retry voice</button>}</div>
      <div className="min-h-28 flex-1 space-y-3 overflow-y-auto p-4">{lines.map((line, i) => <div key={i} className={line.role === 'user' ? 'ml-8 rounded-2xl rounded-br-md bg-emerald-400/15 px-3.5 py-2.5 text-sm leading-5 text-emerald-50' : 'mr-5 rounded-2xl rounded-bl-md bg-white/[.06] px-3.5 py-2.5 text-sm leading-5 text-slate-100'}>{line.text}</div>)}{busy && <div className="px-1 text-xs text-slate-400">Atlas is thinking…</div>}</div>
      <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 pt-2">{QUICK_COMMANDS.map((command) => <button key={command} onClick={() => void ask(command)} className="shrink-0 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:border-emerald-300/30 hover:text-emerald-200">{command}</button>)}</div>
      <form onSubmit={submit} className="flex items-center gap-2 p-3"><button type="button" onClick={() => { void primeVoiceOutput(); warmNeuralVoice(); setTextMode(false); void listen(); }} className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${listening ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-white/10 bg-white/[.04] text-emerald-300'}`} aria-label={listening ? 'Stop listening' : 'Talk to Atlas'}>{listening ? <MicOff size={19}/> : <Mic size={19}/>}</button><input ref={inputRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask or tell Atlas what to do…" className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"/><button type="submit" disabled={!question.trim() || busy} className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-slate-950 disabled:opacity-35" aria-label="Send"><Send size={18}/></button></form>
    </section>}
  </>;
}

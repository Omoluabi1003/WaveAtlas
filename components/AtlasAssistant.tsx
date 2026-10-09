"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { AtlasActionResult, AtlasAssistantAction, AtlasConversationLine } from '@/lib/atlas-assistant';
import { atlasInteractionState } from '@/lib/atlas-audio-focus';
import { AtlasVoiceCapture } from '@/lib/atlas-voice-capture';
import { AtlasPCMPlayer } from '@/lib/atlas-pcm-player';
import { AtlasParticleGlobe } from './AtlasParticleGlobe';
import type { AtlasParticleState } from '@/lib/atlas-particles';
import { ATLAS_VOICE_RUNTIME_VERSION, INITIAL_ATLAS_VOICE_STATUS, atlasVoiceStatusLabel, atlasVoiceStatusTransition, type AtlasVoiceStatusEvent } from '@/lib/atlas-voice-status';
import { answerAtlasIntelligently } from '@/lib/atlas-intelligence';
import { atlasStationVoicePhrases, readyAtlasReply } from '@/lib/atlas-ready-replies';
import type { Station } from '@/lib/stations';
import { getSpeechRecognitionConstructor, type BrowserSpeechRecognition } from '@/lib/voice-command-engine';
import { useAtlasVoiceDiscovery } from './AtlasVoiceDiscovery';

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
type SignalState = AtlasParticleState;

const QUICK_COMMANDS = ['Surprise me', 'Play jazz', 'Open the map', 'What am I listening to?'];
const RADIO_FOCUS = { opening: 0, listening: 0, thinking: 0, speaking: 0 } as const;

function sleep(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function isIOSFamily() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function audioSession() { return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession; }
function setAudioSession(type: AudioSessionKind) { try { const session = audioSession(); if (session) session.type = type; } catch { /* Progressive enhancement only. */ } }


export function AtlasAssistant({ station, playbackStatus = 'idle', onSearch, onAction }: Props) {
  const { setStatus: setDiscoveryStatus } = useAtlasVoiceDiscovery();
  const [microphoneBlocked, setMicrophoneBlocked] = useState(false);
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
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const captureRef = useRef(new AtlasVoiceCapture());
  const recognitionWatchdogRef = useRef<number | null>(null);
  const followUpTimerRef = useRef<number | null>(null);
  const openRef = useRef(false);
  const journeyNarratingRef = useRef(false);
  const journeyQueuedRef = useRef<{ id: number; text: string } | null>(null);
  const journeySpeechRef = useRef<(detail: { id: number; text: string }) => void>(() => undefined);
  const journeyStopRef = useRef<() => void>(() => undefined);
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
  const signalAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputMeterRef = useRef<{ stream: MediaStream; source: MediaStreamAudioSourceNode; analyser: AnalyserNode } | null>(null);
  const inputMeterGenerationRef = useRef(0);
  const radioDuckedRef = useRef(false);
  const speechPendingRef = useRef(false);
  const spokenStatusRef = useRef<string | null>(null);
  const outputGenerationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const activateRef = useRef<() => void>(() => undefined);
  const warmVoiceRef = useRef<() => void>(() => undefined);
  const stationSpeech = useMemo(() => JSON.stringify(atlasStationVoicePhrases(station)), [station]);

  useEffect(() => {
    let active = true;
    let permission: PermissionStatus | undefined;
    const update = () => { if (active) setMicrophoneBlocked(permission?.state === 'denied'); };
    void navigator.permissions?.query({ name: 'microphone' as PermissionName }).then(result => { if (!active) return; permission = result; update(); result.addEventListener('change', update); }).catch(() => {});
    return () => { active = false; permission?.removeEventListener('change', update); };
  }, []);
  useEffect(() => {
    setDiscoveryStatus(listening ? 'listening' : speaking ? 'speaking' : busy || voiceStatus.phase === 'preparing' ? 'understanding' : microphoneBlocked || !getSpeechRecognitionConstructor() || neuralState === 'unavailable' || voiceStatus.phase === 'failed' ? 'unavailable' : neuralState === 'ready' || neuralState === 'prepared' ? 'ready' : 'preparing');
  }, [listening, speaking, busy, voiceStatus.phase, neuralState, microphoneBlocked, setDiscoveryStatus]);

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
  useEffect(() => {
    const narrate = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number; text: string }>).detail;
      if (detail && Number.isFinite(detail.id) && typeof detail.text === 'string' && detail.text.length <= 600) journeySpeechRef.current(detail);
    };
    const stop = () => journeyStopRef.current();
    window.addEventListener('waveatlas:journey-narrate', narrate);
    window.addEventListener('waveatlas:journey-narration-stop', stop);
    return () => { window.removeEventListener('waveatlas:journey-narrate', narrate); window.removeEventListener('waveatlas:journey-narration-stop', stop); stop(); };
  }, []);
  useEffect(() => () => {
    requestControllerRef.current?.abort();
    outputGenerationRef.current += 1;
    const captureEnded = captureRef.current.stop();
    if (recognitionWatchdogRef.current) window.clearTimeout(recognitionWatchdogRef.current);
    if (followUpTimerRef.current !== null) window.clearTimeout(followUpTimerRef.current);
    stopMeter();
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
  function stopInputMeter() {
    inputMeterGenerationRef.current += 1;
    const meter = inputMeterRef.current; inputMeterRef.current = null;
    if (!meter) return;
    if (signalAnalyserRef.current === meter.analyser) signalAnalyserRef.current = null;
    meter.stream.getTracks().forEach(track => track.stop()); meter.source.disconnect(); meter.analyser.disconnect();
  }
  function stopMeter() { stopInputMeter(); signalAnalyserRef.current = null; }
  async function startInputMeter(recognition: BrowserSpeechRecognition) {
    // Recognition owns permission and capture. Meter only an already permitted
    // microphone; avoid a second prompt or iOS audio-session rerouting.
    if (isIOSFamily() || !navigator.mediaDevices?.getUserMedia || !navigator.permissions?.query) return;
    const generation = inputMeterGenerationRef.current;
    const current = () => generation === inputMeterGenerationRef.current && recognitionRef.current === recognition && captureRef.current.active && openRef.current;
    let stream: MediaStream | null = null;
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permission.state !== 'granted' || !current()) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      const context = await resumeVoiceContext();
      if (!context || !current()) { stream.getTracks().forEach(track => track.stop()); return; }
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      const source = context.createMediaStreamSource(stream); source.connect(analyser);
      inputMeterRef.current = { stream, source, analyser }; signalAnalyserRef.current = analyser;
    } catch { stream?.getTracks().forEach(track => track.stop()); /* Visual enhancement must never interrupt recognition. */ }
  }
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
    stopMeter(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.72;
    signalAnalyserRef.current = analyser;
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
    stopInputMeter();
    await captureRef.current.stop();
    if (generation !== outputGenerationRef.current || (!openRef.current && !journeyNarratingRef.current)) return false;
    const context = await prepareAudiblePlayback();
    if (!context || generation !== outputGenerationRef.current || (!openRef.current && !journeyNarratingRef.current)) return false;
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
            if (generation !== outputGenerationRef.current || (!openRef.current && !journeyNarratingRef.current)) return;
            if (chunk.engine !== 'pocket-tts-omoluabi-paul' || chunk.voiceSource !== 'repository-canonical' || !chunk.samples) throw new Error('Personal voice identity could not be verified');
            window.clearTimeout(pending.timer); pending.timer = window.setTimeout(fail, 45000);
            player.push(chunk.samples, chunk.sampleRate || 0);
          },
        };
        neuralPendingRef.current.set(id, pending); worker.postMessage({ type: 'speak', id, text });
      });
      if (message.engine !== 'pocket-tts-omoluabi-paul' || message.voiceSource !== 'repository-canonical') throw new Error('Personal voice identity could not be verified');
      if (generation !== outputGenerationRef.current || (!openRef.current && !journeyNarratingRef.current)) { player.stop(); return false; }
      // Browsers can suspend the context during a long first synthesis.
      const resumed = await resumeVoiceContext();
      if (!resumed || resumed.state !== 'running') throw new Error('Audio playback is paused. Tap Atlas to retry.');
      if (generation !== outputGenerationRef.current || (!openRef.current && !journeyNarratingRef.current)) { player.stop(); return false; }
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
    void captureRef.current.stop(); recognitionRef.current = null; stopRecognitionWatchdog(); setListening(false); if (!journeyNarratingRef.current) focusRadio(RADIO_FOCUS.speaking);
    speechPendingRef.current = true; updateVoiceStatus({ type: 'preparing' });
    const spoken = await speakNeural(text, Boolean(statusLabel)); if (generation !== outputGenerationRef.current || (!openRef.current && !journeyNarratingRef.current)) return;
    speechPendingRef.current = false; setSpeaking(false);
    if (!spoken) {
      setVoiceOutput('unavailable'); setVoiceMessage('Omoluabi voice unavailable · answer is in transcript');
      setTextMode(true); setAudioSession('playback'); restoreRadio();
      spokenStatusRef.current = null;
      return false;
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
    return spoken;
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
    window.dispatchEvent(new Event('waveatlas:atlas-used'));
    const history = linesRef.current.slice(-8);
    const userLine: Line = { role: 'user', text: value };
    linesRef.current = [...linesRef.current, userLine]; setLines(linesRef.current); setQuestion(''); setBusy(true); busyRef.current = true; setVoiceMessage('Thinking'); focusRadio(RADIO_FOCUS.thinking);
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
    } finally { if (requestControllerRef.current === controller) { setBusy(false); busyRef.current = false; restoreRadio(); } }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }
  async function listen(fromConversation = false) {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!fromConversation) { conversationModeRef.current = true; setConversationMode(true); }
    stopVoiceOutput(); focusRadio(RADIO_FOCUS.listening); setAudioSession('play-and-record'); const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { conversationModeRef.current = false; setConversationMode(false); setVoiceMessage('Voice input is unavailable'); setTextMode(true); restoreRadio(); return; }
    setVoiceMessage('Listening');
    try {
      const generation = outputGenerationRef.current; await captureRef.current.stop(); await sleep(fromConversation ? 300 : 80); if (generation !== outputGenerationRef.current || !conversationModeRef.current || !openRef.current) return; const recognition = new Recognition(); recognitionRef.current = recognition; let receivedResult = false;
      recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => { if (recognitionRef.current !== recognition || !conversationModeRef.current || !openRef.current) { recognition.abort(); return; } setListening(true); void startInputMeter(recognition); setVoiceMessage('Listening'); stopRecognitionWatchdog(); recognitionWatchdogRef.current = window.setTimeout(() => { if (recognitionRef.current !== recognition) return; void captureRef.current.stop(); setListening(false); setVoiceMessage('Reconnecting'); }, 12000); };
      recognition.onend = () => { stopInputMeter(); restoreRadio(); if (recognitionRef.current !== recognition) return; stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null; if (!receivedResult && conversationModeRef.current && openRef.current) followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 650); };
      recognition.onerror = (event) => { if (recognitionRef.current !== recognition) return; stopInputMeter(); stopRecognitionWatchdog(); setListening(false); recognitionRef.current = null; const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed'; if (denied) { setMicrophoneBlocked(true); conversationModeRef.current = false; setConversationMode(false); setAudioSession('playback'); setVoiceMessage('Microphone access is blocked'); setTextMode(true); restoreRadio(); } else if (conversationModeRef.current && openRef.current) { setVoiceMessage('Reconnecting'); followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 700); } };
      recognition.onresult = (event) => { if (recognitionRef.current !== recognition || !openRef.current) return; const result = event.results?.[event.resultIndex ?? 0] ?? event.results?.[0]; if (result?.isFinal === false) return; const text = result?.[0]?.transcript?.trim(); if (!text) return; receivedResult = true; stopRecognitionWatchdog(); stopInputMeter(); setListening(false); setVoiceMessage('Thinking'); focusRadio(RADIO_FOCUS.thinking); void captureRef.current.stop(); recognitionRef.current = null; void ask(text); }; captureRef.current.start(recognition);
    } catch { setListening(false); recognitionRef.current = null; stopRecognitionWatchdog(); if (conversationModeRef.current && openRef.current) { setVoiceMessage('Reconnecting'); followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current && !busyRef.current) void listen(true); }, 700); } else restoreRadio(); }
  }
  function activateAtlas() {
    journeyStopRef.current();
    void primeVoiceOutput(); if (neuralStateRef.current === 'unavailable') { neuralWorkerRef.current?.terminate(); neuralWorkerRef.current = null; neuralStateRef.current = 'idle'; setNeuralState('idle'); } warmNeuralVoice();
    if (!openRef.current) { openRef.current = true; setOpen(true); setTextMode(false); setVoiceMessage('Listening'); focusRadio(RADIO_FOCUS.opening); conversationModeRef.current = true; setConversationMode(true); followUpTimerRef.current = window.setTimeout(() => { if (conversationModeRef.current && openRef.current) void listen(true); }, 40); return; }
    if (speaking || speechPendingRef.current) { stopVoiceOutput(); setVoiceMessage('Listening'); void listen(true); return; }
    if (conversationModeRef.current) endConversation(); else void listen();
  }
  journeyStopRef.current = () => {
    if (!journeyNarratingRef.current) return;
    journeyQueuedRef.current = null; journeyNarratingRef.current = false; stopVoiceOutput(); restoreRadio();
  };
  journeySpeechRef.current = ({ id, text }) => {
    // Conversation owns the microphone and voice. A tour never interrupts it.
    if (openRef.current || conversationModeRef.current || busyRef.current) {
      window.dispatchEvent(new CustomEvent('waveatlas:journey-voice-status', { detail: { id, status: 'Atlas conversation is active. Journey guidance appears in captions.' } })); return;
    }
    if (journeyNarratingRef.current) { journeyQueuedRef.current = { id, text }; return; }
    stopVoiceOutput(); restoreRadio(); journeyNarratingRef.current = true;
    const generation = outputGenerationRef.current;
    void primeVoiceOutput();
    const deadline = window.setTimeout(() => {
      if (generation !== outputGenerationRef.current || !journeyNarratingRef.current) return;
      journeyStopRef.current();
      window.dispatchEvent(new CustomEvent('waveatlas:journey-voice-status', { detail: { id, status: 'Omoluabi voice is not ready on this device. Radio continues; tap Hear Atlas to retry.' } }));
    }, 30000);
    void speak(text).then(played => {
      window.clearTimeout(deadline);
      if (generation !== outputGenerationRef.current) return;
      journeyNarratingRef.current = false; restoreRadio();
      window.dispatchEvent(new CustomEvent('waveatlas:journey-voice-status', { detail: { id, status: !voiceEnabledRef.current ? 'Atlas voice is muted.' : played === true ? 'Atlas guidance complete.' : 'Omoluabi voice unavailable. Journey guidance remains in captions.' } }));
      const queued = journeyQueuedRef.current; journeyQueuedRef.current = null;
      if (queued && played === true) journeySpeechRef.current(queued);
    });
  };
  activateRef.current = activateAtlas;
  warmVoiceRef.current = warmNeuralVoice;

  const stationLabel = station?.name || 'Current signal'; const signalState: SignalState = listening ? 'listening' : speaking ? 'speaking' : busy || voiceStatus.phase === 'preparing' ? 'thinking' : 'live';
  const voiceStatusText = atlasVoiceStatusLabel(voiceStatus, neuralState);
  if (!open) return null;

  return <>
    {!textMode && <section role="dialog" aria-modal="true" aria-label="Atlas Voice" className="fixed inset-0 z-[260] flex flex-col items-center justify-between overflow-y-auto bg-[#020713]/78 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(78,199,194,.10),transparent_28%),radial-gradient(circle_at_58%_50%,rgba(212,166,74,.05),transparent_38%)]" />
      <header className="relative z-10 flex w-full max-w-2xl items-center justify-end gap-2 shrink-0">
        <button onClick={() => setTextMode(true)} aria-label="Open Atlas keyboard and transcript" className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[.06] text-slate-200 backdrop-blur-xl transition hover:bg-white/10"><Keyboard size={18}/></button>
        <button onClick={endConversation} aria-label="Close Atlas Voice" className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[.06] text-slate-200 backdrop-blur-xl transition hover:bg-white/10"><X size={19}/></button>
      </header>
      <main className="relative z-10 my-auto flex w-full max-w-xl min-h-0 flex-col items-center justify-center gap-4 py-4 text-center shrink-0">
        <div className="flex shrink-0 items-center justify-center">
          <AtlasParticleGlobe state={signalState} analyserRef={signalAnalyserRef} onPress={activateAtlas}/>
        </div>
        <div className="flex flex-col items-center gap-2 max-w-full px-2">
          <div className="max-w-md text-[15px] font-semibold tracking-wide text-white break-words">{voiceMessage}</div>
          <div className="max-w-md text-xs text-slate-400 break-words">{stationLabel}{voiceOutput === 'unavailable' ? ' · Answer in transcript' : ' · Omoluabi Paul'}</div>
          <div role="status" className="max-w-md text-xs text-emerald-200 break-words">{voiceStatusText}</div>
        </div>
      </main>
      <footer className="relative z-10 mt-auto pt-3 shrink-0 text-center text-[11px] tracking-[.16em] text-slate-500">
        {voiceOutput === 'unavailable' ? 'ATLAS VOICE · ANSWER IN TRANSCRIPT' : 'ATLAS VOICE · OMOLUABI PAUL'}
      </footer>
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

export type BrowserSpeechAlternative = { transcript: string; confidence?: number };
export type BrowserSpeechResult = ArrayLike<BrowserSpeechAlternative> & { isFinal?: boolean };
export type BrowserSpeechEvent = { resultIndex: number; results: ArrayLike<BrowserSpeechResult> };

export type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onresult: ((event: BrowserSpeechEvent) => void) | null;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export type VoiceCommandIntent =
  | { type: "search"; query: string; action?: "search" | "navigate" }
  | { type: "play"; query?: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "teleport"; query?: string }
  | { type: "wander"; query?: string }
  | { type: "switch_view"; view: "map" | "globe" }
  | { type: "volume"; value: number }
  | { type: "open_settings" };

export type VoiceCommandParseResult = {
  transcript: string;
  intent: VoiceCommandIntent | null;
  feedback: string;
};

const LEADING_POLITE_WORDS = /^(please\s+|hey\s+waveatlas\s+|waveatlas\s+)/i;
const STATION_COMMAND = /\b(?:play|tune|listen|switch|change|station|radio|fm|am|frequency)\b/i;
const ATLAS_COMMAND = /\b(?:atlas|waveatlas|map|globe|teleport|wander|volume|pause|resume|brief)\b/i;

// Fast local repairs handle common radio pronunciations. The dynamic resolver below
// then compares the recognizer's N-best hypotheses with WaveAtlas's live directory.
const RADIO_PRONUNCIATION_RULES: Array<[RegExp, string]> = [
  [/\bwave\s+at\s+last\b/gi, 'WaveAtlas'],
  [/\bwave\s+atlas\b/gi, 'WaveAtlas'],
  [/\b(?:premiere|premium|premier)\s+(?:f\s*m|eff\s*em)\b/gi, 'Premier FM'],
  [/\b(?:wasobia|wazobia)\s+(?:f\s*m|eff\s*em)\b/gi, 'Wazobia FM'],
  [/\b(?:agidi\s*gbo|ajidigbo|agidigbo)\b/gi, 'Agidigbo'],
  [/\b(?:cool)\s+(?:f\s*m|eff\s*em)\b/gi, 'Cool FM'],
  [/\b(?:f\s*m|eff\s*em)\b/gi, 'FM'],
  [/\b(?:a\s*m|ay\s*em)\b/gi, 'AM'],
];

function cleanTranscript(transcript: string) {
  return transcript.trim().replace(/[.!?]+$/g, "").replace(LEADING_POLITE_WORDS, "").trim();
}

export function normalizeAtlasSpeechTranscript(transcript: string) {
  let value = cleanTranscript(transcript).normalize('NFKC');
  for (const [pattern, replacement] of RADIO_PRONUNCIATION_RULES) value = value.replace(pattern, replacement);
  return value.replace(/\s+/g, ' ').trim();
}

function speechAlternativeScore(alternative: BrowserSpeechAlternative, index: number) {
  const raw = alternative.transcript?.trim() || '';
  const normalized = normalizeAtlasSpeechTranscript(raw);
  const confidence = Number.isFinite(alternative.confidence) ? Number(alternative.confidence) : Math.max(0, 0.62 - index * 0.05);
  let score = confidence * 100 - index * 2;
  if (STATION_COMMAND.test(normalized)) score += 18;
  if (ATLAS_COMMAND.test(normalized)) score += 10;
  if (/\b[A-Z][A-Za-z0-9'’-]*(?:\s+[A-Z][A-Za-z0-9'’-]*)*\s+(?:FM|AM)\b/.test(normalized)) score += 22;
  if (normalized !== cleanTranscript(raw)) score += 16;
  if (/\b(?:Premier|Wazobia|Agidigbo|Cool)\b/i.test(normalized)) score += 14;
  return { transcript: normalized || raw, confidence, score };
}

export function chooseAtlasSpeechAlternative(alternatives: BrowserSpeechAlternative[]) {
  const usable = alternatives.filter((item) => item?.transcript?.trim());
  if (!usable.length) return { transcript: '', confidence: 0 };
  return usable
    .map((alternative, index) => speechAlternativeScore(alternative, index))
    .sort((a, b) => b.score - a.score)[0];
}

async function resolveAgainstAtlasDirectory(alternatives: BrowserSpeechAlternative[]) {
  const normalized = alternatives
    .filter((item) => item?.transcript?.trim())
    .slice(0, 5)
    .map((item) => ({ transcript: normalizeAtlasSpeechTranscript(item.transcript), confidence: item.confidence }));
  const localBest = chooseAtlasSpeechAlternative(normalized);
  if (!normalized.length) return localBest;
  try {
    const response = await fetch('/api/atlas-speech/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alternatives: normalized }),
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return localBest;
    const data = await response.json() as { transcript?: string; confidence?: number };
    return data.transcript?.trim()
      ? { transcript: data.transcript.trim(), confidence: Number(data.confidence) || localBest.confidence }
      : localBest;
  } catch {
    return localBest;
  }
}

function titleCase(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function stripCommand(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function parseVolume(lower: string) {
  if (/\b(mute|silence)\b/.test(lower)) return 0;
  if (/\b(max|maximum|full)\b/.test(lower)) return 1;
  const percent = lower.match(/(?:volume\s*)?(\d{1,3})\s*(?:percent|%)/);
  if (percent) return Math.min(1, Math.max(0, Number(percent[1]) / 100));
  const decimal = lower.match(/volume\s*(?:to|at)?\s*(0(?:\.\d+)?|1(?:\.0+)?)/);
  if (decimal) return Math.min(1, Math.max(0, Number(decimal[1])));
  if (/\b(up|louder|increase)\b/.test(lower)) return 1;
  if (/\b(down|quieter|decrease|lower)\b/.test(lower)) return 0.35;
  return null;
}

export function parseVoiceCommand(transcript: string): VoiceCommandParseResult {
  const normalized = normalizeAtlasSpeechTranscript(transcript);
  const lower = normalized.toLowerCase();
  if (!normalized) return { transcript, intent: null, feedback: "I did not catch a command." };

  if (/\b(open|show|go to|switch to)\s+(settings|controls)\b/.test(lower)) return { transcript: normalized, intent: { type: "open_settings" }, feedback: "Opening settings." };
  if (/\b(open|show|switch to|go to)\s+(map|map view|2d|2 d)\b/.test(lower)) return { transcript: normalized, intent: { type: "switch_view", view: "map" }, feedback: "Opening map view." };
  if (/\b(open|show|switch to|go to)\s+(atlas|globe|globe view|earth)\b/.test(lower)) return { transcript: normalized, intent: { type: "switch_view", view: "globe" }, feedback: "Switching to Atlas globe." };
  if (/\b(pause|stop)\b/.test(lower)) return { transcript: normalized, intent: { type: "pause" }, feedback: "Pausing playback." };
  if (/\b(resume|continue)\b/.test(lower)) return { transcript: normalized, intent: { type: "resume" }, feedback: "Resuming playback." };
  if (/^play\b/.test(lower)) {
    const query = stripCommand(normalized, [/^play\s+(.+?)(?:\s+radio)?$/i]);
    return { transcript: normalized, intent: { type: "play", query: query || undefined }, feedback: query ? `Searching ${titleCase(query)}.` : "Starting playback." };
  }
  if (/\b(volume|mute|louder|quieter)\b/.test(lower)) {
    const value = parseVolume(lower);
    if (value !== null) return { transcript: normalized, intent: { type: "volume", value }, feedback: `Setting volume to ${Math.round(value * 100)}%.` };
  }
  if (/\b(wander|take me somewhere|surprise me)\b/.test(lower)) return { transcript: normalized, intent: { type: "wander", query: normalized }, feedback: "Starting Wanderer Mode." };
  if (/^teleport\b/.test(lower)) {
    const query = stripCommand(normalized, [/^teleport\s+(?:to\s+)?(.+)$/i]);
    return { transcript: normalized, intent: { type: "teleport", query: query || undefined }, feedback: query ? `Teleporting to ${titleCase(query)}.` : "Teleporting." };
  }
  if (/^(?:go to|take me to)\b/.test(lower)) {
    const query = stripCommand(normalized, [/^(?:go to|take me to)\s+(.+)$/i]);
    if (query) return { transcript: normalized, intent: { type: "search", query, action: "navigate" }, feedback: `Navigating to ${titleCase(query)}.` };
  }
  if (/^(?:stations in)\b/.test(lower)) {
    const query = stripCommand(normalized, [/^stations in\s+(.+)$/i]);
    if (query) return { transcript: normalized, intent: { type: "search", query, action: "search" }, feedback: `Searching stations in ${titleCase(query)}.` };
  }
  if (/^(search|find|look for)\b/.test(lower)) {
    const query = stripCommand(normalized, [/^(?:search|find|look for)\s+(?:for\s+)?(.+)$/i]);
    if (query) return { transcript: normalized, intent: { type: "search", query, action: "search" }, feedback: `Searching ${titleCase(query)}.` };
  }
  return { transcript: normalized, intent: { type: "search", query: normalized }, feedback: `Searching ${titleCase(normalized)}.` };
}

function enhancedRecognitionConstructor(NativeRecognition: BrowserSpeechRecognitionConstructor): BrowserSpeechRecognitionConstructor {
  return class AtlasSpeechRecognition implements BrowserSpeechRecognition {
    private native: BrowserSpeechRecognition;
    private generation = 0;
    private delivered = false;
    private resolving = false;
    private ended = false;
    private endHandler: (() => void) | null = null;
    private resultHandler: ((event: BrowserSpeechEvent) => void) | null = null;

    constructor() { this.native = new NativeRecognition(); }
    get lang() { return this.native.lang; }
    set lang(value: string) { this.native.lang = value; }
    get interimResults() { return this.native.interimResults; }
    set interimResults(value: boolean) { this.native.interimResults = value; }
    get continuous() { return this.native.continuous; }
    set continuous(value: boolean) { this.native.continuous = value; }
    get maxAlternatives() { return this.native.maxAlternatives; }
    set maxAlternatives(value: number) {
      this.native.maxAlternatives = Math.max(5, Number.isFinite(value) ? value : 1);
    }
    get onstart() { return this.native.onstart; }
    set onstart(value: (() => void) | null) { this.native.onstart = value; }
    get onend() { return this.endHandler; }
    set onend(value: (() => void) | null) {
      this.endHandler = value;
      this.native.onend = () => { this.ended = true; if (!this.resolving) this.endHandler?.(); };
    }
    get onerror() { return this.native.onerror; }
    set onerror(value: ((event: { error?: string; message?: string }) => void) | null) { this.native.onerror = value; }
    get onresult() { return this.resultHandler; }
    set onresult(value: ((event: BrowserSpeechEvent) => void) | null) {
      this.resultHandler = value;
      this.native.onresult = value ? async (event) => {
        const generation = this.generation;
        if (this.delivered) return;
        const first = event.results?.[event.resultIndex ?? 0] ?? event.results?.[0];
        if (!first?.isFinal) { value(event); return; }
        const alternatives: BrowserSpeechAlternative[] = [];
        if (first) {
          for (let index = 0; index < first.length; index += 1) {
            const candidate = first[index];
            if (candidate?.transcript) alternatives.push(candidate);
          }
        }
        this.resolving = true;
        const best = await resolveAgainstAtlasDirectory(alternatives);
        if (generation === this.generation) this.resolving = false;
        if (generation !== this.generation || this.delivered) return;
        this.delivered = true;
        if (!best.transcript) { value(event); return; }
        const result = Object.assign([{ transcript: best.transcript, confidence: best.confidence }], { isFinal: true });
        value({ resultIndex: 0, results: [result] });
        if (generation === this.generation && this.ended) this.endHandler?.();
      } : null;
    }
    start() { this.generation += 1; this.delivered = false; this.resolving = false; this.ended = false; this.native.start(); }
    stop() { this.native.stop(); }
    abort() { this.generation += 1; this.resolving = false; this.native.abort(); }
  };
}

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  const NativeRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  return NativeRecognition ? enhancedRecognitionConstructor(NativeRecognition) : null;
}

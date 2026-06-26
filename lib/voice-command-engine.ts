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
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
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

function cleanTranscript(transcript: string) {
  return transcript.trim().replace(/[.!?]+$/g, "").replace(LEADING_POLITE_WORDS, "").trim();
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
  const normalized = cleanTranscript(transcript);
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

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

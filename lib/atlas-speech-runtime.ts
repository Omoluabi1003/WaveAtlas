export type AtlasSpeechCandidate = { transcript: string; confidence: number };

export type AtlasSpeechRecognition = {
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
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }> & { isFinal?: boolean }> }) => void) | null;
};

type RecognitionCtor = new () => AtlasSpeechRecognition;

export function nativeSpeechRecognitionConstructor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

export function collectSpeechCandidates(event: Parameters<NonNullable<AtlasSpeechRecognition['onresult']>>[0]) {
  const candidates: AtlasSpeechCandidate[] = [];
  for (let resultIndex = event.resultIndex || 0; resultIndex < event.results.length; resultIndex += 1) {
    const result = event.results[resultIndex];
    if (result?.isFinal === false) continue;
    for (let alternativeIndex = 0; alternativeIndex < result.length; alternativeIndex += 1) {
      const alternative = result[alternativeIndex];
      const transcript = alternative?.transcript?.trim();
      if (!transcript) continue;
      const confidence = Number.isFinite(alternative.confidence) ? Number(alternative.confidence) : Math.max(0.35, 0.7 - alternativeIndex * 0.07);
      if (!candidates.some((item) => item.transcript.toLowerCase() === transcript.toLowerCase())) candidates.push({ transcript, confidence });
    }
  }
  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

export async function resolveAtlasSpeech(candidates: AtlasSpeechCandidate[], context?: { country?: string; city?: string; stationName?: string }) {
  if (!candidates.length) return null;
  try {
    const response = await fetch('/api/atlas-speech/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alternatives: candidates, context }),
    });
    if (response.ok) {
      const data = await response.json();
      if (typeof data?.transcript === 'string' && data.transcript.trim()) {
        return { transcript: data.transcript.trim(), confidence: Number(data.confidence) || candidates[0].confidence, station: data.station || null };
      }
    }
  } catch { /* local fallback below */ }
  return { transcript: candidates[0].transcript, confidence: candidates[0].confidence, station: null };
}

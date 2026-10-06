export type AtlasVoiceId = 'aura' | 'cove' | 'ember' | 'flint' | 'vale' | 'fable' | 'omoluabi-paul' | 'natural';

export type AtlasVoiceProfile = {
  id: AtlasVoiceId;
  name: string;
  description: string;
  locale: string;
  neuralVoice?: string;
  systemOnly?: boolean;
  nigerian?: boolean;
  preview: string;
};

export const ATLAS_VOICES: AtlasVoiceProfile[] = [
  { id: 'aura', name: 'Aura', description: 'Warm · Expressive', locale: 'en-US', neuralVoice: 'af_bella', preview: 'Welcome to WaveAtlas. Where in the world should we listen today?' },
  { id: 'cove', name: 'Cove', description: 'Calm · Intimate', locale: 'en-US', neuralVoice: 'af_nicole', preview: 'I am ready. Tell me what kind of signal you want to discover.' },
  { id: 'ember', name: 'Ember', description: 'Warm · Mature', locale: 'en-US', neuralVoice: 'am_michael', preview: 'Let us find a signal worth staying with.' },
  { id: 'flint', name: 'Flint', description: 'Deep · Composed', locale: 'en-US', neuralVoice: 'am_fenrir', preview: 'The Atlas is open. Tell me where you want to go.' },
  { id: 'vale', name: 'Vale', description: 'Refined · British', locale: 'en-GB', neuralVoice: 'bf_emma', preview: 'Welcome to the Atlas. Shall we find something interesting?' },
  { id: 'fable', name: 'Fable', description: 'Conversational · British', locale: 'en-GB', neuralVoice: 'bm_fable', preview: 'Tell me what you fancy listening to, and I will find it.' },
  {
    id: 'omoluabi-paul',
    name: 'Omoluabi Paul',
    description: 'Nigerian · Warm · Grounded',
    locale: 'en-NG',
    systemOnly: true,
    nigerian: true,
    preview: 'How far? I dey here with you. Tell me where you wan make we listen, and we go find the signal together.',
  },
  { id: 'natural', name: 'Natural', description: 'Best voice on this device', locale: 'en-US', systemOnly: true, preview: 'This is the most natural voice available on your device.' },
];

export const DEFAULT_ATLAS_VOICE: AtlasVoiceId = 'aura';
export const ATLAS_VOICE_STORAGE_KEY = 'waveatlas:atlas-voice';

export function getAtlasVoice(id?: string | null) {
  return ATLAS_VOICES.find((voice) => voice.id === id) ?? ATLAS_VOICES.find((voice) => voice.id === DEFAULT_ATLAS_VOICE)!;
}

export function looksLikeNigerianPidgin(text: string) {
  return /\b(?:abeg|abi|dey|don|go\s+fit|how\s+far|make\s+we|na\s+|no\s+wahala|wetin|wey|una|wan\s+|e\s+be|sha|sef)\b/i.test(text);
}

import { deriveReciprocalAtlasSignal, type ReciprocalAtlasInput, type ReciprocalAtlasSignal } from './atlas-reciprocal-intelligence';

let currentSignal: ReciprocalAtlasSignal = deriveReciprocalAtlasSignal();

/**
 * In-memory only. Refreshing the app resets the signal. This intentionally avoids
 * creating a hidden behavioural profile while still letting WaveAtlas respond to
 * what is happening in the current listening session.
 */
export function updateReciprocalAtlasSession(input: ReciprocalAtlasInput) {
  currentSignal = deriveReciprocalAtlasSignal(input);
  return currentSignal;
}

export function readReciprocalAtlasSession() {
  return currentSignal;
}

/**
 * Browser Permission Manager for WaveAtlas.
 * Provides unified permission status checks, preflight via Permissions API,
 * single-gesture entry point execution, silent permission reuse, and refusal handling.
 *
 * Non-negotiable platform rules:
 * - Never attempt to bypass browser/OS permissions.
 * - Request permission only when required from user gesture.
 * - Detect and reuse granted permissions silently.
 * - Do not loop permission requests or nag on denial.
 */

export type PermissionKind = 'microphone' | 'geolocation';

export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface PermissionStatusResult {
  kind: PermissionKind;
  state: PermissionState;
}

// In-memory session tracking of explicit user denials to avoid repeating prompts during a session
const sessionDenials = new Set<PermissionKind>();

/**
 * Inspect permission state via Permissions API if available without triggering a browser prompt.
 */
export async function checkPermissionStatus(kind: PermissionKind): Promise<PermissionStatusResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { kind, state: 'unsupported' };
  }

  // If denied in current session, respect denial immediately
  if (sessionDenials.has(kind)) {
    return { kind, state: 'denied' };
  }

  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      // Name mapping for Permissions API
      const permissionName = kind as PermissionName;
      const status = await navigator.permissions.query({ name: permissionName });
      const stateMap: Record<string, PermissionState> = {
        granted: 'granted',
        prompt: 'prompt',
        denied: 'denied',
      };
      const mappedState = stateMap[status.state] || 'prompt';
      if (mappedState === 'denied') {
        sessionDenials.add(kind);
      }
      return { kind, state: mappedState };
    } catch {
      // Permissions API query for this permission may throw in some browsers (e.g. Safari microphone query)
    }
  }

  return { kind, state: 'prompt' };
}

/**
 * Handle microphone access request.
 * Invoked from a user action/gesture.
 */
export async function requestMicrophonePermission(): Promise<{ granted: boolean; stream?: MediaStream; state: PermissionState }> {
  const preflight = await checkPermissionStatus('microphone');

  if (preflight.state === 'denied') {
    return { granted: false, state: 'denied' };
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return { granted: false, state: 'unsupported' };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { granted: true, stream, state: 'granted' };
  } catch (err: unknown) {
    const isDenied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
    if (isDenied) {
      sessionDenials.add('microphone');
    }
    return { granted: false, state: isDenied ? 'denied' : 'prompt' };
  }
}

/**
 * Mark a permission as denied for the current session.
 */
export function recordPermissionDenied(kind: PermissionKind) {
  sessionDenials.add(kind);
}

/**
 * Clear session denial cache (useful for testing or explicit retry gesture).
 */
export function resetPermissionSession() {
  sessionDenials.clear();
}

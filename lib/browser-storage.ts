// Storage can be disabled by browser privacy settings, even on HTTPS pages.
export function readBrowserStorage(kind: "local" | "session", key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window[kind === "local" ? "localStorage" : "sessionStorage"].getItem(key);
  } catch { return null; }
}

export function writeBrowserStorage(kind: "local" | "session", key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window[kind === "local" ? "localStorage" : "sessionStorage"].setItem(key, value);
  } catch { /* A saved preference must never prevent an interaction. */ }
}

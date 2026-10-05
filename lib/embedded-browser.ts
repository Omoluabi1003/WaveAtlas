export function needsCompatibilityPlayer(userAgent: string): boolean {
  if (!/Android/i.test(userAgent)) return false;
  const chrome = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  if (chrome) return Number(chrome[1]) < 111;
  const firefox = /Firefox\/(\d+)/.exec(userAgent);
  if (firefox) return Number(firefox[1]) < 111;
  return /Version\/[1-4]\./.test(userAgent);
}

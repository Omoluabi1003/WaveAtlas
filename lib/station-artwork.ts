import type { Station } from './stations';
// Only known broadcaster origins may be fetched server-side for an OG card.
const broadcasterHosts = ['bbc.co.uk','bbc.com','radiofrance.fr','rfi.fr','dw.com','npr.org','nhk.or.jp'];
export function trustedStationArtwork(station: Station) {
  if (!station.favicon || !(station.curation_tier === 'curated_atlas' || station.verification_status === 'verified')) return null;
  try { const url = new URL(station.favicon); return url.protocol === 'https:' && !url.username && !url.password && !url.port && broadcasterHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null; } catch { return null; }
}
export async function loadStationArtwork(station: Station): Promise<string | null> {
  const url = trustedStationArtwork(station); if (!url) return null;
  try {
    const response = await fetch(url,{ signal:AbortSignal.timeout(1500),redirect:'error',cache:'force-cache' });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !type || !['image/png','image/jpeg','image/webp'].includes(type) || Number(response.headers.get('content-length') || 0) > 256000) return null;
    const reader = response.body?.getReader(); if (!reader) return null;
    const chunks: Uint8Array[]=[];let total=0;
    while (true) { const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>256000){await reader.cancel();return null;}chunks.push(chunk.value); }
    return `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
  } catch { return null; }
}

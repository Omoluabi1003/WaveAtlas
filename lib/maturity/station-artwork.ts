import type { Station } from '../stations';
// Only publisher-reviewed catalog artwork on known public image hosts is eligible.
// Redirects are rejected so this cannot turn into an arbitrary server-side fetch.
export async function stationArtwork(station: Station | null) {
  if (!station?.favicon || station.curation_tier !== 'curated_atlas') return null;
  try {
    const url = new URL(station.favicon);
    if (url.protocol !== 'https:' || !['raw.githubusercontent.com','upload.wikimedia.org'].includes(url.hostname)) return null;
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(1500), next: { revalidate: 86400 } });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !['image/png','image/jpeg','image/webp'].includes(type || '') || Number(response.headers.get('content-length')) > 1000000) return null;
    const reader=response.body?.getReader();if(!reader)return null;
    const chunks: Uint8Array[]=[];let length=0;
    for (;;) { const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1000000){await reader.cancel();return null;}chunks.push(value); }
    return `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
  } catch { return null; }
}

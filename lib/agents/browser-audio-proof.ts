import type { Page } from '@playwright/test';
import { fetchProbeResource, type ProbeDependencies } from './stream-probe';

/** Decode a bounded public-address-pinned sample. No browser requests reach untrusted URLs. */
export async function browserAudioProof(page: Page, url: string, kind: string, dependencies: ProbeDependencies = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    // HLS/M3U acquisition remains pending until full browser transport can be verified.
    if (!/^audio-(mpeg|aac|ogg|flac|wav)$/.test(kind)) return { ok:false, reason:'playlist_browser_transport_pending', seconds:0 };
    const resource = await fetchProbeResource(url, controller.signal, dependencies, { media:true, maxBytes:65536 });
    if (![200,206].includes(resource.status) || resource.redirect) return {ok:false,reason:'sample_changed_or_redirected',seconds:0};
    const mime: Record<string,string> = {mpeg:'audio/mpeg',aac:'audio/aac',ogg:'audio/ogg',flac:'audio/flac',wav:'audio/wav'};
    return await page.evaluate(async ({base64,type}) => {
      const bytes = Uint8Array.from(atob(base64), char=>char.charCodeAt(0));
      const blob = URL.createObjectURL(new Blob([bytes],{type}));
      const audio = document.createElement('audio'); audio.muted=true; audio.preload='auto'; audio.src=blob;
      return await new Promise<{ok:boolean;reason:string;seconds:number}>(resolve=>{
        let settled=false;
        const finish=(ok:boolean,reason:string)=>{
          if(settled)return;settled=true;clearTimeout(timeout);
          const seconds=Number.isFinite(audio.currentTime)?audio.currentTime:0;
          audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(blob);
          resolve({ok,reason,seconds});
        };
        const timeout=setTimeout(()=>finish(false,'decoder_timeout'),4000);
        audio.onloadeddata=()=>{void audio.play().catch(()=>finish(false,'decoder_play_rejected'));};
        audio.ontimeupdate=()=>{if(audio.currentTime>=0.15)finish(true,'chromium_sample_decoded');};
        audio.onended=()=>finish(audio.currentTime>=0.15,'sample_ended');
        audio.onerror=()=>finish(false,'decoder_error');
        audio.load();
      });
    },{base64:resource.bytes.toString('base64'),type:mime[kind.slice(6)]});
  } catch { return {ok:false,reason:'sample_network_inconclusive',seconds:0}; }
  finally {clearTimeout(timer);}
}

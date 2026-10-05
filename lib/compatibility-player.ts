import { stationNightNotice } from "./station-night-notice";
import type { Station } from "./stations";
import { isoCountryCentroids } from "./geotruth-resolver";

export function escapePlayerHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function compatibilityStream(station: Station): string {
  const candidates = [station.url_resolved, station.url];
  return candidates.find((url) => url && /^https:\/\//i.test(url.trim()))?.trim() || "";
}

export function renderCompatibilityPlayer(stations: Station[], selected: Station | undefined, query: string, country: string, missingStation = false): string {
  const esc = escapePlayerHtml;
  const link = (id: string) => "/listen?" + new URLSearchParams({ station: id, q: query, country }).toString();
  const cards = stations.map((station) => `<article><h2>${esc(station.name)}</h2><p>${esc([station.city || station.state, station.country].filter(Boolean).join(" · "))}</p><p>${esc(station.language || "Live radio")}</p><a class="button" href="${esc(link(station.station_uuid || station.id))}">Listen</a></article>`).join("");
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const countryNames = new Map(Object.keys(isoCountryCentroids).map((code) => [code, names.of(code) || code]));
  for (const station of stations) countryNames.set(station.country_code, station.country);
  const countries = Array.from(countryNames.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  if (country && !countries.some(([code]) => code === country)) countries.unshift([country, country]);
  const options = countries.map(([code, name]) => `<option value="${esc(code)}"${code === country ? " selected" : ""}>${esc(name)}</option>`).join("");
  const audio = selected && compatibilityStream(selected);
  const night = selected && stationNightNotice(selected, Date.now());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${selected ? esc(selected.name) + " | " : ""}WaveAtlas | Listen</title>
<style>body{margin:0;background:#08111d;color:#f7f5ef;font:16px Arial,sans-serif;line-height:1.5}main{max-width:1050px;margin:auto;padding:24px}h1{font-size:32px;margin:0}h2{font-size:20px;margin:0 0 8px}p{margin:8px 0;color:#ccd5dc}a{color:#00d68f}header{padding:16px 0 24px;border-bottom:1px solid #344557}.label{color:#d4a64a;font-size:13px;letter-spacing:2px}form,.player{margin:24px 0;padding:20px;background:#122338;border-radius:16px}label{display:block;margin:10px 0}input,select{box-sizing:border-box;width:100%;padding:14px;border:1px solid #658098;border-radius:8px;background:#08111d;color:#fff;font:inherit}button,.button{display:inline-block;cursor:pointer;background:#00d68f;color:#08111d;border:0;border-radius:24px;padding:12px 22px;font:700 16px Arial,sans-serif;text-decoration:none;margin-top:12px}a:focus,button:focus,input:focus,select:focus{outline:3px solid #d4a64a;outline-offset:3px}article{display:inline-block;vertical-align:top;box-sizing:border-box;width:48%;margin:0 1% 16px 0;padding:20px;border:1px solid #344557;border-radius:16px}audio{display:block;width:100%;margin:16px 0}.muted{font-size:14px}.player{border:1px solid #d4a64a}.night-notice{position:fixed;bottom:16px;left:16px;right:16px;max-width:340px;margin:auto;padding:12px 16px;background:#122338;color:#e0e7ee;border:1px solid #344557;border-radius:16px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.2)}.night-notice button{float:right;margin:-4px -6px 0 8px;padding:4px 10px;background:transparent;color:#ccd5dc;font-size:16px}@media(max-width:620px){main{padding:16px}article{width:100%;margin-right:0}}</style></head><body><main>
<header><p class="label">EXPLORE HUMANITY THROUGH SOUND</p><h1>WaveAtlas™</h1><p>Lightweight listening for your browser.</p><a href="/?full=1">Open the full atlas</a></header>
${selected ? `<section class="player" aria-label="Selected station"><h2>${esc(selected.name)}</h2><p>${esc(selected.country)}</p>${audio ? `<audio controls preload="none" src="${esc(audio)}">Your browser does not support audio playback.</audio><p id="playback-status" role="status">Press Play to tune in.</p>` : `<p>This stream is unavailable in this listening view. Choose another station.</p>`}</section>` : missingStation ? `<p role="status">The shared station could not be found. Search below to choose a signal.</p>` : ""}
<form action="/listen" method="get"><label for="q">Station name or location</label><input id="q" name="q" value="${esc(query)}" placeholder="Search stations"><label for="country">Country</label><select id="country" name="country"><option value="">Worldwide</option>${options}</select><button type="submit">Search</button><p class="muted">Select Listen, then press Play. Stream availability and audio formats depend on the broadcaster and your browser.</p></form>
<section aria-label="Radio stations">${cards || "<p>No matching stations found. Try another name or choose Worldwide.</p>"}</section>
${night ? `<div id="night-notice" class="night-notice" role="status" aria-live="polite"><button type="button" id="dismiss-night-notice" aria-label="Dismiss nighttime notification">×</button><span aria-hidden="true">☾</span> ${esc(night.title)}</div>` : ""}
<footer><p class="muted">The interactive globe and city lights are available in the full atlas on a supported browser.</p></footer>
<script>(function(){var n=document.getElementById('night-notice');if(n){setTimeout(function(){n.style.display='none';},4500);document.getElementById('dismiss-night-notice').onclick=function(){n.style.display='none';};}var a=document.getElementsByTagName('audio')[0],s=document.getElementById('playback-status');if(!a||!s)return;a.addEventListener('playing',function(){s.textContent='Playing live.';});a.addEventListener('waiting',function(){s.textContent='Connecting to the station...';});a.addEventListener('error',function(){s.textContent='This stream could not play. Please try another station.';});}());</script>
</main></body></html>`;
}

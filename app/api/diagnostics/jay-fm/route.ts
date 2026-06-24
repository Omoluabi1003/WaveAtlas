import { NextResponse } from "next/server";

const RADIO_BROWSER_API_BASE = process.env.RADIO_BROWSER_API_BASE ?? "https://de1.api.radio-browser.info/json";
const USER_AGENT = "WaveAtlas/1.0 (jay-fm-stream-diagnostic)";
const OFFICIAL_SITE = "https://jayfm.ng/";

type RadioBrowserStation = {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  language?: string;
  tags?: string;
  codec?: string;
  bitrate?: number;
  lastcheckok?: number;
  lastchecktime_iso8601?: string;
};

type UrlProbe = {
  url: string;
  ok: boolean;
  status?: number;
  contentType?: string | null;
  finalUrl?: string;
  error?: string;
};

function unique<T>(items: T[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function extractCandidateUrls(html: string) {
  const urls = new Set<string>();
  const sourceMatches = html.matchAll(/<(?:audio|source)\b[^>]*(?:src|data-src)=["']([^"']+)["']/gi);
  for (const match of sourceMatches) urls.add(new URL(match[1], OFFICIAL_SITE).toString());

  const broadMatches = html.matchAll(/https?:\/\/[^\s"'<>]+/gi);
  for (const match of broadMatches) {
    const url = match[0].replace(/[),.;]+$/, "");
    if (/(?:mp3|aac|m3u8|pls|stream|icecast|shoutcast|radio|live)/i.test(url)) urls.add(url);
  }
  return Array.from(urls);
}

async function fetchRadioBrowserCandidates() {
  const searches = ["Jay 101.9", "Jay FM", "Jayfm", "Jay 101.9 FM Jos"];
  const results: RadioBrowserStation[] = [];
  for (const name of searches) {
    const params = new URLSearchParams({ name, countrycode: "NG", hidebroken: "false", limit: "10" });
    const response = await fetch(`${RADIO_BROWSER_API_BASE}/stations/search?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) continue;
    const stations = (await response.json()) as RadioBrowserStation[];
    results.push(...stations);
  }

  const seen = new Set<string>();
  return results.filter((station) => {
    const key = station.stationuuid || `${station.name}:${station.url_resolved || station.url}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchOfficialCandidates() {
  const response = await fetch(OFFICIAL_SITE, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const html = await response.text();
  return {
    status: response.status,
    pageTitle: html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null,
    candidateUrls: extractCandidateUrls(html),
    hasAudioElement: /<audio\b/i.test(html),
    hasStartListeningCopy: /start listening/i.test(html),
  };
}

async function probeUrl(url: string): Promise<UrlProbe> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Range: "bytes=0-1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
      finalUrl: response.url,
    };
  } catch (error) {
    return { url, ok: false, error: error instanceof Error ? error.message : "Unknown probe error" };
  }
}

export async function GET() {
  const [radioBrowser, official] = await Promise.allSettled([
    fetchRadioBrowserCandidates(),
    fetchOfficialCandidates(),
  ]);

  const radioBrowserStations = radioBrowser.status === "fulfilled" ? radioBrowser.value : [];
  const officialPage = official.status === "fulfilled" ? official.value : {
    status: null,
    pageTitle: null,
    candidateUrls: [] as string[],
    hasAudioElement: false,
    hasStartListeningCopy: false,
    error: official.reason instanceof Error ? official.reason.message : "Official site fetch failed",
  };

  const radioBrowserUrls = radioBrowserStations.flatMap((station) => [station.url_resolved, station.url]).filter((url): url is string => Boolean(url));
  const officialUrls = "candidateUrls" in officialPage ? officialPage.candidateUrls : [];
  const urlsToProbe = unique([...radioBrowserUrls, ...officialUrls]).slice(0, 20);
  const probes = await Promise.all(urlsToProbe.map(probeUrl));

  return NextResponse.json({
    station: "Jay FM 101.9 Jos",
    purpose: "Compare WaveAtlas Radio Browser stream candidates against official Jay FM page stream hints before any playback override.",
    radioBrowser: {
      apiBase: RADIO_BROWSER_API_BASE,
      count: radioBrowserStations.length,
      stations: radioBrowserStations.map((station) => ({
        stationuuid: station.stationuuid,
        name: station.name,
        url: station.url,
        url_resolved: station.url_resolved,
        homepage: station.homepage,
        country: station.country,
        countrycode: station.countrycode,
        state: station.state,
        language: station.language,
        tags: station.tags,
        codec: station.codec,
        bitrate: station.bitrate,
        lastcheckok: station.lastcheckok,
        lastchecktime_iso8601: station.lastchecktime_iso8601,
      })),
    },
    officialSite: officialPage,
    probes,
    radioGarden: {
      status: "not_confirmed_by_endpoint",
      note: "Radio Garden stream URLs are not exposed in the WaveAtlas codebase. Use this diagnostic output to compare against any Radio Garden network URL captured manually from the browser devtools if needed.",
    },
  });
}

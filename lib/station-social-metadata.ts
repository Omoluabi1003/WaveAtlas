import type { Metadata } from 'next';
import { countryMetadata } from './country-metadata';
import { WAVEATLAS_SITE_URL } from './branding';
import { stationPath } from './station-deep-link';
import type { Station } from './stations';

export function stationSocialMetadata(station: Station): Metadata {
  const country = countryMetadata(station);
  const title = `${station.name} | WaveAtlas`;
  const city = station.city?.trim();
  const description = `Listen to ${station.name}${country ? ` from ${[city, country.name].filter(Boolean).join(', ')}` : ''} on WaveAtlas.`;
  const canonical = `${WAVEATLAS_SITE_URL}${stationPath(station)}`;
  const image = { url: `${canonical}/opengraph-image`, width: 1200, height: 630, alt: `${station.name} | ${country?.name || 'Global radio'} | WaveAtlas` };
  return {
    title: { absolute: title }, description: `${description} Explore humanity through sound.`,
    alternates: { canonical },
    openGraph: { type: 'website', siteName: 'WaveAtlas', title, description, url: canonical, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export function stationCardDetails(station: Station) {
  const country = countryMetadata(station);
  const location = [...new Set([station.city, station.state].filter((value): value is string => Boolean(value?.trim()) && !/^(unknown|global|n\/a)$/i.test(value!.trim()) && value!.trim().toLowerCase() !== country?.name.toLowerCase()))].join(' · ');
  // Frequency is only included when the broadcaster explicitly supplies units in its name.
  const frequency = station.name.match(/\b\d{2,4}(?:[.,]\d{1,2})?\s*(?:MHz|kHz|FM|AM)\b/i)?.[0];
  const length = [...station.name].length;
  return { country, location, frequency, fontSize: length > 120 ? 32 : length > 80 ? 40 : length > 45 ? 50 : 64 };
}

export function cardNameLines(name: string, fontSize: number) {
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name)].map(item => item.segment);
  const lines: string[] = []; let line = ''; let width = 0;
  for (const segment of segments) {
    const advance = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(segment) ? fontSize : fontSize * 0.68;
    if (width + advance > 800 && line) {
      const space = line.lastIndexOf(' ');
      if (space > line.length * 0.3) {
        lines.push(line.slice(0, space).trim());
        line = line.slice(space + 1); width = [...line].length * fontSize * 0.68;
      } else { lines.push(line.trim()); line = ''; width = 0; }
    }
    if (lines.length === 4) { lines[3] = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(lines[3])].map(item => item.segment).slice(0, -2).join('') + '…'; return lines; }
    line += segment; width += advance;
  }
  if (line) lines.push(line.trim());
  return lines;
}


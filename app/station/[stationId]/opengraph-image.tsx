import { stationArtwork } from '@/lib/maturity/station-artwork';
import { stationCardVisualText } from '@/lib/station-card-text';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchStationByUuid } from '@/lib/stations';
import { cardNameLines, stationCardDetails } from '@/lib/station-social-metadata';

export const runtime = 'nodejs';
export const alt = 'Station radio on WaveAtlas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

let branding: Promise<string> | undefined;
const fontCache = new Map<string, Promise<Buffer>>();
const font = (name: string) => {
  if (!fontCache.has(name)) fontCache.set(name, readFile(path.join(process.cwd(), "assets/social-fonts", `${name}.woff`)));
  return fontCache.get(name)!;
};


export default async function StationImage({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await params;
  const station = await fetchStationByUuid(stationId).catch(() => null);
  const name = station?.name || 'Discover the world through radio';
  const details = station ? stationCardDetails(station) : { country: null, location: '', frequency: undefined, fontSize: 56 };
  branding ||= readFile(path.join(process.cwd(), 'public/brand/waveatlas-atlas-compass.svg')).then(data => `data:image/svg+xml;base64,${data.toString('base64')}`);
  const fontNames = ['NotoSans'];
  const visibleText = [name, details.location, details.country?.name].filter(Boolean).join(' ');
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(visibleText)) fontNames.push('NotoSansCJK');
  if (/\p{Script=Arabic}/u.test(visibleText)) fontNames.push('NotoSansArabic');
  if (/\p{Script=Hebrew}/u.test(visibleText)) fontNames.push('NotoSansHebrew');
  if (/\p{Script=Devanagari}/u.test(visibleText)) fontNames.push('NotoSansDevanagari');
  if (/\p{Script=Thai}/u.test(visibleText)) fontNames.push('NotoSansThai');
  const [logo, flag, fonts, artwork] = await Promise.all([
    branding,
    details.country ? readFile(path.join(process.cwd(), "public/flags", `${details.country.code.toLowerCase()}.svg`)).then(data => `data:image/svg+xml;base64,${data.toString('base64')}`).catch(() => null) : null,
    Promise.all(fontNames.map(async name => ({ name, data: await font(name), weight: 400 as const, style: 'normal' as const }))),
    stationArtwork(station),
  ]);
  const fontFamily = fontNames.join(', ');
  const lines = cardNameLines(name, details.fontSize);
  const nameFontSize = Math.min(details.fontSize, Math.floor(250 / (lines.length * 1.2)));
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#08111D', color: '#F7F5EF', padding: '44px 56px', fontFamily, position: 'relative' }}>
      <div style={{ display: 'flex', position: 'absolute', right: -170, top: 110, width: 470, height: 470, border: '1px solid #00D68F30', borderRadius: '50%' }}>
        <div style={{ display: 'flex', position: 'absolute', left: 80, width: 300, height: 470, border: '1px solid #00D68F30', borderRadius: '50%' }} />
        <div style={{ display: 'flex', position: 'absolute', top: 155, width: 470, height: 160, border: '1px solid #00D68F30', borderRadius: '50%' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* ImageResponse renders embedded SVGs server-side. */}
        <img src={logo} alt="" width={64} height={64} />
        <div style={{ display: 'flex', fontSize: 30, letterSpacing: -1 }}>WaveAtlas</div>
        <div style={{ display: 'flex', marginLeft: 'auto', color: '#00D68F', fontSize: 16, letterSpacing: 3 }}>GLOBAL RADIO ATLAS</div>
      </div>
      {artwork ? <img src={artwork} alt="" width={140} height={140} style={{ position: "absolute", right: 52, top: 240, objectFit: "contain", borderRadius: 18 }} /> : null}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 38, gap: 14, height: 32 }}>
        {flag ? <img src={flag} alt="" width={40} height={30} style={{ borderRadius: 4 }} /> : <div style={{ display: 'flex', width: 28, height: 28, border: '2px solid #D4A64A', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', color: '#D4A64A' }}><div style={{ display: 'flex', width: 10, height: 24, border: '1px solid #D4A64A', borderRadius: '50%' }} /></div>}
        <div style={{ display: 'flex', fontSize: 18, color: '#D4A64A', letterSpacing: 3 }}>{details.country?.name.toUpperCase() || 'WORLDWIDE'}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24, fontSize: nameFontSize, lineHeight: 1.2, width: 850, height: 270, justifyContent: 'center' }}>
        {lines.map((line, index) => <div key={index} style={{ display: 'flex' }}>{stationCardVisualText(line)}</div>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 28, fontSize: 20, color: '#F7F5EFb0' }}>
        {details.location ? <span>{stationCardVisualText(details.location.slice(0, 80))}</span> : null}
        {details.frequency ? <span style={{ color: '#00D68F' }}>{details.frequency}</span> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 20, borderTop: '1px solid #F7F5EF20' }}>
        <div style={{ display: 'flex', color: '#D4A64A', fontSize: 18 }}>Explore Humanity Through Sound</div>
        <div style={{ display: 'flex', color: '#F7F5EF90', fontSize: 16 }}>wave-atlas.vercel.app</div>
      </div>
    </div>,
    { ...size, fonts, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}

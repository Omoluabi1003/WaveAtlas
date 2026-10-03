export function editorialImageUrl(value?: string): string | undefined {
  if (!value || value.length > 2048) return undefined;
  try {
    const url = new URL(value.replace(/&amp;/g, '&').trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') return undefined;
    if (!host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function rssEditorialImage(item: string): string | undefined {
  const tags = item.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const isMedia = /^<media:/i.test(tag);
    const medium = tag.match(/\bmedium\s*=\s*["']([^"']+)/i)?.[1];
    if (medium && medium !== 'image') continue;
    const type = tag.match(/\btype\s*=\s*["']([^"']+)/i)?.[1];
    if (type && !type.startsWith('image/') || !isMedia && !type?.startsWith('image/')) continue;
    const value = tag.match(/\burl\s*=\s*["']([^"']+)/i)?.[1];
    if (/^<media:content/i.test(tag) && !type && medium !== 'image' && !/\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i.test(value || '')) continue;
    const safe = editorialImageUrl(value);
    if (safe) return safe;
  }
  return undefined;
}

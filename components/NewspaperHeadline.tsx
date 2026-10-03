'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { Headline } from '@/lib/news-agent';
import { editorialImageUrl } from '@/lib/editorial-image';

function formatDate(value?: string) {
  if (!value) return 'Publisher report';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Publisher report';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function EditorialArtwork({ sectionLabel }: { sectionLabel: string }) {
  return <div className="relative flex aspect-[16/10] min-h-52 items-end overflow-hidden bg-[radial-gradient(ellipse_at_75%_15%,#67444E,transparent_65%),linear-gradient(145deg,#382539,#211827_65%,#173D37)] p-6 sm:p-8">
    <svg viewBox="0 0 600 400" fill="none" aria-hidden="true" className="absolute inset-0 size-full opacity-65">
      <circle cx="360" cy="185" r="150" stroke="#D4A64A" strokeWidth="1" /><ellipse cx="360" cy="185" rx="88" ry="150" stroke="#D4A64A" /><ellipse cx="360" cy="185" rx="35" ry="150" stroke="#D4A64A" />
      <path d="M210 185h300M228 115h264M228 255h264M360 35v300" stroke="#D4A64A" />
      <path d="M0 285c70-120 105 90 170-30s105 65 160-15 85 55 140-55 105-70 160-95" stroke="#00D68F" strokeWidth="2" />
      <circle cx="360" cy="185" r="7" fill="#D4A64A" />
    </svg>
    <div className="relative max-w-full"><p className="text-[10px] font-semibold uppercase tracking-[.3em] text-[#E0C080]">WaveAtlas editorial artwork</p><p className="mt-3 font-serif text-4xl leading-none text-[#F7F5EF] sm:text-5xl">{sectionLabel}</p><p className="mt-3 text-xs tracking-[.16em] text-[#E2D7E4]">Explore humanity through sound.</p></div>
  </div>;
}

export function NewspaperHeadline({ headline, lead = false, sectionLabel = 'The Brief' }: { headline: Headline; lead?: boolean; sectionLabel?: string }) {
  const [failedImage, setFailedImage] = useState('');
  const image = editorialImageUrl(headline.imageUrl);
  const showImage = image && failedImage !== image;
  return <article className={`min-w-0 max-w-full overflow-hidden rounded-[1.4rem] border border-[#D4A64A]/20 bg-[#2B2031] [overflow-wrap:anywhere] ${lead ? 'md:col-span-2 md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]' : 'flex flex-col'}`}>
    {showImage ? <div className={`relative overflow-hidden bg-[#382539] ${lead ? 'min-h-52 md:h-full' : 'aspect-[16/9]'}`}><Image src={image} alt="" width={1200} height={750} unoptimized referrerPolicy="no-referrer" loading="lazy" onError={() => setFailedImage(image)} className={`w-full object-cover ${lead ? 'aspect-[16/10] md:absolute md:inset-0 md:h-full md:aspect-auto' : 'h-full'}`} /><span className="absolute bottom-3 left-3 rounded-full bg-[#211827]/90 px-3 py-1 text-[10px] font-semibold text-[#F7F5EF]">Article image</span></div> : lead ? <EditorialArtwork sectionLabel={sectionLabel} /> : null}
    <div className={`flex min-w-0 flex-1 flex-col p-5 ${lead ? 'sm:p-7 md:justify-center lg:p-9' : 'sm:p-6'}`}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[#E0C080]"><span>{lead ? 'Cover story' : sectionLabel}</span><span className="h-px w-6 bg-[#D4A64A]/50" /><time>{formatDate(headline.publishedAt)}</time></div>
      <h3 className={`font-serif font-semibold leading-[1.12] tracking-[-.025em] text-[#D4A64A] ${lead ? 'text-3xl sm:text-4xl lg:text-[2.6rem]' : 'text-2xl sm:text-[1.75rem]'}`}>{headline.title}</h3>
      <p className="mt-4 text-sm leading-7 text-[#F7F5EF]/90">{headline.summary?.replace(/\s+/g, ' ').trim() || 'Open the publisher’s article for the full report; no summary was supplied.'}</p>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#D4A64A]/15 pt-4"><span className="min-w-0 text-xs font-medium text-[#DCCEDF]">{headline.source}</span><a href={headline.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#D4A64A]/40 px-4 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#E0C080] transition hover:bg-[#D4A64A] hover:text-[#211827]">Read story <span aria-hidden="true">↗</span></a></div>
    </div>
  </article>;
}

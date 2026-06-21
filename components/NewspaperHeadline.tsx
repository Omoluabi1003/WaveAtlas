import type { Headline } from "@/lib/news-agent";

function formatDate(value?: string) {
  if (!value) return "Fresh edition";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fresh edition";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function cleanSummary(value?: string) {
  if (!value) return "A developing story from this destination, selected from open RSS and GDELT signals.";
  return value.replace(/\s+/g, " ").trim();
}

export function NewspaperHeadline({ headline, lead = false }: { headline: Headline; lead?: boolean }) {
  return (
    <article className={`min-w-0 max-w-full overflow-x-hidden border-b border-[#141414]/20 pb-4 [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word] ${lead ? "md:col-span-2" : ""}`}>
      <div className="mb-2 flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 overflow-x-hidden font-serif text-[11px] font-bold uppercase tracking-[0.18em] text-[#4A4033] [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word]">
        <span className="min-w-0 max-w-full">{headline.source}</span>
        <time>{formatDate(headline.publishedAt)}</time>
      </div>
      <h3 className={`max-w-full font-serif font-black leading-[0.96] tracking-[-0.04em] text-[#151515] [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word] ${lead ? "text-4xl md:text-5xl" : "text-2xl"}`}>{headline.title}</h3>
      <p className="mt-3 max-w-full font-serif text-sm leading-6 text-[#312a22] [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word]">{cleanSummary(headline.summary)}</p>
      <a href={headline.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex max-w-full rounded-full border border-slate-900/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-900 transition [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word] hover:bg-slate-900 hover:text-white">
        Read More
      </a>
    </article>
  );
}

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
    <article className={`border-b border-[#141414]/20 pb-4 ${lead ? "md:col-span-2" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-serif text-[11px] font-bold uppercase tracking-[0.18em] text-[#4A4033]">
        <span>{headline.source}</span>
        <time>{formatDate(headline.publishedAt)}</time>
      </div>
      <h3 className={`font-serif font-black leading-[0.96] tracking-[-0.04em] text-[#151515] ${lead ? "text-4xl md:text-5xl" : "text-2xl"}`}>{headline.title}</h3>
      <p className="mt-3 max-w-prose font-serif text-sm leading-6 text-[#312a22]">{cleanSummary(headline.summary)}</p>
      <a href={headline.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-full border border-slate-900/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-900 transition hover:bg-slate-900 hover:text-white">
        Read More
      </a>
    </article>
  );
}

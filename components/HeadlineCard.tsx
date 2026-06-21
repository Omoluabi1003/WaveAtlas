import type { Headline } from "@/lib/news-agent";

function formatDate(value?: string) {
  if (!value) return "Fresh";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fresh";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function HeadlineCard({ headline }: { headline: Headline }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold/90">
        <span className="truncate">{headline.source}</span>
        <time className="shrink-0 text-ivory/45">{formatDate(headline.publishedAt)}</time>
      </div>
      <h3 className="font-display text-base font-bold leading-snug text-white">{headline.title}</h3>
      {headline.summary ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-ivory/70">{headline.summary}</p> : null}
      <a href={headline.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-full border border-radio/25 px-3 py-1.5 text-xs font-semibold text-radio transition hover:bg-radio/10">
        Read More
      </a>
    </article>
  );
}

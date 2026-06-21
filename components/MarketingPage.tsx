import Link from "next/link";
import { BRAND } from "@/lib/branding";

export type MarketingPageProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

const nav = [
  ["Demo", "/demo"],
  ["About", "/about"],
  ["Legal", "/legal"],
  ["Press", "/press"],
] as const;

export function MarketingPage({ eyebrow = "WaveAtlas™", title, description, children }: MarketingPageProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(0,214,143,0.22),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(245,183,0,0.16),transparent_28%),#06111f] px-5 py-6 text-ivory sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-white/10 bg-slate-950/45 px-4 py-3 shadow-2xl backdrop-blur-2xl">
          <Link href="/" className="font-display text-lg font-bold text-white">{BRAND.name}™</Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm text-ivory/70">
            {nav.map(([label, href]) => <Link key={href} href={href} className="rounded-full px-3 py-1.5 transition hover:bg-white/10 hover:text-radio">{label}</Link>)}
          </nav>
        </header>
        <section className="py-14 sm:py-20">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-radio">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl font-display text-4xl font-black leading-tight text-white sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-ivory/76">{description}</p>
        </section>
        {children}
      </div>
    </main>
  );
}

export function EnterAppCtas() {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link href="/" className="rounded-full bg-gradient-to-r from-[#00D68F] via-radio to-emerald-300 px-6 py-3 text-sm font-bold text-midnight shadow-[0_18px_42px_rgba(0,214,143,0.28)]">Enter WaveAtlas™</Link>
      <Link href="/?mode=add-signal" className="rounded-full border border-gold/35 bg-gold/10 px-6 py-3 text-sm font-bold text-gold transition hover:bg-gold/15">Add Your Signal</Link>
    </div>
  );
}

export function LegalDisclaimer() {
  return <p className="rounded-3xl border border-gold/25 bg-gold/10 p-4 text-sm leading-6 text-ivory/75">Effective date: 2026. These pages are provided for product transparency and are not legal advice. They should be reviewed by qualified counsel before commercial launch.</p>;
}

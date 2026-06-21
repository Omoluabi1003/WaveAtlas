import { LegalDisclaimer, MarketingPage } from "@/components/MarketingPage";

export function PolicyPage({ title, intro, sections }: { title: string; intro: string; sections: { heading: string; body: string }[] }) {
  return <MarketingPage eyebrow="Legal" title={title} description={intro}><LegalDisclaimer /><div className="mt-6 space-y-4">{sections.map((section) => <section key={section.heading} className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl"><h2 className="font-display text-2xl font-bold text-white">{section.heading}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-ivory/72">{section.body}</p></section>)}</div></MarketingPage>;
}

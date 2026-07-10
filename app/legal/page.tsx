import Link from "next/link";
import { LegalDisclaimer, MarketingPage } from "@/components/MarketingPage";

const policies = [
  ["Terms of Service", "/legal/terms", "Service rules, user responsibilities, third-party content, and liability terms."],
  ["Privacy Policy", "/legal/privacy", "Storage, submissions, optional email, analytics, retention, and rights."],
  ["Copyright & DMCA", "/legal/copyright", "Rights-holder ownership, article limits, takedown format, and removal requests."],
  ["Community Signals Policy", "/legal/community-signals", "How submitted stream URLs are reviewed, categorized, degraded, or removed."],
  ["Attribution Policy", "/legal/attribution", "WaveAtlas, developer credit, streams, maps, news, RSS, and open data attribution."],
] as const;

export default function LegalPage() {
  return <MarketingPage eyebrow="Legal Center" title="Legal Center" description="Professional policies for WaveAtlas™ users, community submissions, radio indexing, and WaveAtlas Daily™."><LegalDisclaimer /><div className="mt-6 grid gap-4 md:grid-cols-2">{policies.map(([title, href, description]) => <Link key={href} href={href} className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl transition hover:border-radio/35"><h2 className="font-display text-2xl font-bold text-white">{title}</h2><p className="mt-3 text-sm leading-6 text-ivory/70">{description}</p></Link>)}</div></MarketingPage>;
}

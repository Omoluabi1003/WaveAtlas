import { Compass, Globe2, Heart, Newspaper, Plane, Radio, Settings, Signal } from "lucide-react";
import { EnterAppCtas, MarketingPage } from "@/components/MarketingPage";

const steps = [
  [Globe2, "Explore", "Search countries, cities, genres, and languages to discover live radio around the world."],
  [Plane, "Teleport", "Jump instantly to a new live destination and hear the world from somewhere unexpected."],
  [Compass, "Wanderer", "Let WaveAtlas guide the journey while you keep listening."],
  [Newspaper, "WaveAtlas Daily™", "Read local headlines from the destination while the station plays."],
  [Signal, "Add Your Signal", "Submit a working radio stream URL and help expand the global atlas."],
  [Heart, "Favorites & History", "Save stations and revisit the places you have heard."],
  [Settings, "Settings", "Use the compact menu for product information, legal policies, and launch resources."],
  [Radio, "Listen", "Press play only when you are ready. The demo never autoplays audio."],
] as const;

export default function DemoPage() {
  return (
    <MarketingPage eyebrow="Live Demo" title="How to Use WaveAtlas™" description="A premium guided walkthrough for exploring Earth through live radio, place, and local stories—without leaving the WaveAtlas context.">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map(([Icon, title, description]) => (
          <article key={title} className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-2xl">
            <div className="grid size-12 place-items-center rounded-2xl border border-radio/25 bg-radio/10 text-radio"><Icon className="size-5" /></div>
            <h2 className="mt-5 font-display text-2xl font-bold text-white">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-ivory/70">{description}</p>
          </article>
        ))}
      </div>
      <section className="mt-6 rounded-[2rem] border border-gold/20 bg-slate-950/55 p-6 backdrop-blur-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gold">Start here</p>
        <h2 className="mt-3 font-display text-3xl font-bold text-white">Choose a destination, then let the signal lead.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ivory/70">Explore deliberately, Teleport instantly, or switch on Wanderer for continuous discovery. WaveAtlas Daily™ adds local context while the station stays in control.</p>
        <EnterAppCtas />
      </section>
    </MarketingPage>
  );
}

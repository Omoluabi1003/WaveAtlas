import { PolicyPage } from "@/components/legal/PolicyPage";

export default function CopyrightPage() { return <PolicyPage title="Copyright & DMCA Policy" intro="Rights-holder protection for radio streams, station metadata, publisher content, and WaveAtlas Daily™." sections={[
{heading:"Third-party ownership",body:"WaveAtlas does not claim ownership of third-party radio streams or news content. Radio stations, logos, names, articles, and publisher content remain property of their respective owners."},
{heading:"References and metadata",body:"WaveAtlas displays stream references, metadata, headlines, summaries, and source links only. No full copyrighted articles should be reproduced, and no paywall circumvention is allowed."},
{heading:"Corrections and removal",body:"Rights holders may request correction or removal of stream references, logos, metadata, headlines, summaries, or source links."},
{heading:"DMCA-style request format",body:"Please include: your legal name and authority; the copyrighted work; the WaveAtlas URL or item at issue; a good-faith statement; a statement under penalty of perjury that the information is accurate; your physical or electronic signature; and contact information."},
{heading:"Contact",body:"Copyright contact placeholder: dmca@example.com."}
]} />; }

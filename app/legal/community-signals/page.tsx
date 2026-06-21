import { PolicyPage } from "@/components/legal/PolicyPage";

export default function CommunitySignalsPage() { return <PolicyPage title="Community Signals Policy" intro="Rules for community-submitted radio stream URLs." sections={[
{heading:"Submitting signals",body:"Users may submit working radio stream URLs with helpful station metadata. Submissions are reviewed before inclusion and do not guarantee approval."},
{heading:"User certification",body:"By submitting, users certify they are not submitting malicious, unlawful, private, unauthorized, deceptive, or infringing streams."},
{heading:"Review and curation",body:"WaveAtlas may edit, reject, verify, categorize, deduplicate, enrich, or remove submissions at any time."},
{heading:"Curated Atlas",body:"Approved signals may become part of the Curated Atlas and may appear in search, Teleport, Wanderer, briefs, and destination intelligence."},
{heading:"Signal health",body:"Broken signals may be marked degraded or needs_review, temporarily hidden, or removed until verified."}
]} />; }

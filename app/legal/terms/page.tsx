import { PolicyPage } from "@/components/legal/PolicyPage";
import { DEVELOPER_ATTRIBUTION } from "@/lib/branding";

export default function TermsPage() { return <PolicyPage title="Terms of Service" intro="Terms governing access to WaveAtlas™ services." sections={[
{heading:"Acceptance of terms",body:"By using WaveAtlas™, you agree to these terms and any posted updates."},
{heading:"Description of services",body:"WaveAtlas™ provides radio discovery, map-based exploration, WaveAtlas Daily™ briefs, favorites, history, settings, and community signal submission tools."},
{heading:"Radio stream indexing",body:"WaveAtlas indexes references to publicly available radio streams. We do not guarantee that a stream is owned by us, continuously available, accurate, lawful in every jurisdiction, or suitable for every listener."},
{heading:"No availability guarantee",body:"Stations may change, fail, block access, degrade, or disappear without notice. Playback depends on third-party infrastructure and user network conditions."},
{heading:"User responsibilities and prohibited misuse",body:"Use WaveAtlas lawfully. Do not attack the service, submit malicious URLs, scrape abusively, impersonate others, bypass restrictions, or use the product to infringe rights or distribute unlawful material."},
{heading:"Community submissions",body:"Submitted signals may be verified, edited, categorized, rejected, or removed. Submission does not guarantee inclusion."},
{heading:"Intellectual property",body:"WaveAtlas™, WaveAtlas Daily™, Explore Humanity Through Sound™, product design, branding, and original software are associated with the WaveAtlas product experience. Third-party streams, station names, logos, maps, and news content remain with their respective owners."},
{heading:"Third-party content",body:"Headlines, summaries, source links, streams, station metadata, map data, and external websites are provided by third parties or public sources. WaveAtlas is not responsible for third-party accuracy, availability, policies, or content."},
{heading:"Limitation of liability",body:"To the maximum extent permitted by law, WaveAtlas is not liable for indirect, incidental, special, consequential, or exemplary damages arising from use of the service."},
{heading:"Developer attribution",body:DEVELOPER_ATTRIBUTION},{heading:"Changes and contact",body:"We may change, suspend, or discontinue features and may update these terms. Contact: legal@example.com."}
]} />; }

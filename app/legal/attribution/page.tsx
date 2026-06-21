import { PolicyPage } from "@/components/legal/PolicyPage";

export default function AttributionPage() { return <PolicyPage title="Attribution Policy" intro="How WaveAtlas™ credits product ownership and third-party sources." sections={[
{heading:"WaveAtlas™ branding",body:"WaveAtlas™, WaveAtlas Daily™, and Explore Humanity Through Sound™ are brand assets associated with the WaveAtlas product experience."},
{heading:"Company attribution",body:"WaveAtlas™ is owned and operated by ETL GIS Consulting LLC unless otherwise stated."},
{heading:"Third-party streams",body:"Station names, logos, radio streams, programming, and related metadata belong to their respective stations, networks, or rights holders."},
{heading:"Maps and geodata",body:"Map tiles, basemaps, geocoding, GIS datasets, and open geodata should be credited according to each provider or dataset license."},
{heading:"News and RSS",body:"WaveAtlas Daily™ should attribute news publishers, source links, RSS feeds, and open data sources where applicable."}
]} />; }

import { PolicyPage } from "@/components/legal/PolicyPage";
import { DEVELOPER_ATTRIBUTION } from "@/lib/branding";

export default function AttributionPage() { return <PolicyPage title="Attribution Policy" intro="How WaveAtlas™ credits product ownership and third-party sources." sections={[
{heading:"WaveAtlas™ branding",body:"WaveAtlas™, WaveAtlas Daily™, and Explore Humanity Through Sound™ are brand assets associated with the WaveAtlas product experience."},
{heading:"Developer attribution",body:DEVELOPER_ATTRIBUTION},
{heading:"Third-party streams",body:"Station names, logos, radio streams, programming, and related metadata belong to their respective stations, networks, or rights holders."},
{heading:"Maps and geodata",body:"Map tiles, basemaps, geocoding, GIS datasets, and open geodata should be credited according to each provider or dataset license."},
{heading:"Earth imagery",body:"Satellite globe imagery: NASA Goddard Space Flight Center and NASA Earth Observatory. Blue Marble land, ocean, and cloud imagery by Reto Stöckli, with enhancements by Robert Simmon. Nighttime city lights derive from the Defense Meteorological Satellite Program. Surface, clouds, and lights are historical composites, not live weather imagery. Sunlight is calculated from the current time. NASA does not endorse WaveAtlas."},
{heading:"News and RSS",body:"WaveAtlas Daily™ should attribute news publishers, source links, RSS feeds, and open data sources where applicable."}
]} />; }

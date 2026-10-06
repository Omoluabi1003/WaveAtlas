import { PolicyPage } from "@/components/legal/PolicyPage";
import { DEVELOPER_ATTRIBUTION } from "@/lib/branding";

export default function AttributionPage() { return <PolicyPage title="Attribution Policy" intro="How WaveAtlas™ credits product ownership and third-party sources." sections={[
{heading:"WaveAtlas™ branding",body:"WaveAtlas™, WaveAtlas Daily™, and Explore Humanity Through Sound™ are brand assets associated with the WaveAtlas product experience."},
{heading:"Developer attribution",body:DEVELOPER_ATTRIBUTION},
{heading:"Third-party streams",body:"Station names, logos, radio streams, programming, and related metadata belong to their respective stations, networks, or rights holders."},
{heading:"Maps and geodata",body:"Globe country and state/province boundaries use public-domain Natural Earth data. State/province lines are simplified for globe display, with coverage reflecting the source. Map tiles, basemaps, geocoding, and other geodata are credited according to their provider licenses."},
{heading:"Earth imagery",body:"Satellite globe imagery: NASA Goddard Space Flight Center and NASA Earth Observatory. Blue Marble land, ocean, and cloud imagery by Reto Stöckli, with enhancements by Robert Simmon. Nighttime city lights derive from the Defense Meteorological Satellite Program. Surface, clouds, and lights are historical composites, not live weather imagery. Sunlight is calculated from the current time. NASA does not endorse WaveAtlas."},
{heading:"Atlas personal voice",body:"Atlas uses the authorized Omoluabi Paul recording as its personal voice reference. Pocket TTS JS 0.1.0 by vlapky is used under the MIT License (https://github.com/vlapky/pocket-tts-js). Pocket TTS model weights are © Kyutai, licensed under CC-BY-4.0 (https://huggingface.co/kyutai/pocket-tts; https://creativecommons.org/licenses/by/4.0/). Voice generation runs in the browser; a device voice may be used as a labelled fallback."},
{heading:"News and RSS",body:"WaveAtlas Daily™ should attribute news publishers, source links, RSS feeds, and open data sources where applicable."}
]} />; }

import { NextRequest, NextResponse } from "next/server";
import { inferGenreCountries } from "@/lib/cultural-atlas";
import { rankStationsForResolvedPlace, resolveGlobalGeoQuery } from "@/lib/global-geo-resolver";
import {
  countryAliases,
  fetchStations,
  fetchStationsForCountryIntent,
  rankStations,
  resolveCountryIntent,
  searchCountries,
} from "@/lib/stations";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? p.get("name") ?? "").trim();
  const normalizedQuery = q.toLowerCase();
  const limit = p.get("limit") ?? "24";
  const offset = p.get("offset") ?? "0";
  const explicitCountry = p.get("country") ?? undefined;
  const explicitCountryCode = p.get("countryCode")?.toUpperCase() ?? undefined;
  const language = p.get("language") ?? undefined;
  const tag = p.get("tag") ?? p.get("genre") ?? undefined;

  const geoResolution = q && !tag ? await resolveGlobalGeoQuery(q) : null;

  if (geoResolution?.ambiguous) {
    return NextResponse.json({
      query: normalizedQuery,
      intent: "geo-disambiguation",
      ambiguous: true,
      disambiguation: geoResolution.disambiguation,
      stations: [],
      totalAvailable: 0,
      totalReturned: 0,
      offset: Number(offset),
      limit: Number(limit),
    });
  }

  if (geoResolution?.place) {
    const place = geoResolution.place;
    const scopedStations = await fetchStationsForCountryIntent(place.countryName, place.countryCode, {
      language,
      limit: "500",
      offset: "0",
    });
    const scopedRanked = rankStationsForResolvedPlace(scopedStations, place, q);
    const ranked = scopedRanked.slice(Number(offset), Number(offset) + Number(limit));
    return NextResponse.json({
      query: normalizedQuery,
      intent: "geo",
      resolvedPlace: place,
      countryCode: place.countryCode,
      countryName: place.countryName,
      source: `global-geo-resolver:${place.source}`,
      stations: ranked,
      totalAvailable: scopedRanked.length,
      totalReturned: ranked.length,
      offset: Number(offset),
      limit: Number(limit),
    });
  }

  const embeddedCountryCode = !explicitCountryCode && q
    ? Object.entries(countryAliases).find(([name]) => new RegExp(String.raw`(^|\b)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\b|$)`, "i").test(q))?.[1]
    : undefined;
  const embeddedCountry = embeddedCountryCode ? (await searchCountries(embeddedCountryCode)).find((country) => country.code === embeddedCountryCode) : undefined;
  const countryIntent = explicitCountryCode
    ? { name: explicitCountry ?? explicitCountryCode, code: explicitCountryCode }
    : embeddedCountry
      ? embeddedCountry
      : q
        ? await resolveCountryIntent(q)
        : undefined;

  if (countryIntent) {
    const stations = await fetchStationsForCountryIntent(countryIntent.name, countryIntent.code, {
      language,
      tag,
      limit,
      offset,
    });
    const exactCountryStations = rankStations(stations, q).filter((station) => station.country_code === countryIntent.code);
    return NextResponse.json({
      query: normalizedQuery,
      intent: "country",
      countryCode: countryIntent.code,
      countryName: countryIntent.name,
      country: countryIntent,
      source: `radio-browser:bycountrycodeexact/${countryIntent.code}`,
      stations: exactCountryStations,
      totalAvailable: exactCountryStations.length,
      totalReturned: exactCountryStations.length,
      offset: Number(offset),
      limit: Number(limit),
    });
  }

  const genreCountries = inferGenreCountries(q);
  const stationGroups = genreCountries.length && !explicitCountryCode
    ? await Promise.all(genreCountries.slice(0, 6).map((countryCode) => fetchStationsForCountryIntent(countryCode, countryCode, { language, tag: tag ?? q, limit: "250", offset: "0" }).catch(() => [])))
    : [];
  const stations = await fetchStations({
    q,
    name: q,
    country: explicitCountry,
    countryCode: explicitCountryCode,
    language,
    tag,
    limit,
    offset,
  });

  const merged = [...stationGroups.flat(), ...stations].filter((station, index, all) => all.findIndex((item) => (item.station_uuid || item.id) === (station.station_uuid || station.id)) === index);
  const ranked = rankStations(merged, q);
  return NextResponse.json({
    query: normalizedQuery,
    intent: tag ? "genre" : "station",
    countryCode: explicitCountryCode,
    countryName: explicitCountry,
    source: "radio-browser:stations/search",
    stations: ranked,
    totalAvailable: ranked.length,
    totalReturned: ranked.length,
    offset: Number(offset),
    limit: Number(limit),
  });
}

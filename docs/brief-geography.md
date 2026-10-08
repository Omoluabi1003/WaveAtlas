# Country-aware Brief

The selected station's ISO country code defines the edition. A recognized country
name can resolve a missing code, but a conflicting display name cannot override
an ISO code. Unknown destinations return an empty edition. City, station, category,
and language remain separate cache inputs.

## Retrieval and relevance

- RSS sources retain their publisher country, language, and scope. Only an explicit
  domestic section may establish domestic relevance without a place in its title.
  A general feed from a local publisher still requires destination relevance.
- GDELT receives a destination query, a destination query restricted to domestic
  publishers, and, when the language is recognized, a preferred-language domestic
  query. An unrestricted domestic query remains available for multilingual countries.
  Searches cover the last three days and request 30 candidates each.
- ISO codes are not GDELT FIPS codes. Spain uses `sourcecountry:spain`; Republic of
  Congo uses FIPS `CF`, and DR Congo uses FIPS `CG`. Ambiguous bare Congo headline
  references do not establish a destination.
- Publisher origin alone never establishes the location of a GDELT article. Returned
  headlines are filtered again. World/regional RSS stories need a destination in
  the headline; a passing reference in a summary is insufficient.
- Country names in multiple scripts, selected national demonyms/localities, and
  multilingual topic terms improve destination and section matching. Local Pulse
  still requires the selected city when one is available.
- Front Page targets three domestic stories, local coverage when available, and one
  relevant international story. Available relevant stories fill remaining slots.
  Publisher diversity is preferred. Normalized duplicate titles and canonical URLs
  are removed, including tracking-parameter duplicates.

## Cache and failure behavior

Populated editions cache for 15 minutes. Empty editions cache for one minute,
including the API's shared cache, so recovered providers are retried promptly.
The in-process cache is bounded to 300 editions. Client cache version 3 and the
`geobrief-v1` request version avoid reusing pre-change global editions.

All providers use bounded timeouts and fail independently. GDELT needs no API key.
Countries with sparse coverage, blocked feeds, or provider outages can have fewer
than five stories or an empty edition. No unrelated global filler is substituted.
Text matching and provider section metadata are relevance signals, not a semantic
geocoder; editorial quality still depends on publisher coverage and metadata.

## Validation

Run `npm run test:brief`, `npm run typecheck`, and `npm run build`.
The country regression deliberately returns a mixed eight-country response for
all queries and verifies Spain, Canada, Nigeria, Republic of Congo, Brazil, Japan,
India, and the United States each retain a distinct relevant edition. It also
covers multilingual categories, API canonicalization, domestic provenance,
world-summary leakage, normalized cache reuse, failures, and empty-cache recovery.

Provider documentation:
https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
https://data.gdeltproject.org/api/v2/guides/LOOKUP-COUNTRIES.TXT

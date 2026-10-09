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
  requires a selected-city match, including native city aliases, or a verified
  dedicated feed for that city. A local headline need not contain a civic keyword.
- Front Page targets three domestic stories, local coverage when available, and one
  relevant international story. Available relevant stories fill remaining slots.
  Publisher diversity is preferred. Normalized duplicate titles and canonical URLs
  are removed, including tracking-parameter duplicates.

## Cache and failure behavior

Populated editions cache for 15 minutes. Empty editions cache for one minute,
including the API's shared cache, so recovered providers are retried promptly.
The in-process cache is bounded to 300 editions. Client cache version 4 and the
`geobrief-v2` request version avoid reusing editions fetched before section routing.
Empty client cache entries also expire after one minute.

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

## Section routing

Local Pulse collects city news and community life. Culture collects arts, music,
film, festivals, and cultural activity. Sports collects teams, competitions, and
sporting developments. Radio Signal collects stations, broadcasting, podcasts,
and radio industry developments. A city story may legitimately appear in Local
Pulse and its specialist section; sections are filtered independently rather
than copying Front Page.

The registry supports category-specific feeds. A curated publisher's section
metadata can establish the topic, including headlines that do not repeat a topic
keyword; it does not establish the destination. Feeds assigned to one specialist
section are not requested for another. Munich uses its dedicated city feed,
German category feeds, native spelling aliases, and German topic recognition.
Publisher images are disabled on the added SZ feeds.

Specialist sections also query Google News RSS using the destination, native city
spellings, English/native topic terms, and a seven-day window. Every result is
filtered again; a search query does not constitute geographic or topic evidence.
The original publisher name is retained separately from the title. This keyless
fallback works independently of GDELT and applies to destinations without a
curated city/category source. Unsupported local Google editions use a supported
language edition, with relevance still controlled by the explicit query and
response filtering. Provider availability remains variable.

The section regression verifies four distinct populated Munich sections, native
city aliases, German topics, dedicated-topic provenance, category source isolation,
and independently filtered fallback sections for Canada, Republic of Congo, and
Brazil while GDELT and all publisher feeds fail.

Feed directories:
https://www.sueddeutsche.de/updates-rss
https://www.br.de/service/br-rss-feeds-100.html

## Coverage for sparse destinations

Front Page now uses Google News and independent Bing News search RSS fallbacks for every registered country and territory, even without a domestic publisher in the registry. Sparse editions expand their searches from 7 to 30 and 90 days, preserving publication dates and the same geographic/topic filters. Front Page attempts to collect at least three reports; specialist sections widen only when empty. Provider fetch caches refresh after 60 seconds, preventing a cached empty RSS response from blocking recovery for 15 minutes. A previously verified server edition can survive a provider outage for up to 24 hours after its initial expiry, without renewing its retention.

When no reports can be verified, or the API fails, the client displays a clearly labelled destination guide using the selected station's listed location, genre and language, with destination/topic search and country-reference links. It never presents this guide as breaking news or a publisher article. Live news cannot be guaranteed for every territory or during simultaneous provider outages; useful destination content remains visible in those cases.

Bing publisher names are read from its namespaced source element. Valid HTTPS publisher URLs are extracted from Bing redirect links. Aggregated reports dated more than 90 days ago are excluded. Bing is queried once alongside the initial searches; subsequent time-window expansions use Google.

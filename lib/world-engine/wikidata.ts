import type { SourceResult } from "./types";

export async function getwikidataContext(): Promise<SourceResult<{ note: string }>> {
  return { status: "skipped", source: "wikidata", confidence: 0, data: { note: "Future-ready zero-cost adapter stub; no large datasets or paid APIs are loaded." }, attribution: "Open data source", cached: true };
}

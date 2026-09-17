/**
 * City configuration contracts.
 * Provider-neutral shapes for the settings and the reviewed knowledge corpus
 * that the runtime reads from the database, so no city-specific content lives
 * in code. The Postgres adapter validates rows before they reach this layer.
 */

export type CitySettings = Readonly<{
  cityId: string;
  displayName: string;
  timeZone: string;
  eventsListingUrl: string;
}>;

/** Word groups for deterministic matching: every group needs a hit, none may be excluded. */
export type KnowledgeMatch = Readonly<{
  all: readonly (readonly string[])[];
  exclude: readonly string[];
}>;

export type KnowledgeSource = Readonly<{
  title: string;
  url: string;
  kind: "municipal_code" | "city_website";
  note: string;
  excerpt?: string;
  verifiedOn: string;
}>;

export type KnowledgeEntry = Readonly<{
  topicKey: string;
  tool: "lookupMunicipalCode" | "lookupCityInformation";
  match: KnowledgeMatch;
  answer: string;
  source: KnowledgeSource;
  limitations: readonly string[];
}>;

export interface CityKnowledgeReader {
  /** Input: server-owned city ID. Output: validated reviewed entries or `unavailable`. */
  list(
    cityId: string,
  ): Promise<
    | { status: "available"; entries: readonly KnowledgeEntry[] }
    | { status: "unavailable" }
  >;
}

/**
 * Checks one reviewed entry against a caller question.
 * Input: an entry requiring glass/bottle and park words, and
 * `"Can I bring a glass bottle to a park?"`. Output: `true`; a repeal question
 * containing an excluded word returns `false`.
 */
export function matchesKnowledgeEntry(
  entry: KnowledgeEntry,
  query: string,
): boolean {
  const text = query.trim().toLowerCase();
  if (text.length === 0) return false;
  if (entry.match.exclude.some((word) => text.includes(word))) return false;
  return entry.match.all.every((group) =>
    group.some((word) => text.includes(word)),
  );
}

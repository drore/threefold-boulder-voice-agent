/**
 * Postgres-backed CityKnowledgeReader.
 * Loads and validates the reviewed knowledge corpus so the runtime answers
 * from database content rather than code constants. An invalid row makes the
 * whole read unavailable instead of being trusted.
 */
import type { Pool } from "pg";
import type {
  CityKnowledgeReader,
  KnowledgeEntry,
  KnowledgeMatch,
} from "../../core/city.js";
import { logDatabaseError } from "./log-database-error.js";

const STORE_NAME = "PostgresCityKnowledgeStore";
const TOOLS = ["lookupMunicipalCode", "lookupCityInformation"] as const;
const SOURCE_KINDS = ["municipal_code", "city_website"] as const;

type KnowledgeRow = {
  topic_key: string;
  tool: string;
  match: unknown;
  answer: string;
  source_title: string;
  source_url: string;
  source_kind: string;
  source_note: string;
  source_excerpt: string | null;
  limitations: unknown;
  verified_on: Date | string;
};

export class PostgresCityKnowledgeStore implements CityKnowledgeReader {
  constructor(private readonly pool: Pool) {}

  /** Input: `"boulder-co"`. Output: validated entries or `{status:"unavailable"}`. */
  async list(cityId: string) {
    try {
      const result = await this.pool.query<KnowledgeRow>(
        `select topic_key, tool, match, answer, source_title, source_url,
                source_kind, source_note, source_excerpt, limitations, verified_on
         from app.city_knowledge
         where city_id = $1
         order by topic_key`,
        [cityId],
      );
      const entries: KnowledgeEntry[] = [];
      for (const row of result.rows) {
        const entry = toEntry(row);
        if (!entry) return { status: "unavailable" as const };
        entries.push(entry);
      }
      return { status: "available" as const, entries };
    } catch (error) {
      logDatabaseError(STORE_NAME, "list", error);
      return { status: "unavailable" as const };
    }
  }
}

/** Input: a database row. Output: a validated entry, or `null` for any malformed shape. */
function toEntry(row: KnowledgeRow): KnowledgeEntry | null {
  const match = toMatch(row.match);
  const limitations = toStringArray(row.limitations);
  const verifiedOn =
    row.verified_on instanceof Date
      ? row.verified_on.toISOString().slice(0, 10)
      : String(row.verified_on).slice(0, 10);
  if (
    !match ||
    !limitations ||
    !TOOLS.includes(row.tool as (typeof TOOLS)[number]) ||
    !SOURCE_KINDS.includes(row.source_kind as (typeof SOURCE_KINDS)[number]) ||
    !nonEmpty(row.topic_key) ||
    !nonEmpty(row.answer) ||
    !nonEmpty(row.source_title) ||
    !nonEmpty(row.source_note) ||
    !isHttpsUrl(row.source_url) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(verifiedOn)
  ) {
    return null;
  }
  return {
    topicKey: row.topic_key,
    tool: row.tool as KnowledgeEntry["tool"],
    match,
    answer: row.answer,
    source: {
      title: row.source_title,
      url: row.source_url,
      kind: row.source_kind as KnowledgeEntry["source"]["kind"],
      note: row.source_note,
      ...(row.source_excerpt ? { excerpt: row.source_excerpt } : {}),
      verifiedOn,
    },
    limitations,
  };
}

/** Input: a `match` jsonb value. Output: a validated match spec or `null`. */
function toMatch(value: unknown): KnowledgeMatch | null {
  if (!isRecord(value)) return null;
  const all = Array.isArray(value.all) ? value.all : null;
  const exclude = toStringArray(value.exclude);
  if (!all || !exclude) return null;
  const groups: string[][] = [];
  for (const group of all) {
    const words = toStringArray(group);
    if (!words || words.length === 0) return null;
    groups.push(words);
  }
  return groups.length > 0 ? { all: groups, exclude } : null;
}

/** Input: a possible array of strings. Output: the strings, or `null` when malformed. */
function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) return null;
    strings.push(item);
  }
  return strings;
}

function nonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

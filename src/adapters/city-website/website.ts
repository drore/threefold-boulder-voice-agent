/**
 * Live city website lookup.
 * Discovers the most relevant official page from the site's sitemap by matching
 * the caller's keywords against URL slugs, fetches that page on demand, and
 * extracts its main text. The URL index and page text are cached with a TTL and
 * the lookup fails closed. The model supplies words; only this adapter selects
 * URLs from the official sitemap, so no caller or model can cause an arbitrary
 * fetch.
 */
import * as cheerio from "cheerio";

export type CityWebsitePage = Readonly<{
  title: string;
  url: string;
  text: string;
  fetchedAtUtc: string;
}>;

export type CityWebsiteLookupResult =
  | { status: "found"; page: CityWebsitePage }
  | { status: "no_match" }
  | { status: "source_unavailable" };

export type CityWebsiteProvider = {
  lookup(query: string): Promise<CityWebsiteLookupResult>;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SITEMAP_PAGES = 6;
const MAX_URLS = 20_000;
const MAX_TEXT_LENGTH = 6_000;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "at",
  "in",
  "on",
  "to",
  "with",
  "is",
  "are",
  "was",
  "be",
  "do",
  "does",
  "did",
  "can",
  "could",
  "should",
  "would",
  "i",
  "my",
  "we",
  "you",
  "your",
  "it",
  "its",
  "this",
  "that",
  "there",
  "what",
  "which",
  "where",
  "when",
  "how",
  "about",
  "please",
  "tell",
  "know",
  "need",
  "want",
  "get",
  "find",
  "city",
  "cities",
]);

const EXCLUDED_PATH_SEGMENTS = ["/events", "/search", "/contact-us"];

/**
 * Extracts searchable keywords from a caller question.
 * Input: `"Where can I park downtown?"`. Output: `["park", "downtown"]`.
 */
export function extractKeywords(query: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const word of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length < 3 || STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
  }
  return keywords;
}

/**
 * Scores one sitemap URL against the caller's keywords.
 * Input: `"/services/parking"` and `["park", "downtown"]`. Output: `1.5`.
 * Service pages get a small bonus; unmatched or excluded URLs score 0.
 */
export function scoreUrlMatch(
  url: string,
  keywords: readonly string[],
): number {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return 0;
  }
  if (
    EXCLUDED_PATH_SEGMENTS.some((segment) => path.startsWith(segment)) ||
    /\.(pdf|jpg|jpeg|png|gif|zip|docx?)$/.test(path)
  ) {
    return 0;
  }
  const matched = keywords.filter((keyword) => path.includes(keyword)).length;
  if (matched === 0 || keywords.length === 0) return 0;
  const specificity = matched / keywords.length;
  const bonus = path.startsWith("/services/") ? 0.5 : 0;
  return specificity + bonus;
}

/** Input: a sitemap XML document. Output: same-host page URLs, or `[]`. */
export function parseSitemap(xml: string, baseUrl: string): string[] {
  const host = new URL(baseUrl).host;
  const urls: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const loc = match[1];
    if (!loc) continue;
    try {
      const parsed = new URL(loc);
      if (parsed.host !== host) continue;
      if (
        EXCLUDED_PATH_SEGMENTS.some((segment) =>
          parsed.pathname.startsWith(segment),
        )
      ) {
        continue;
      }
      if (/\.(xml|pdf|jpg|jpeg|png|gif|zip|docx?)$/.test(parsed.pathname)) {
        continue;
      }
      if (parsed.search) continue;
      urls.push(`${parsed.origin}${parsed.pathname}`);
    } catch {
      // Malformed entries are skipped, never guessed.
    }
  }
  return urls;
}

/** Input: a rendered page. Output: its title and bounded main text. */
export function extractPageText(
  html: string,
  url: string,
): { title: string; text: string } {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, form, noscript, svg").remove();
  const title =
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    $("title").first().text().replace(/\s+/g, " ").trim() ||
    url;
  const main = $("main").first();
  const source = main.length > 0 ? main : $("body");
  const text = source
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
  return { title, text };
}

type CacheEntry<T> = { value: T; expiresAt: number };

/**
 * Creates the cached live website provider.
 * Input: the configured site base URL plus optional injected fetch/clock/TTL.
 * Output: `lookup(query)` resolves an official page and its extracted text.
 */
export function createCityWebsiteProvider(options: {
  baseUrl: string;
  fetchText?: typeof fetch;
  clock?: () => Date;
  ttlMs?: number;
  maxSitemapPages?: number;
}): CityWebsiteProvider {
  const fetchText = options.fetchText ?? fetch;
  const clock = options.clock ?? (() => new Date());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxSitemapPages = options.maxSitemapPages ?? MAX_SITEMAP_PAGES;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  let sitemapCache: CacheEntry<string[]> | null = null;
  const pageCache = new Map<string, CacheEntry<CityWebsitePage>>();
  const topicCache = new Map<string, CacheEntry<string>>();

  async function fetchDocument(url: string): Promise<string | null> {
    try {
      const response = await fetchText(url, {
        headers: { "user-agent": "city-services-demo/0.1" },
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  async function loadSitemapUrls(): Promise<string[] | null> {
    const now = clock().getTime();
    if (sitemapCache && sitemapCache.expiresAt > now) return sitemapCache.value;

    const index = await fetchDocument(`${baseUrl}/sitemap.xml`);
    if (index === null) return null;
    const urls = new Set(parseSitemap(index, baseUrl));
    const nested = [
      ...index.matchAll(/<loc>\s*([^<\s]+sitemap\.xml\?page=\d+)\s*<\/loc>/g),
    ]
      .map((match) => match[1])
      .filter((value): value is string => typeof value === "string")
      .slice(0, maxSitemapPages);
    for (const page of nested) {
      const document = await fetchDocument(page);
      if (document === null) continue;
      for (const url of parseSitemap(document, baseUrl)) urls.add(url);
      if (urls.size >= MAX_URLS) break;
    }
    const values = [...urls].slice(0, MAX_URLS);
    if (values.length === 0) return null;
    sitemapCache = { value: values, expiresAt: now + ttlMs };
    return values;
  }

  return {
    async lookup(query: string): Promise<CityWebsiteLookupResult> {
      const keywords = extractKeywords(query);
      if (keywords.length === 0) return { status: "no_match" };
      const topicKey = [...keywords].sort().join(" ");
      const now = clock().getTime();

      const knownTopic = topicCache.get(topicKey);
      if (knownTopic && knownTopic.expiresAt > now) {
        const cached = pageCache.get(knownTopic.value);
        if (cached && cached.expiresAt > now) {
          return { status: "found", page: cached.value };
        }
      }

      const urls = await loadSitemapUrls();
      if (urls === null) return { status: "source_unavailable" };

      const scored = urls
        .map((url) => ({ url, score: scoreUrlMatch(url, keywords) }))
        .filter((entry) => entry.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.url.split("/").length - b.url.split("/").length ||
            a.url.length - b.url.length,
        );
      const best = scored[0];
      if (!best) return { status: "no_match" };

      const cachedPage = pageCache.get(best.url);
      if (cachedPage && cachedPage.expiresAt > now) {
        topicCache.set(topicKey, { value: best.url, expiresAt: now + ttlMs });
        return { status: "found", page: cachedPage.value };
      }

      const document = await fetchDocument(best.url);
      if (document === null) return { status: "source_unavailable" };
      const { title, text } = extractPageText(document, best.url);
      if (text.length === 0) return { status: "source_unavailable" };
      const page: CityWebsitePage = {
        title,
        url: best.url,
        text,
        fetchedAtUtc: clock().toISOString(),
      };
      pageCache.set(best.url, { value: page, expiresAt: now + ttlMs });
      topicCache.set(topicKey, { value: best.url, expiresAt: now + ttlMs });
      return { status: "found", page };
    },
  };
}

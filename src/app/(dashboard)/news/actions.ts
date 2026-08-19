"use server";

import { headers } from "next/headers";
import { auth } from "@/server/lib/auth";
import { db } from "@/server/db/client";
import {
  categoryOf,
  type NewsCategory,
} from "@/lib/news-categories";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(session.user as Record<string, unknown>).isAdmin) {
    throw new Error("Forbidden: admin only");
  }
  return session;
}

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

export interface NewsArticle {
  id: string;
  title: string;
  link: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  excerpt: string;
  image: string | null;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  platform: "facebook" | "news";
  authorName?: string;
  authorAvatar?: string;
  fbLikeCount?: number;
  fbCommentCount?: number;
  fbShareCount?: number;
}

// Google News RSS has no images; fetch og:image from the article page as a
// best effort, with the source favicon as fallback.
const ogCache = new Map<string, string | null>();

async function fetchOgImage(url: string): Promise<string | null> {
  if (ogCache.has(url)) return ogCache.get(url) ?? null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Schedly/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const image = m?.[1] ? m[1].replace(/&amp;/g, "&") : null;
    ogCache.set(url, image);
    return image;
  } catch {
    ogCache.set(url, null);
    return null;
  }
}

function faviconFor(sourceUrl: string): string {
  try {
    return `https://icon.horse/icon/${encodeURIComponent(new URL(sourceUrl).hostname)}`;
  } catch {
    return "https://icon.horse/icon/news";
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

interface RawArticle {
  title: string;
  link: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  excerpt: string;
  image?: string | null;
  platform?: "facebook" | "news";
  authorName?: string;
  authorAvatar?: string;
  fbLikeCount?: number;
  fbCommentCount?: number;
  fbShareCount?: number;
  graph?: boolean;
}

function parseRss(xml: string): RawArticle[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const articles: RawArticle[] = [];

  for (const raw of items) {
    const item = raw ?? "";
    const title = decodeEntities(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
      .replace(/ - (Inquirer\.net|Rappler|GMA News Online|ABS-CBN News|Philstar\.com|mb\.com\.ph|Philstar Global|CNN Philippines|Manila Bulletin)$/i, "")
      .trim();
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const source =
      decodeEntities(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "").trim() ||
      decodeEntities(item.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/)?.[1] ?? "").trim() ||
      decodeEntities(item.match(/<news:Source>([\s\S]*?)<\/news:Source>/)?.[1] ?? "").trim();
    const sourceUrl = item.match(/<source url="([^"]*)"/)?.[1] ?? "";
    const desc = decodeEntities(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
    const image =
      item.match(/<media:content[^>]*url="([^"]+)"/)?.[1] ??
      item.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1] ??
      item.match(/<enclosure[^>]*url="([^"]+)"/)?.[1] ??
      null;

    if (!title || !link) continue;

    const excerpt = desc
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"), "")
      .replace(/Keep on reading:\s*/i, "")
      .replace(/\]{2,}/g, "")
      .replace(/&nbsp;\s*$/, "")
      .trim()
      .slice(0, 300);

    articles.push({
      title,
      link,
      source: source || sourceUrl || "News",
      sourceUrl,
      publishedAt: pubDate,
      excerpt,
      image,
    });
  }

  return articles;
}

function dedupe(articles: RawArticle[]): RawArticle[] {
  const seen = new Set<string>();
  const out: RawArticle[] = [];
  for (const a of articles) {
    // Normalized prefix key catches near-identical duplicates across sources
    // (Google News emits the same post twice with slightly different text).
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

// Direct RSS feeds of Philippine news sites (no Google News, no API keys).
// National feeds — articles are location-filtered by city/province/region
// name in the title or excerpt (see matchesLocation).
const PH_FEEDS: { name: string; url: string }[] = [
  { name: "Inquirer", url: "https://newsinfo.inquirer.net/feed" },
  { name: "Inquirer", url: "https://www.inquirer.net/fullfeed" },
  { name: "BusinessWorld", url: "https://www.bworldonline.com/feed/" },
  { name: "Rappler", url: "https://www.rappler.com/feed/" },
  { name: "Philstar", url: "https://www.philstar.com/rss/headlines" },
  { name: "DepEd", url: "https://www.deped.gov.ph/feed/" },
];

async function fetchFeed(feed: { name: string; url: string }): Promise<RawArticle[]> {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${feed.name} RSS failed: HTTP ${res.status}`);
  const articles = parseRss(await res.text());
  for (const a of articles) if (!a.source) a.source = feed.name;
  return articles;
}

// Match an article against the selected place using the city/province/region
// names and common aliases. Word-boundary aware so short names (Lipa, Baguio)
// don't match inside unrelated words.
function matchesLocation(article: RawArticle, names: string[]): boolean {
  const text = `${article.title} ${article.excerpt}`.toLowerCase();
  for (const raw of names) {
    const name = raw.toLowerCase().trim();
    if (!name) continue;
    if (name.length < 4) {
      if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) return true;
    } else if (text.includes(name)) {
      return true;
    }
  }
  return false;
}

function locationNames(province: string, city: string, region: string): string[] {
  const names = new Set<string>();
  const add = (n: string) => {
    const clean = n.replace(/\b(City|Province|Municipality)\b/gi, "").replace(/\s+/g, " ").trim();
    if (clean.length >= 3) names.add(clean);
    if (n.length >= 3) names.add(n);
  };
  // City-level selection: match the city STRICTLY so national/regional news
  // that merely mentions the place is kept out of the feed.
  if (city && city !== province) {
    add(city);
    return [...names];
  }
  add(province);
  add(region);
  if (/metropolitan manila|national capital/i.test(region)) {
    names.add("metro manila");
    names.add("ncr");
    names.add("manila");
  }
  return [...names];
}

async function fetchBingNews(location: string): Promise<RawArticle[]> {
  const rssUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(
    location
  )}&format=RSS&setlang=en-ph`;
  const res = await fetch(rssUrl, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Schedly/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Bing News RSS failed: HTTP ${res.status}`);
  return parseRss(await res.text());
}

// Google News indexes PUBLIC Facebook posts. Restricting the query to
// site:facebook.com returns ~100 Facebook posts per location (vs ~16 with a
// keyword clause). Titles often end with " - facebook.com" and start with the
// posting page's name — that is parsed into the account shown on the card.
async function fetchGoogleFacebook(location: string): Promise<RawArticle[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `site:facebook.com "${location}" when:7d`
  )}&hl=en-PH&gl=PH&ceid=PH:en`;
  return parseGoogleFacebook(await fetchRss(rssUrl, "Google News (Facebook)"));
}

// Dedicated "walang pasok" search — Google matches suspension posts even when
// they are published by national alert pages, so Muntinlupa gets more of
// them. Merged + deduped with the main Facebook feed afterwards.
async function fetchGoogleSuspensions(location: string): Promise<RawArticle[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `site:facebook.com "${location}" ("walang pasok" OR "suspension of classes") when:7d`
  )}&hl=en-PH&gl=PH&ceid=PH:en`;
  return parseGoogleFacebook(await fetchRss(rssUrl, "Google News (Suspensions)"));
}

async function fetchRss(rssUrl: string, label: string): Promise<string> {
  const res = await fetch(rssUrl, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Schedly/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${label} failed: HTTP ${res.status}`);
  return res.text();
}

function parseGoogleFacebook(xml: string): RawArticle[] {
  const out: RawArticle[] = [];
  for (const a of parseRss(xml)) {
    const pageMatch = a.title.match(/^(.{3,60}?)\s+-\s+facebook\.com$/i);
    const page = pageMatch?.[1]?.trim();
    const title = page ? a.title.replace(/^(.{3,60}?)\s+-\s+facebook\.com$/i, "$1").trim() : a.title;
    // Drop page-name-only posts (no real caption) and very short posts.
    if (!title || title.length < 20) continue;
    if (page && title === page) continue;
    out.push({
      ...a,
      title: title || a.title,
      source: page ?? "Facebook",
      sourceUrl: "https://www.facebook.com",
      platform: "facebook",
      authorName: page ?? "Facebook",
      // The title already carries the full post caption — no duplicate.
      excerpt: "",
    });
  }
  return out;
}

const SUSPENSION_RE = /walang pasok|suspension of classes|class(?:es)?\s+suspend/i;

// ---- Facebook (Graph API) ----
// Reads PUBLIC posts from major PH news/government pages. Requires
// FB_ACCESS_TOKEN in .env (any valid app or user token). Skips gracefully when
// the token is missing. Real like/comment/share counts come straight from the
// Facebook post itself.
const FB_PAGES: { id: string; name: string }[] = [
  { id: "mbcomph", name: "Manila Bulletin" },
  { id: "inquirerdotnet", name: "Inquirer" },
  { id: "rapplerdotcom", name: "Rappler" },
  { id: "gmanews", name: "GMA News" },
  { id: "abscbnnews", name: "ABS-CBN News" },
  { id: "philstarnews", name: "Philstar" },
  { id: "PTVphilippines", name: "PTV Philippines" },
  { id: "depedphilippines", name: "DepEd Philippines" },
  { id: "pagasa.dost.gov.ph", name: "PAGASA" },
  { id: "mmdaphilippines", name: "MMDA" },
];

function fbToken(): string {
  return process.env.FB_ACCESS_TOKEN?.trim() ?? "";
}

interface FbPostData {
  id: string;
  message?: string;
  caption?: string;
  full_picture?: string;
  created_time?: string;
  permalink_url?: string;
  from?: { name?: string };
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
}

// Page avatars are fetched server-side and cached; the final CDN url (safe,
// no token) is what reaches the client.
const pageAvatarCache = new Map<string, { at: number; url: string | null }>();
async function pageAvatar(pageId: string): Promise<string | null> {
  const cached = pageAvatarCache.get(pageId);
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) return cached.url;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${pageId}/picture?type=square&access_token=${fbToken()}`,
      { redirect: "follow", signal: AbortSignal.timeout(6000), cache: "no-store" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const url = res.url;
    pageAvatarCache.set(pageId, { at: Date.now(), url });
    return url;
  } catch {
    pageAvatarCache.set(pageId, { at: Date.now(), url: null });
    return null;
  }
}

async function fetchFacebookPosts(page: { id: string; name: string }): Promise<RawArticle[]> {
  const params = new URLSearchParams({
    fields:
      "id,message,caption,full_picture,created_time,permalink_url,from{name},likes.summary(true),comments.summary(true),shares",
    limit: "25",
    access_token: fbToken(),
  });
  const res = await fetch(`https://graph.facebook.com/v20.0/${page.id}/posts?${params}`, {
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Facebook ${page.name} failed: HTTP ${res.status}`);
  const json = (await res.json()) as { data?: FbPostData[]; error?: { message?: string } };
  if (json.error) throw new Error(`Facebook ${page.name}: ${json.error.message}`);
  const avatar = await pageAvatar(page.id);

  const out: RawArticle[] = [];
  for (const p of json.data ?? []) {
    const link = p.permalink_url ?? "";
    if (!link || !p.created_time) continue;
    const message = decodeEntities(p.message ?? p.caption ?? "").replace(/\s+/g, " ").trim();
    const title = decodeEntities(p.caption ?? "")
      .trim()
      .slice(0, 200);
    const fallbackTitle = message.split("\n")[0]?.slice(0, 200) ?? "";
    const finalTitle = title || fallbackTitle;
    if (!finalTitle && !message) continue;
    const authorName = p.from?.name ?? page.name;
    out.push({
      title: finalTitle || authorName,
      link,
      source: authorName,
      sourceUrl: `https://www.facebook.com/${page.id}`,
      publishedAt: p.created_time,
      excerpt: message.slice(0, 300),
      image: p.full_picture ?? null,
      platform: "facebook",
      graph: true,
      authorName,
      authorAvatar: avatar ?? undefined,
      fbLikeCount: p.likes?.summary?.total_count ?? 0,
      fbCommentCount: p.comments?.summary?.total_count ?? 0,
      fbShareCount: p.shares?.count ?? 0,
    });
  }
  return out;
}

const newsCache = new Map<
  string,
  { at: number; articles: NewsArticle[]; counts: NewsCounts; suspension: SuspensionInfo | null }
>();
const CACHE_TTL = 10 * 60 * 1000;

// ---- Gemini relevance filter (optional, one batched call per refresh) ----
// Decides which items are genuinely news ABOUT the selected place (rejecting
// national news that merely mentions it, promos, and page-name-only posts)
// and returns the FULL cleaned caption text. The model copies real text
// verbatim — it is explicitly told never to invent, summarize, or add facts,
// so the feed stays real news. Falls back to no AI when no key is configured
// or the call fails.
interface AiVerdict {
  i: number;
  relevant: boolean;
  priority?: number;
  caption?: string;
}

async function aiFilterArticles(
  items: RawArticle[],
  place: string
): Promise<{ keep: boolean; priority: number; caption?: string }[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return items.map(() => ({ keep: true, priority: 50 }));
  try {
    const payload = items.map((a, i) => ({
      i,
      title: a.title.slice(0, 400),
      excerpt: a.excerpt.slice(0, 400),
      source: a.source,
    }));
    const prompt = `You are a strict news relevance filter for the area: "${place}".
For each news item, decide: is it genuinely news or an announcement ABOUT ${place} itself?
- REJECT national/other-area news that merely mentions ${place} in passing.
- REJECT promos, advertisements, and private business event invitations.
- REJECT page-name-only posts, short filler posts, and duplicates.
Additionally, rate each relevant item with a priority 0-100 (irrelevant items: 0):
- 90-100: school/class suspension announcements, online class changes, "walang pasok" — anything students must know TODAY about ${place}.
- 75-89: other school/education news about ${place} (enrollment, DepEd, events at schools).
- 50-74: government news, weather/typhoon/flood alerts, safety advisories about ${place}.
- 25-49: other news about ${place}.
Provide the FULL caption text of each post, cleaned: strip leading page names, trailing " - facebook.com", "Keep on reading:", "]]]", and extra punctuation. Copy the real text VERBATIM — never invent, summarize, paraphrase, or add facts. If the caption is empty or identical to the title, omit the caption field.
Respond ONLY with JSON: {"items":[{"i":0,"relevant":true,"priority":85,"caption":"..."}]} — one entry per input item, keep the same index.`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, { text: JSON.stringify(payload) }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("No JSON in Gemini response");
    const parsed = JSON.parse(json) as { items?: AiVerdict[] };
    const verdicts = new Map<number, AiVerdict>();
    for (const v of parsed.items ?? []) verdicts.set(v.i, v);
    return items.map((_, i) => {
      const v = verdicts.get(i);
      if (!v) return { keep: true, priority: 50 };
      const priority = Math.max(0, Math.min(100, v.priority ?? 50));
      return {
        keep: v.relevant !== false && priority > 0,
        priority: v.relevant === false ? 0 : priority,
        caption: v.caption?.trim() ? v.caption.trim() : undefined,
      };
    });
  } catch (err) {
    console.error("[news] Gemini filter failed, keeping all:", err instanceof Error ? err.message : err);
    return items.map(() => ({ keep: true, priority: 50 }));
  }
}

export interface NewsCounts {
  all: number;
  school: number;
  government: number;
  weather: number;
  news: number;
}

const NEWS_CATEGORIES = ["school", "government", "weather", "news"] as const;

// ---- Gemini deep research: "Walang Pasok" summary ----
// A second (small) Gemini call that reads the suspension-related Facebook
// posts and writes a concise Taglish summary — date(s), levels, reason.
// It is explicitly forbidden to invent facts: only what the posts actually
// say. Shown as a pinned banner at the top of the feed.
export interface SuspensionInfo {
  hasSuspension: boolean;
  summary: string;
  sources: string[];
  postUrl: string;
}

async function aiSuspensionSummary(
  items: RawArticle[],
  place: string
): Promise<SuspensionInfo | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || items.length === 0) return null;
  try {
    const payload = items.slice(0, 8).map((a) => ({
      title: a.title.slice(0, 400),
      source: a.authorName ?? a.source,
      date: a.publishedAt,
    }));
    const prompt = `You are a class-suspension researcher for students in ${place}. These are REAL Facebook posts that mention ${place} and look like "walang pasok" / class suspension posts.
Determine the CURRENT class suspension situation in ${place} from these posts.
Return JSON:
{"hasSuspension": true or false,
 "summary": "2-3 sentences in natural Taglish: on which date(s) classes are suspended in ${place}, which levels (all levels public & private, elementary only, college, etc.), and the reason (typhoon, rain, heat index, holiday, etc.). State ONLY what the posts say. Never invent dates, levels, or reasons. If a detail is missing, briefly say it is not mentioned. If the posts are about OTHER places and only mention ${place} in passing, set hasSuspension=false and summary=\"\".",
 "sources": ["page names of the posts used"]}
Respond ONLY with JSON.`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, { text: JSON.stringify(payload) }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("No JSON in Gemini response");
    const parsed = JSON.parse(json) as {
      hasSuspension?: boolean;
      summary?: string;
      sources?: string[];
    };
    const summary = (parsed.summary ?? "").trim();
    const firstUrl = items[0]?.link ?? "";
    if (!parsed.hasSuspension || !summary) return { hasSuspension: false, summary: "", sources: [], postUrl: firstUrl };
    return {
      hasSuspension: true,
      summary,
      sources: [...new Set((parsed.sources ?? []).filter(Boolean).slice(0, 4))],
      postUrl: firstUrl,
    };
  } catch (err) {
    console.error("[news] Gemini suspension summary failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function dateScore(a: { publishedAt: string }): number {
  const t = Date.parse(a.publishedAt);
  return Number.isNaN(t) ? 0 : t;
}

export async function getNews(
  province: string,
  city: string,
  region: string,
  category: NewsCategory = "all"
): Promise<{
  articles: NewsArticle[];
  location: string;
  counts: NewsCounts;
  suspension: SuspensionInfo | null;
}> {
  await requireAdmin();

  const location = city && city !== province ? `${city}, ${province}` : province;
  const cacheKey = `${province}|${city}`;
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    const articles =
      category === "all"
        ? cached.articles
        : cached.articles.filter((a) => categoryOf(a.title, a.excerpt, category));
    return { articles, location, counts: cached.counts, suspension: cached.suspension };
  }

  // Fetch every PH feed plus Bing, Google News (Facebook posts) and the Graph
  // API pages in parallel, then keep only articles that mention the place.
  const useFb = fbToken().length > 0;
  const fbQueryName =
    city && city !== province
      ? city
      : /metropolitan manila/i.test(province)
        ? "Metro Manila"
        : province;
  const results = await Promise.allSettled([
    ...PH_FEEDS.map((feed) => fetchFeed(feed)),
    fetchBingNews(location),
    fetchGoogleFacebook(fbQueryName),
    fetchGoogleSuspensions(fbQueryName),
    ...(useFb ? FB_PAGES.map((page) => fetchFacebookPosts(page)) : []),
  ]);

  let merged: RawArticle[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") merged = merged.concat(r.value);
  }

  const names = locationNames(province, city, region);
  if (names.length > 0) {
    merged = merged.filter((a) => matchesLocation(a, names));
  }
  if (merged.length === 0) {
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    throw new Error(
      `No news found for this area: ${failed?.reason?.message ?? "no matching articles"}`
    );
  }

  // Facebook posts are location-filtered like everything else, but cap each
  // Facebook source so no single page floods the feed: Google News
  // (Facebook) supplies the volume (~100), Graph API posts the curated pages.
  // "Walang pasok" posts get their own cap so they never crowd out other news.
  let googleFbCount = 0;
  let googleSusCount = 0;
  let graphFbCount = 0;
  merged = merged.filter((a) => {
    if (a.platform === "facebook") {
      const isSus = SUSPENSION_RE.test(`${a.title} ${a.excerpt}`);
      if (a.graph) {
        if (graphFbCount >= 8) return false;
        graphFbCount++;
      } else if (isSus) {
        if (googleSusCount >= 12) return false;
        googleSusCount++;
      } else {
        if (googleFbCount >= 24) return false;
        googleFbCount++;
      }
    }
    return true;
  });

  // Newest first — feed ordering is unreliable across sources. Gemini's
  // priority becomes the primary sort below; recency breaks ties.
  merged.sort((a, b) => dateScore(b) - dateScore(a));
  merged = dedupe(merged).slice(0, 40);

  // Gemini decides real relevance to the place, assigns a priority (school
  // suspensions first) and supplies full cleaned captions (verbatim — no
  // fabrication). Skip silently when unavailable.
  const verdicts = await aiFilterArticles(merged, location);

  // Priority order: most important for students first, then newest. "Walang
  // pasok" posts always get bumped to the top even if Gemini rated them lower.
  const ranked = merged
    .map((a, i) => {
      const v = verdicts[i] ?? { keep: true, priority: 50 };
      const priority = SUSPENSION_RE.test(`${a.title} ${a.excerpt}`)
        ? Math.max(v.priority, 90)
        : v.priority;
      return { a, v: { ...v, priority } };
    })
    .filter(({ v }) => v.keep)
    .sort(
      (x, y) =>
        (y.v.priority ?? 50) - (x.v.priority ?? 50) || dateScore(y.a) - dateScore(x.a)
    );

  // Gemini deep-research: pinned "Walang Pasok" summary card (date, levels,
  // reason) from the suspension posts — facts only, no fabrication.
  const suspension = await aiSuspensionSummary(
    ranked.filter(({ a }) => SUSPENSION_RE.test(`${a.title} ${a.excerpt}`)).map(({ a }) => a),
    location
  );

  // Category counts over the full (unfiltered) set — the chips show them.
  const counts: NewsCounts = { all: ranked.length, school: 0, government: 0, weather: 0, news: 0 };
  for (const { a } of ranked) {
    for (const c of NEWS_CATEGORIES) {
      if (categoryOf(a.title, a.excerpt, c)) counts[c]++;
    }
  }

  // Best-effort thumbnails: og:image for the first few RSS articles. Google
  // News Facebook posts never show a real image (the Google article page only
  // exposes the Google logo), so those render without one — Graph API posts
  // carry the real full_picture already.
  const allArticles: NewsArticle[] = [];
  let ogCount = 0;
  for (const { a, v } of ranked) {
    const isFb = a.platform === "facebook";
    const isGoogleFb = isFb && !a.graph;
    const needsOg = !isGoogleFb && !a.image && ogCount < 10;
    const ogImage = needsOg ? await fetchOgImage(a.link) : (a.image ?? null);
    const caption = v.caption;
    const fbTitle = isFb && caption ? caption : a.title;
    allArticles.push({
      id: Buffer.from(`${a.link}|${a.title}|${a.publishedAt}`).toString("base64url"),
      title: fbTitle,
      link: a.link,
      source: a.source,
      sourceUrl: a.sourceUrl,
      publishedAt: a.publishedAt,
      // Facebook: the caption IS the post's full content (shown once). News
      // articles: the cleaned summary stays under the headline.
      excerpt: isFb && caption ? "" : (caption ?? a.excerpt),
      image: isGoogleFb ? null : (ogImage ?? faviconFor(a.sourceUrl || a.link)),
      platform: isFb ? "facebook" : "news",
      authorName: a.authorName,
      authorAvatar: a.authorAvatar,
      fbLikeCount: a.fbLikeCount,
      fbCommentCount: a.fbCommentCount,
      fbShareCount: a.fbShareCount,
      liked: false,
      likeCount: a.fbLikeCount ?? 0,
      commentCount: a.fbCommentCount ?? 0,
    });
    ogCount++;
  }

  newsCache.set(cacheKey, { at: Date.now(), articles: allArticles, counts, suspension });

  const articles =
    category === "all"
      ? allArticles
      : allArticles.filter((x) => categoryOf(x.title, x.excerpt, category));
  return { articles, location, counts, suspension };
}

export async function toggleNewsLike(
  articleUrl: string
): Promise<{ liked: boolean; likeCount: number }> {
  const session = await requireUser();
  const existing = await db.newsLike.findUnique({
    where: { userId_articleUrl: { userId: session.user.id, articleUrl } },
  });
  if (existing) {
    await db.newsLike.delete({ where: { id: existing.id } });
  } else {
    await db.newsLike.create({
      data: { userId: session.user.id, articleUrl },
    });
  }
  const count = await db.newsLike.count({ where: { articleUrl } });
  return { liked: !existing, likeCount: count };
}

export interface NewsCommentItem {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  authorInitials: string;
}

export async function getNewsComments(articleUrl: string): Promise<NewsCommentItem[]> {
  await requireUser();
  const comments = await db.newsComment.findMany({
    where: { articleUrl },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    authorName: `${c.user.firstName} ${c.user.lastName}`.trim() || "Schedly user",
    authorInitials: `${c.user.firstName?.[0] ?? ""}${c.user.lastName?.[0] ?? ""}`.toUpperCase() || "?",
  }));
}

export async function addNewsComment(
  articleUrl: string,
  body: string
): Promise<{ comment: NewsCommentItem; commentCount: number }> {
  const session = await requireUser();
  const clean = body.trim().slice(0, 500);
  if (!clean) throw new Error("Comment cannot be empty");

  const comment = await db.newsComment.create({
    data: { userId: session.user.id, articleUrl, body: clean },
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
  const count = await db.newsComment.count({ where: { articleUrl } });
  return {
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      authorName: `${comment.user.firstName} ${comment.user.lastName}`.trim() || "Schedly user",
      authorInitials: `${comment.user.firstName?.[0] ?? ""}${comment.user.lastName?.[0] ?? ""}`.toUpperCase() || "?",
    },
    commentCount: count,
  };
}
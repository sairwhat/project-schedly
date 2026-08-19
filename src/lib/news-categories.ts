// Shared by the News server actions (filtering) and the News page (instant
// client-side chip switching). Kept in one place so the keyword sets never
// drift between server and client.

export type NewsCategory = "all" | "school" | "government" | "weather" | "news";

// Keyword sets used to tag articles into categories AFTER fetching — the
// query itself stays location-only so the sources return as many results as
// possible (a long OR-clause narrows the feeds to a handful of items).
export const CATEGORY_KEYWORDS: Record<Exclude<NewsCategory, "all">, string[]> = {
  school: [
    "school", "college", "university", "deped", "class suspension", "walang pasok",
    "enrollment", "classes", "students", "teachers", "campus", "exam", "semester",
    "education", "learning",
  ],
  government: [
    "mayor", "lgu", "barangay", "city government", "municipal", "ordinance",
    "council", "governor", "congress", "senator", "national government", "dilg",
    "announcement", "advisory",
  ],
  weather: [
    "bagyo", "typhoon", "weather", "pagasa", "baha", "flood", "ulan", "rain",
    "sakuna", "lindol", "earthquake", "volcanic", "la nina", "el nino", "habagat",
    "amihan", "storm", "landslide", "evacuat",
  ],
  news: [
    "balita", "news", "headline", "update", "announce", "advisory",
    "development", "launch", "opens", "inaugurat", "release", "wins", "tops",
    "partnership", "program", "project", "facility", "official", "celebration",
    "honors", "aid", "assistance", "fund", "grant",
  ],
};

export function categoryOf(
  title: string,
  excerpt: string,
  category: NewsCategory
): boolean {
  if (category === "all") return true;
  const text = `${title} ${excerpt}`.toLowerCase();
  return CATEGORY_KEYWORDS[category].some((k) => text.includes(k));
}

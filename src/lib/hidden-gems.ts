export const HIDDEN_GEMS_NAME = "Hidden Gems of the Parsha";
export const HIDDEN_GEMS_TAGLINE = "Little discoveries. Meaningful lessons. Great Shabbos conversations.";
export type HiddenGem = {
  slug: string; parshaKey: string; parshaLabel: string; subseries: string; title: string;
  subheading: string; opening: string; explanation: string; reflection: string;
  equations: readonly { hebrew: string; value: number; label: string }[];
  price: number; priceLine: string; sourceLine: string; sourceText: string; sourceUrl: string;
};
export const HIDDEN_GEMS_BY_PARSHA: Readonly<Record<string, readonly HiddenGem[]>> = {
  "chayei sarah": [{
    slug: "the-400-shekel-secret", parshaKey: "chayei sarah", parshaLabel: "Chayei Sarah",
    subseries: "The Baal HaTurim Corner", title: "The 400-Shekel Secret",
    subheading: "Parshas Chayei Sarah | A Gematria from the Baal HaTurim",
    opening: "When Avraham Avinu purchased the Me’aras HaMachpelah, Ephron demanded 400 silver shekalim.",
    equations: [
      { hebrew: "עפרן", value: 400, label: "Ephron’s shortened name" },
      { hebrew: "עין רע", value: 400, label: "An ‘evil’ or begrudging eye" },
    ],
    price: 400, priceLine: "And Ephron’s price: 400 shekalim.",
    explanation: "Ephron initially offered the burial place as a gift, but ultimately demanded a substantial payment. The Baal HaTurim shows how the unusual spelling hints at a begrudging eye and the very sum he charged.",
    reflection: "True generosity isn’t measured by what we offer, but by what we’re willing to give.",
    sourceLine: "מקור: בעל הטורים, בראשית כ״ג, ט״ז",
    sourceText: "לעפרן. חסר בגימטריא עין רע. עפרן עולה ת' כנגד ארבע מאות שקלים שלקח במערה:",
    sourceUrl: "https://he.wikisource.org/wiki/בעל_הטורים_על_התורה/בראשית/כג",
  }],
};
export const hiddenGemEditions = Object.values(HIDDEN_GEMS_BY_PARSHA).flat();
export function hiddenGemBySlug(slug: string): HiddenGem | undefined {
  return hiddenGemEditions.find((gem) => gem.slug === slug);
}
export function normalizeGemParsha(key: string): string {
  return key.replace(/^Parshas\s+/i, "").replace(/-/g, " ").trim().toLowerCase();
}
export type HomepageGemContext = {
  normalizedCollectionKey: string; activeParshaKey: string | null;
  isFallback: boolean; isYomTov: boolean; readingDate: string | null;
};
// Fail closed on unknown/stale reading windows without changing site selection.
export function homepageHiddenGem(context: HomepageGemContext, now: Date): HiddenGem | undefined {
  if (context.isFallback || context.isYomTov || !context.activeParshaKey || !context.readingDate || !Number.isFinite(now.getTime())) return;
  const key = normalizeGemParsha(context.normalizedCollectionKey);
  if (key !== normalizeGemParsha(context.activeParshaKey)) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(context.readingDate)) return;
  const reading = Date.parse(`${context.readingDate}T12:00:00Z`);
  if (!Number.isFinite(reading) || new Date(reading).toISOString().slice(0, 10) !== context.readingDate) return;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const daysUntilReading = (reading - Date.parse(`${today}T12:00:00Z`)) / 86_400_000;
  if (daysUntilReading < 0 || daysUntilReading > 6) return;
  return HIDDEN_GEMS_BY_PARSHA[key]?.[0];
}
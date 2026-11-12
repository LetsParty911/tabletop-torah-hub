export const HIDDEN_GEMS_NAME = "Hidden Gems of the Parsha";
export const HIDDEN_GEMS_TAGLINE = "Little discoveries. Meaningful lessons. Great Shabbos conversations.";
export type HiddenGem = {
  slug: string; parshaKey: string; parshaLabel: string; subseries: string; title: string;
  subheading: string; opening: string; detailParagraphs: readonly string[]; explanation: string; reflection: string;
  equations: readonly { hebrew: string; value: number; label: string }[];
  finalValue: string; finalLabel: string; bridgeLine: string;
  sourceLine: string; sourceText: string; sourceUrl: string; sourceLinkLabel: string;
};
export const HIDDEN_GEMS_BY_PARSHA: Readonly<Record<string, readonly HiddenGem[]>> = {
  "chayei sarah": [{
    slug: "the-400-shekel-secret", parshaKey: "chayei sarah", parshaLabel: "Chayei Sarah",
    subseries: "The Baal HaTurim Corner", title: "The 400-Shekel Secret",
    subheading: "Parshas Chayei Sarah | A Gematria from the Baal HaTurim",
    opening: "When Avraham Avinu purchased the Me’aras HaMachpelah, Ephron demanded 400 silver shekalim.",
    detailParagraphs: [
      "Ephron’s name is normally spelled עפרון. In Bereishis 23:16, the Torah omits the letter ו, spelling it עפרן.",
    ],
    equations: [
      { hebrew: "עפרן", value: 400, label: "Ephron’s shortened name" },
      { hebrew: "עין רע", value: 400, label: "An ‘evil’ or begrudging eye" },
    ],
    finalValue: "400 shekalim", finalLabel: "Ephron’s price",
    bridgeLine: "And Ephron’s price: 400 shekalim.",
    explanation: "Ephron initially offered the burial place as a gift, but ultimately demanded a substantial payment. The Baal HaTurim shows how the unusual spelling hints at a begrudging eye and the very sum he charged.",
    reflection: "True generosity isn’t measured by what we offer, but by what we’re willing to give.",
    sourceLine: "מקור: בעל הטורים, בראשית כ״ג, ט״ז",
    sourceText: "לעפרן. חסר בגימטריא עין רע. עפרן עולה ת' כנגד ארבע מאות שקלים שלקח במערה:",
    sourceUrl: "https://he.wikisource.org/wiki/בעל_הטורים_על_התורה/בראשית/כג",
    sourceLinkLabel: "Baal HaTurim, Bereishis 23:16",
  }],
  "toldos": [{
    slug: "fire-and-straw-hidden-in-one-word", parshaKey: "toldos", parshaLabel: "Toldos",
    subseries: "The Baal HaTurim Corner", title: "Fire & Straw — Hidden in One Word",
    subheading: "Parshas Toldos | A Gematria from the Baal HaTurim",
    opening: "After Yitzchak’s tefillah is answered, the Torah says: וַתַּהַר רִבְקָה אִשְׁתּוֹ — “Rivkah, his wife, became pregnant.”",
    detailParagraphs: [
      "The Baal HaTurim discovers a remarkable gematria hidden in the word אִשְׁתּוֹ.",
      "Even before Yaakov and Esav are born, their future is hinted to in this one word.",
    ],
    equations: [
      { hebrew: "אשתו", value: 707, label: "Rivkah as Yitzchak’s wife" },
      { hebrew: "קש ואש", value: 707, label: "“straw and fire”" },
    ],
    finalValue: "707", finalLabel: "The shared gematria",
    bridgeLine: "אשתו = קש ואש = 707",
    explanation: "The Baal HaTurim explains that Yaakov is compared to fire and Esav to straw—an image already hinted to before the twins are born.",
    reflection: "A flame may begin small, but it can have tremendous power. The fire of Yaakov reminds us of the lasting strength of kedushah.",
    sourceLine: "מקור: בעל הטורים, בראשית כ״ה, כ״א",
    sourceText: "ותהר רבקה אשתו. אשתו בגימטריא קש ואש. והיה בית יעקב אש ובית עשו לקש:",
    sourceUrl: "https://he.wikisource.org/wiki/בעל_הטורים_על_התורה/בראשית/כה",
    sourceLinkLabel: "Baal HaTurim, Bereishis 25:21",
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
  if (context.isFallback || context.isYomTov || !Number.isFinite(now.getTime())) return;
  const key = normalizeGemParsha(context.normalizedCollectionKey);
  const gem = HIDDEN_GEMS_BY_PARSHA[key]?.[0];
  if (!gem) return;

  // The displayed, non-fallback weekly collection is the primary source of truth.
  // When a valid reading date is available, keep the normal six-day freshness guard.
  // If Hebcal/date resolution is temporarily unavailable, do not hide an otherwise
  // approved gem for the current published collection.
  if (context.readingDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(context.readingDate)) return;
    const reading = Date.parse(`${context.readingDate}T12:00:00Z`);
    if (!Number.isFinite(reading) || new Date(reading).toISOString().slice(0, 10) !== context.readingDate) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const daysUntilReading = (reading - Date.parse(`${today}T12:00:00Z`)) / 86_400_000;
    if (daysUntilReading < 0 || daysUntilReading > 6) return;
  }

  return gem;
}

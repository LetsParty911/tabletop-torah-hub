/**
 * Pure story-descriptor for the admin "Recent activity" panel.
 *
 * The wording must match what actually happened: a tagged Open PDF click is an
 * expressed intent to open a PDF, not proof the PDF was opened, read or
 * downloaded. Priority mirrors the Used Torah reason order:
 * download > embedded viewer open > tagged Open PDF click > other engagement.
 */
export interface RecentStoryEvent {
  event: string | null;
}

export interface RecentStorySession {
  usedTorahReason: string | null;
  pageviews: number;
  events: RecentStoryEvent[];
}

export function describeRecentStoryAction(session: RecentStorySession): string {
  const events = session.events ?? [];
  if (events.some((event) => event.event === "download")) return "requested a download";
  if (events.some((event) => event.event === "pdf_open")) return "opened a PDF";
  if (
    session.usedTorahReason === "Clicked Open PDF" &&
    events.some((event) => event.event === "publication_click")
  ) {
    return "requested to open a PDF";
  }
  const pageviews = session.pageviews;
  return `viewed ${pageviews} ${pageviews === 1 ? "page" : "pages"}`;
}

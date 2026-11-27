import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// Real homepage component, with only the data and nested services replaced.
// No network calls, real subscriber email, database credentials, or maintenance bypass.
const state = vi.hoisted(() => ({
  loader: null as any,
  invalidate: vi.fn(async () => {}),
  countdown: vi.fn(),
}));

vi.mock("@tanstack/react-router", async () => {
  const { createElement } = await import("react");
  return {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      ...options,
      useLoaderData: () => state.loader,
    }),
    useRouter: () => ({ invalidate: state.invalidate }),
    useRouterState: ({ select }: any) => select({ location: { href: "/", hash: "" } }),
    Link: ({ to, params, children, ...props }: any) =>
      createElement(
        "a",
        {
          ...props,
          href: String(to).replace("$id", params?.id ?? "").replace("$slug", params?.slug ?? ""),
        },
        children,
      ),
  };
});

vi.mock("@/integrations/supabase/api.functions", () => ({
  listOriginalEditions: vi.fn(async () => ({ groups: [], activeSeriesIds: [], promotionCovers: [] })),
  getParshaOverride: vi.fn(async () => ({ override: null, isActive: false })),
  getActiveSubscriberCount: vi.fn(async () => ({ count: 0 })),
  getAnnouncementBanner: vi.fn(async () => ({ enabled: false })),
  getThursdayProgress: vi.fn(async () => ({ fillStep: null })),
  listHomepageWeek: vi.fn(async () => ({
    resources: state.loader.resources,
    isFallback: state.loader.isFallback,
    fallbackParshaKey: state.loader.fallbackParshaKey,
  })),
}));
vi.mock("@/lib/hebcal", () => ({
  resolveHebcalParsha: vi.fn(async () => ({ parshaKey: state.loader.parshaKey })),
  resolveReadingForDate: vi.fn(async () => null),
  nextParshaAfter: vi.fn(() => null),
  isPastReading: vi.fn(() => false),
}));
vi.mock("@/lib/table-chooser", () => ({
  CHOOSERS: [],
  chooseReason: () => "A good starting point",
  pickRecommendations: (resources: any[]) => resources.slice(0, 1),
  pickStarterSelections: (resources: any[]) =>
    resources.slice(0, 3).map((resource, i) => ({
      key: ["kids", "family", "quick"][i],
      label: ["Children", "Family", "Quick read"][i],
      resource,
    })),
}));

vi.mock("@/components/AnnouncementBanner", () => ({ AnnouncementBanner: () => null }));
vi.mock("@/components/UpdateCountdown", () => ({ UpdateCountdown: (props: unknown) => { state.countdown(props); return <div>Release countdown</div>; } }));
vi.mock("@/components/ThursdayProgressMeter", () => ({ ThursdayProgressMeter: () => null }));
vi.mock("@/components/DownloadAndPrintButtons", () => ({
  DownloadAndPrintButtons: ({ href }: { href: string }) => <a href={href}>Open PDF</a>,
}));
vi.mock("@/components/PublicationCardTracker", () => ({
  PublicationCardTracker: ({ children }: { children: React.ReactNode }) => <article>{children}</article>,
}));
vi.mock("@/components/SharePublicationButton", () => ({ SharePublicationButton: () => null }));
vi.mock("@/components/TableChooser", () => ({ TableChooser: () => <div data-testid="table-chooser" /> }));
vi.mock("@/components/MobileCollectionControlsBar", () => ({ MobileCollectionControlsBar: () => null }));
vi.mock("@/components/WeeklyEmailSignup", () => ({
  WeeklyEmailSignup: () => <form aria-label="Weekly Torah signup — homepage"><input aria-label="Email address" /></form>,
}));
vi.mock("@/components/SiteFooter", () => ({ SiteFooter: () => null }));
vi.mock("@/components/BackToTop", () => ({ BackToTop: () => null }));
vi.mock("@/components/FeaturedAudioBookCard", () => ({
  FeaturedAudioBookCard: ({ book }: { book: { title: string } }) => <section aria-label="Featured Parsha Audio Book">{book.title}</section>,
}));
vi.mock("@/hooks/use-prewarm-downloads", () => ({ usePrewarmDownloads: () => undefined }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/first-party-analytics", () => ({ trackFp: vi.fn(), getSessionId: vi.fn(() => null) }));

import { Route } from "../routes/index";
import { TFTT_ORIGINAL_SERIES } from "@/lib/tftt-originals";
import { ORIGINAL_PROMOTION_SERIES } from "@/lib/originals-promotion";

const example = (index: number, parshaKey: string) => ({
  id: `example-${index}`,
  parsha_key: parshaKey,
  title: `Sample Torah Sheet ${index}`,
  publisher: "Sample publisher",
  subtitle: "A short sample",
  url: `https://example.test/sample-${index}.pdf`,
  summary_quick: null,
  content_type: "Stories",
  summary_audio_path: null,
  primary_category: null,
  publication: "Sample series",
  publication_id: null,
  tags: [],
  description: null,
  audience: index % 2 ? "Children" : "Families",
  format_type: "Stories",
  page_count: index,
  badge: null,
  featured_slot: null,
});

function setHomepage(isFallback: boolean) {
  const selectedParsha = isFallback ? "Noach" : "Lech-Lecha";
  state.loader = {
    label: "Parshas Lech-Lecha",
    parshaKey: "Lech-Lecha",
    resources: [1, 2, 3, 4].map((n) => example(n, selectedParsha)),
    isFallback,
    fallbackParshaLabel: isFallback ? "Parshas Noach" : null,
    fallbackParshaKey: isFallback ? "Noach" : null,
    subscriberCount: null,
    readingDate: "2026-10-24",
    upcomingAfterYomTovKey: null,
    announcement: { enabled: false, text: null, linkUrl: null, linkLabel: null },
    progressFillStep: 100,
    progressEta: "2026-10-15T20:00:00-04:00",
  };
}

const Homepage = (Route as any).component as React.ComponentType;

beforeEach(() => state.invalidate.mockClear());
afterEach(() => cleanup());

describe("homepage publication and discovery smoke test with isolated data", () => {
  it("keeps Noach PDFs available while countdown represents unpublished Lech-Lecha", () => {
    setHomepage(true);
    render(<Homepage />);
    expect(state.countdown).toHaveBeenLastCalledWith(expect.objectContaining({ contentLive: false, availableCount: 0, liveParshaLabel: "Parshas Lech-Lecha", readingDate: "2026-10-24", collectionComplete: false }));
    expect(screen.getByText("Release countdown")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Parshas Lech-Lecha — This Week's Parsha" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Previous Collection — Parshas Noach" })).toBeTruthy();
    expect(screen.getByText(/These 4 selections are from Parshas Noach, not Parshas Lech-Lecha/)).toBeTruthy();
    expect(screen.getByText(/This week's Divrei Torah are being prepared/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Get notification/i })).toBeNull();
    expect(screen.getAllByRole("form", { name: /Weekly Torah signup/i })).toHaveLength(1);

    const share = screen.getByRole("link", { name: "Share on WhatsApp" });
    const message = new URL(share.getAttribute("href") ?? "").searchParams.get("text") ?? "";
    expect(message).toContain("utm_campaign=weekly-share");
    expect(message).not.toContain("Parshas Lech-Lecha");
  });

  it("lists this week's PDFs exactly once, originals included, with a compact link to the originals page", () => {
    setHomepage(false);
    state.loader.resources = [
      ...TFTT_ORIGINAL_SERIES.map((series, index) => ({
        ...example(index + 1, "Lech-Lecha"),
        title: series.title,
        publication_id: series.id,
      })),
      { ...example(5, "Lech-Lecha"), featured_slot: "children" },
      { ...example(6, "Lech-Lecha"), featured_slot: "family" },
    ];
    render(<Homepage />);
    const openHrefs = screen.getAllByRole("link", { name: "Open PDF" }).map((link) => link.getAttribute("href"));
    expect(openHrefs).toHaveLength(6);
    expect(new Set(openHrefs).size).toBe(6);
    for (const series of TFTT_ORIGINAL_SERIES) {
      expect(screen.getAllByRole("link", { name: series.title })).toHaveLength(1);
    }
    expect(document.querySelectorAll("#this-weeks-collection")).toHaveLength(1);
    expect(screen.queryByText(/Also Available This Week/)).toBeNull();
    expect(screen.queryByText(/Recommended Picks/)).toBeNull();
    const promotion = screen.getByRole("region", { name: "Choose Your Shabbos Bundle" });
    expect(document.querySelectorAll("#our-originals")).toHaveLength(1);
    const collection = document.getElementById("this-weeks-collection");
    if (!collection) throw new Error("Missing weekly collection");
    expect(promotion.compareDocumentPosition(collection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Our Seven Original Series" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Our Original Publications" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "More Divrei Torah for Your Table" })).toBeTruthy();
    expect(screen.queryByText("Introducing Three New Weekly Series")).toBeNull();
    expect(screen.getByRole("link", { name: "Explore Our Original Series" }).getAttribute("href")).toBe("/originals");
  });

  it("renders all seven permanent artworks independently of the current weekly issue thumbnails", () => {
    setHomepage(false);
    state.loader.resources = [example(1, "Lech-Lecha")];
    render(<Homepage />);
    const promotion = screen.getByRole("region", { name: "Choose Your Shabbos Bundle" });
    expect(within(promotion).getAllByRole("img")).toHaveLength(7);
    for (const series of ORIGINAL_PROMOTION_SERIES) {
      const image = within(promotion).getByRole("img", { name: "Promotional cover of " + series.title });
      expect(image.getAttribute("src")).toBe(series.coverSrc);
      expect(image.getAttribute("width")).toBe("320");
      expect(image.getAttribute("height")).toBe("400");
      expect(within(promotion).getByRole("link", { name: "View " + series.title + " series archive" })).toBeTruthy();
    }
    expect(within(promotion).queryByText(/Coming Soon/)).toBeNull();
    expect(within(promotion).queryByText(/Published cover previews/)).toBeNull();
    expect(screen.getAllByRole("link", { name: "Open PDF" })).toHaveLength(1);
  });

  it("uses permanent artwork for all seven weekly listings including new issues without previews", () => {
    setHomepage(false);
    state.loader.resources = [
      ...ORIGINAL_PROMOTION_SERIES.map((series, index) => ({
        ...example(index + 1, "Lech-Lecha"),
        title: series.title,
        publication_id: series.publicationId,
        thumb_url: index % 2 ? "/weekly-issue.png" : null,
        small_thumb_url: "/weekly-small.webp",
      })),
      { ...example(8, "Lech-Lecha"), thumb_url: "/external.png" },
    ];
    render(<Homepage />);
    const weekly = within(document.getElementById("this-weeks-collection")!);
    for (const series of ORIGINAL_PROMOTION_SERIES) {
      const image = weekly.getByRole("img", { name: series.title + " permanent cover" });
      expect(image.getAttribute("src")).toBe(series.coverSrc);
      expect(image.getAttribute("height")).toBe("140");
    }
    expect(weekly.getByRole("img", { name: /Cover for Sample Torah Sheet 8/ }).getAttribute("src")).toBe("/external.png");
  });

  it("opens a weekly PDF without displaying an audiobook promotion", () => {
    setHomepage(false);
    state.loader.featuredAudioBook = { id: "book-1", title: "Sample Parsha Audio Book" };
    render(<Homepage />);
    const firstOpen = screen.getAllByRole("link", { name: "Open PDF" })[0];
    expect(firstOpen.getAttribute("href")).toBe("/view/example-1/pdf");
    expect(document.getElementById("this-weeks-collection")!.contains(firstOpen)).toBe(true);
    expect(screen.queryByRole("region", { name: "Featured Parsha Audio Book" })).toBeNull();
    expect(screen.queryByText("Sample Parsha Audio Book")).toBeNull();
  });

  it("shows every PDF and one stable collection anchor for small weekly releases", () => {
    setHomepage(false);
    state.loader.resources = [1, 2].map((n) => example(n, "Lech-Lecha"));
    render(<Homepage />);
    expect(screen.getAllByRole("link", { name: "Open PDF" })).toHaveLength(2);
    expect(document.querySelectorAll("#this-weeks-collection")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /See all 2 selections/ })).toBeNull();
    expect(screen.queryByTestId("table-chooser")).toBeNull();
    expect(screen.getByRole("link", { name: "Share on WhatsApp" })).toBeTruthy();
  });

  it("shows every selection of a larger collection once, with no extra expand step", () => {
    setHomepage(false);
    state.loader.resources = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => example(n, "Lech-Lecha"));
    render(<Homepage />);
    expect(screen.getAllByRole("link", { name: "Open PDF" })).toHaveLength(8);
    expect(screen.queryByRole("button", { name: /View all 8/ })).toBeNull();
  });

  it("uses one compact mobile filter surface and filters actual published selections", () => {
    setHomepage(false);
    state.loader.resources = [1, 2, 3, 4, 5, 6].map((n) => example(n, "Lech-Lecha"));
    state.loader.resources[4] = { ...state.loader.resources[4], audience: "Adults" };
    state.loader.resources[5] = { ...state.loader.resources[5], format_type: "Short Vorts", content_type: "Brief Insights" };
    render(<Homepage />);
    const filters = document.getElementById("filters")!;
    const quick = within(screen.getByRole("group", { name: "Quick filters" }));
    expect(quick.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(quick.getByRole("button", { name: "Children" })).toBeTruthy();
    expect(quick.getByRole("button", { name: "Families" })).toBeTruthy();
    expect(quick.getByRole("button", { name: "Deeper Learning" })).toBeTruthy();
    expect(quick.getByRole("button", { name: "Brief Insights" })).toBeTruthy();
    const firstRow = quick.getByRole("button", { name: "All" }).parentElement!;
    const secondRow = quick.getByRole("button", { name: "Deeper Learning" }).parentElement!;
    expect(firstRow.className).toContain("grid-cols-3");
    expect(secondRow.className).toContain("grid-cols-2");
    expect(within(firstRow).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["All", "Children", "Families"]);
    expect(quick.getByRole("button", { name: "All" }).textContent).toContain("(6)");
    expect(quick.getByRole("button", { name: "Brief Insights" }).textContent).toContain("(1)");
    expect(within(secondRow).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Deeper Learning", "Brief Insights"]);
    fireEvent.click(quick.getByRole("button", { name: "Children" }));
    expect(screen.getAllByRole("link", { name: "Open PDF" })).toHaveLength(2);
    fireEvent.click(quick.getByRole("button", { name: "Brief Insights" }));
    expect(screen.getAllByRole("link", { name: "Open PDF" })).toHaveLength(1);
    fireEvent.click(quick.getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("link", { name: "Open PDF" })).toHaveLength(6);
    expect(within(filters).getByRole("button", { name: "More filters" })).toBeTruthy();
    expect(filters.className).not.toContain("sticky");
    expect(document.querySelectorAll("#filters")).toHaveLength(1);
    expect(document.querySelectorAll("#weekly-filter-options")).toHaveLength(1);
    const signup = screen.getByRole("form", { name: "Weekly Torah signup — homepage" });
    const collection = document.getElementById("this-weeks-collection")!;
    const bundles = document.getElementById("our-originals")!;
    expect(bundles.compareDocumentPosition(signup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(signup.compareDocumentPosition(collection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Divrei Torah in Hebrew — In Development").compareDocumentPosition(collection) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Browse all available Divrei Torah/i })).toBeNull();
  });

  it("does not leave empty mobile filter columns when categories are unavailable", () => {
    setHomepage(false);
    state.loader.resources = [1, 2, 3, 4, 5, 6].map((n) => ({ ...example(n, "Lech-Lecha"), audience: "Children" }));
    render(<Homepage />);
    const quick = within(screen.getByRole("group", { name: "Quick filters" }));
    expect(quick.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["All", "Children"]);
    expect(quick.getByRole("button", { name: "Children" }).textContent).toContain("(6)");
    expect(quick.getByRole("button", { name: "All" }).parentElement!.className).toContain("grid-cols-2");
  });

  it("reveals the complete PDF selection on explicit request", () => {
    setHomepage(true);
    render(<Homepage />);
    expect(screen.queryByTestId("table-chooser")).toBeNull();
    expect(screen.getByText("4 selections available in the earlier collection")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Browse Earlier Collection: Parshas Noach" }));
    expect(screen.queryByTestId("table-chooser")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Sample Torah Sheet 4" }).length).toBeGreaterThan(0);
    const openLinks = screen.getAllByRole("link", { name: "Open PDF" });
    expect(openLinks.length).toBeGreaterThanOrEqual(4);
    expect(openLinks.some((link) => link.getAttribute("href") === "/view/example-1/pdf")).toBe(true);
  });

  it("shows the full small collection without extra filtering", () => {
    setHomepage(false);
    render(<Homepage />);
    expect(screen.queryByTestId("table-chooser")).toBeNull();
    expect(screen.getByText("4 selections available this week")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Browse This Week's Printables" }));
    expect(screen.queryByTestId("table-chooser")).toBeNull();
  });

  it("stops labeling a live Lech-Lecha collection as an upcoming fallback", () => {
    setHomepage(false);
    render(<Homepage />);
    expect(screen.queryByText("Release countdown")).toBeNull();
    expect(screen.queryByText(/Coming next: Parshas Lech-Lecha/)).toBeNull();
    expect(screen.getAllByRole("form", { name: /Weekly Torah signup/i })).toHaveLength(1);
    const share = screen.getByRole("link", { name: "Share on WhatsApp" });
    const message = new URL(share.getAttribute("href") ?? "").searchParams.get("text") ?? "";
    expect(message).toContain("utm_campaign=weekly-share");
    expect(message).not.toContain("Parshas Noach");
  });
});

it("keeps advanced options available when another filter leaves zero matches", () => {
  setHomepage(false);
  state.loader.resources = [1, 2, 3, 4, 5, 6].map((n) => example(n, "Lech-Lecha"));
  state.loader.resources[5] = { ...state.loader.resources[5], content_type: "Brief Insights", format_type: "Short Vorts", audience: "Adults" };
  render(<Homepage />);
  fireEvent.click(screen.getByRole("button", { name: "More filters" }));
  const advanced = document.getElementById("weekly-filter-options");
  if (!advanced) throw new Error("Missing advanced options");
  const brief = within(advanced).getByRole("button", { name: "Filter by content type: Brief Insights" });
  expect((brief as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(within(screen.getByRole("group", { name: "Quick filters" })).getByRole("button", { name: "Children" }));
  expect(screen.getAllByRole("link", { name: "Open PDF" })).toHaveLength(3);
  expect(within(advanced).getByRole("button", { name: "Filter by content type: Brief Insights" })).toBe(brief);
  expect((brief as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Fewer filters/ }));
  expect(advanced.hidden).toBe(true);
});

it("keeps all current-week bundles available when audience filters narrow the seven originals", () => {
  setHomepage(false);
  state.loader.parshaKey = "Vayishlach";
  state.loader.label = "Parshas Vayishlach";
  state.loader.readingDate = "2026-11-28";
  state.loader.resources = ORIGINAL_PROMOTION_SERIES.map((series, index) => ({
    ...example(index + 1, "Vayishlach"),
    title: series.title,
    publication_id: series.publicationId,
  }));
  render(<Homepage />);
  const region = within(screen.getByRole("region", { name: "Choose Your Shabbos Bundle" }));
  const prepareButtons = region.getAllByRole("button", { name: /^Combine (Both|All Three) Publications into One PDF:/ });
  expect(prepareButtons).toHaveLength(3);
  expect(prepareButtons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  fireEvent.click(within(screen.getByRole("group", { name: "Quick filters" })).getByRole("button", { name: "Children" }));
  expect(screen.getAllByRole("link", { name: "Open PDF" })).toHaveLength(4);
  expect(region.getAllByText(/^2 publications · \d+ pages$/)).toHaveLength(2);
  expect(region.getByText(/^3 publications · \d+ pages$/)).toBeTruthy();
  expect(prepareButtons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
});

it("polls actual publications and invalidates when the first current PDF goes live", async () => {
  vi.useFakeTimers();
  try {
    setHomepage(true);
    render(<Homepage />);
    const { act } = await import("@testing-library/react");
    await act(async () => {});
    state.invalidate.mockClear();
    const { listHomepageWeek } = await import("@/integrations/supabase/api.functions");
    vi.mocked(listHomepageWeek).mockResolvedValueOnce({ resources: [example(1, "Lech-Lecha")], isFallback: false, fallbackParshaKey: null } as any);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(state.invalidate).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

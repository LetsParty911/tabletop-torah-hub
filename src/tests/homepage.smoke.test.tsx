import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
    lazyRouteComponent: (getComp: unknown) => {
      // The TanStack Start transform rewrites `component: Index` to a
      // lazyRouteComponent reference; resolve it so the real component renders.
      const loaded = typeof getComp === "function" ? (getComp as () => unknown)() : getComp;
      if (typeof loaded === "function") return loaded;
      const LazyRoute = (props: Record<string, unknown>) => {
        const [Comp, setComp] = React.useState<any>(null);
        React.useEffect(() => {
          Promise.resolve(loaded).then((m: unknown) => setComp((m as any)?.default ?? m));
        }, []);
        if (!Comp) return null;
        return createElement(Comp, props);
      };
      return LazyRoute;
    },
    useRouter: () => ({ invalidate: state.invalidate }),
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
  DownloadAndPrintButtons: ({ href }: { href: string }) => <a href={href}>Read Now</a>,
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
vi.mock("@/hooks/use-prewarm-downloads", () => ({ usePrewarmDownloads: () => undefined }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/first-party-analytics", () => ({ trackFp: vi.fn() }));

import { Route } from "../routes/index";

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
    expect(screen.getByRole("link", { name: /Get notification/i }).getAttribute("href")).toBe("#weekly-email-signup");
    expect(screen.getAllByRole("form", { name: /Weekly Torah signup/i })).toHaveLength(1);

    const share = screen.getByRole("link", { name: "Share Torah For The Table" });
    const message = new URL(share.getAttribute("href") ?? "").searchParams.get("text") ?? "";
    expect(message).toContain("Parshas Noach");
    expect(message).not.toContain("Parshas Lech-Lecha");
  });

  it("reveals complete PDF selection and chooser only on explicit request", () => {
    setHomepage(true);
    render(<Homepage />);
    expect(screen.queryByTestId("table-chooser")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show all 4 selections" }));
    expect(screen.getByTestId("table-chooser")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sample Torah Sheet 4" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Read Now" }).length).toBe(4);
  });

  it("stops labeling a live Lech-Lecha collection as an upcoming fallback", () => {
    setHomepage(false);
    render(<Homepage />);
    expect(screen.getByText("Release countdown")).toBeTruthy();
    expect(screen.queryByText(/Coming next: Parshas Lech-Lecha/)).toBeNull();
    expect(screen.getAllByRole("form", { name: /Weekly Torah signup/i })).toHaveLength(1);
    const share = screen.getByRole("link", { name: "Share Torah For The Table" });
    const message = new URL(share.getAttribute("href") ?? "").searchParams.get("text") ?? "";
    expect(message).toContain("Parshas Lech-Lecha");
    expect(message).not.toContain("Parshas Noach");
  });
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

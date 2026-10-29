import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/api.functions", () => ({ subscribeEmail: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn(), trackEventOnce: vi.fn() }));
vi.mock("@/lib/first-party-analytics", () => ({ trackFp: vi.fn() }));

import { WeeklyEmailSignup } from "./WeeklyEmailSignup";

describe("homepage weekly email signup", () => {
  it("retains a single accessible signup with explicit consent and a stable anchor", () => {
    const html = renderToStaticMarkup(<WeeklyEmailSignup sourceId="homepage" />);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("weekly-email-signup");
    expect(html).toContain('for="weekly-email-signup-email"');
    expect(html).toContain('id="weekly-email-signup-email"');
    expect(html).toContain("Weekly Torah signup — homepage");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(1);
    expect(html).toContain("You can unsubscribe at any time.");
  });

  it("renders exactly one homepage signup after the PDF collection", () => {
    const homepage = readFileSync("src/routes/index.tsx", "utf8");
    const countdown = readFileSync("src/components/UpdateCountdown.tsx", "utf8");
    expect((homepage.match(/<WeeklyEmailSignup\b/g) ?? []).length).toBe(1);
    expect(homepage).not.toContain('sourceId="homepage-top"');
    expect(homepage).toContain('sourceId="homepage"');
    expect(homepage).toContain('heading="Receive the Weekly Shabbos Collection"');
    expect(homepage.indexOf("<WeeklyEmailSignup")).toBeGreaterThan(homepage.indexOf("filteredResources.map"));
    expect(homepage).toContain("{viewAllLabel}");
    expect(homepage).toContain("<DownloadAndPrintButtons");
    expect(countdown).not.toContain("#weekly-email-signup-top");
    expect((countdown.match(/href="#weekly-email-signup"/g) ?? []).length).toBe(2);
  });

  it("keeps a single email field, explicit consent, and the stable signup anchor", () => {
    const html = renderToStaticMarkup(<WeeklyEmailSignup sourceId="homepage" />);
    expect((html.match(/type="email"/g) ?? []).length).toBe(1);
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(1);
    expect(html).toContain('id="weekly-email-signup"');
  });

  it("preserves consent, existing subscription flow and analytics attribution", () => {
    const source = readFileSync("src/components/WeeklyEmailSignup.tsx", "utf8");
    expect(source.indexOf("if (!consent)")).toBeLessThan(source.indexOf("await subscribeEmail"));
    expect(source).toContain("email, consent: true, source: sourceId");
    expect(source).toContain("source_id: sourceId");
    expect(source).toContain("newsletter_signup:${sourceId}");
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
  });
});

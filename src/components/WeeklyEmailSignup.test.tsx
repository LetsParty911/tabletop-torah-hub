import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/api.functions", () => ({ subscribeEmail: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn(), trackEventOnce: vi.fn() }));
vi.mock("@/lib/first-party-analytics", () => ({ trackFp: vi.fn() }));

import { WeeklyEmailSignup } from "./WeeklyEmailSignup";

describe("homepage Thursday signup placements", () => {
  it("renders unique anchors, input labels and named forms while retaining the lower anchor", () => {
    const html = renderToStaticMarkup(<>
      <WeeklyEmailSignup variant="compact" sourceId="homepage-top" anchorId="weekly-email-signup-top" />
      <WeeklyEmailSignup sourceId="homepage" />
    </>);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("weekly-email-signup-top");
    expect(ids).toContain("weekly-email-signup");
    for (const id of ["weekly-email-signup-top-email", "weekly-email-signup-email"]) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("Weekly Torah signup — homepage-top");
    expect(html).toContain("Weekly Torah signup — homepage");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect(html).toContain("You can unsubscribe at any time.");
  });

  it("places the compact signup after the PDF discovery introduction and before featured picks", () => {
    const source = readFileSync("src/routes/index.tsx", "utf8");
    const top = source.indexOf('sourceId="homepage-top"');
    expect(top).toBeGreaterThan(source.indexOf("Help me choose a Dvar Torah"));
    expect(top).toBeLessThan(source.indexOf('aria-labelledby="starter-selections-heading"'));
    expect(top).toBeLessThan(source.indexOf('sourceId="homepage"'));
    expect(source).toContain('anchorId="weekly-email-signup-top"');
    expect(source).toContain("One free email each Thursday when the next Divrei Torah collection is ready.");
    expect(source).toContain('href="#weekly-email-signup-top"');
    expect(source).not.toContain('href="#weekly-email-signup"');
  });

  it("preserves explicit consent, existing subscription flow and independent placement attribution", () => {
    const source = readFileSync("src/components/WeeklyEmailSignup.tsx", "utf8");
    expect(source.indexOf("if (!consent)")).toBeLessThan(source.indexOf("await subscribeEmail"));
    expect(source).toContain("email: parsedEmail.data, consent: true, source: sourceId");
    expect(source).toContain("source_id: sourceId");
    expect(source).toContain("newsletter_signup:${sourceId}");
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
  });
});
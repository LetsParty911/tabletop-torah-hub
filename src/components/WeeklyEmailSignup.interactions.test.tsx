import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/integrations/supabase/api.functions", () => ({ subscribeEmail: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn(), trackEventOnce: vi.fn() }));
vi.mock("@/lib/first-party-analytics", () => ({ trackFp: vi.fn() }));
import { subscribeEmail } from "@/integrations/supabase/api.functions";
import { trackEvent, trackEventOnce } from "@/lib/analytics";
import { trackFp } from "@/lib/first-party-analytics";
import { WeeklyEmailSignup } from "./WeeklyEmailSignup";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const placements = [
  { variant: "compact" as const, sourceId: "homepage-top", anchorId: "weekly-email-signup-top" },
  { variant: "full" as const, sourceId: "homepage", anchorId: "weekly-email-signup" },
];

for (const placement of placements) {
  describe(placement.sourceId, () => {
    it("requires explicit consent and focuses its checkbox without sending or tracking", async () => {
      render(<WeeklyEmailSignup {...placement} />);
      await userEvent.type(screen.getByRole("textbox"), "reader@example.test");
      await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
      expect(screen.getByRole("alert").textContent).toContain("Please agree");
      expect(document.activeElement).toBe(screen.getByRole("checkbox"));
      expect(subscribeEmail).not.toHaveBeenCalled();
      expect(trackEvent).not.toHaveBeenCalled();
      expect(trackFp).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      "submits with placement attribution and reports success (existing: %s)",
      async (alreadySubscribed) => {
        vi.mocked(subscribeEmail).mockResolvedValue({ ok: true, alreadySubscribed } as never);
        render(<WeeklyEmailSignup {...placement} />);
        await userEvent.type(screen.getByRole("textbox"), "reader@example.test");
        await userEvent.click(screen.getByRole("checkbox"));
        await userEvent.type(screen.getByRole("textbox"), "{Enter}");
        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Thank you"));
        expect(subscribeEmail).toHaveBeenCalledExactlyOnceWith({
          data: { email: "reader@example.test", consent: true, source: placement.sourceId },
        });
        expect(trackEvent).toHaveBeenCalledWith("newsletter_signup_submit", {
          form_name: "weekly_torah_notifications",
        });
        expect(trackFp).toHaveBeenCalledWith("signup_attempt", { metadata: {
          source_id: placement.sourceId,
          form_id: "weekly_torah_notifications",
        } });
        expect(trackFp).not.toHaveBeenCalledWith("signup_failure", expect.anything());
        expect(trackEventOnce).toHaveBeenCalledWith(
          "newsletter_signup",
          { form_name: "weekly_torah_notifications", already_subscribed: alreadySubscribed },
          `tftt:analytics-sent:newsletter_signup:${placement.sourceId}`,
        );
        expect(trackFp).toHaveBeenCalledWith("signup", {
          metadata: {
            form_id: "weekly_torah_notifications",
            source_id: placement.sourceId,
            already_subscribed: alreadySubscribed,
          },
        });
      },
    );

    it("shows a recoverable error for a rejected request without success analytics", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(subscribeEmail).mockRejectedValueOnce(new Error("Network unavailable"));
      render(<WeeklyEmailSignup {...placement} />);
      await userEvent.type(screen.getByRole("textbox"), "reader@example.test");
      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByRole("button"));
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain("Please try again"),
      );
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
      expect(trackEventOnce).not.toHaveBeenCalled();
      expect(trackFp).toHaveBeenCalledWith("signup_attempt", { metadata: {
        source_id: placement.sourceId,
        form_id: "weekly_torah_notifications",
      } });
      expect(trackFp).toHaveBeenCalledWith("signup_failure", { metadata: {
        source_id: placement.sourceId,
        form_id: "weekly_torah_notifications",
        failure_type: "network_or_runtime",
      } });
      expect(trackFp).not.toHaveBeenCalledWith("signup", expect.anything());
      log.mockRestore();
    });

    it("disables submission in flight and allows retry after a server error", async () => {
      let resolve!: (value: any) => void;
      vi.mocked(subscribeEmail).mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }) as never,
      );
      render(<WeeklyEmailSignup {...placement} />);
      await userEvent.type(screen.getByRole("textbox"), "reader@example.test");
      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByRole("button"));
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
      await userEvent.click(screen.getByRole("button"));
      expect(subscribeEmail).toHaveBeenCalledTimes(1);
      resolve({ ok: false, error: "Please try again" });
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Please try again"));
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
      expect(trackFp).toHaveBeenCalledWith("signup_attempt", { metadata: {
        source_id: placement.sourceId,
        form_id: "weekly_torah_notifications",
      } });
      expect(trackFp).toHaveBeenCalledWith("signup_failure", { metadata: {
        source_id: placement.sourceId,
        form_id: "weekly_torah_notifications",
        failure_type: "service_response",
      } });
      expect(trackFp).not.toHaveBeenCalledWith("signup", expect.anything());
      expect(trackEventOnce).not.toHaveBeenCalled();
      vi.mocked(subscribeEmail).mockResolvedValueOnce({ ok: true } as never);
      await userEvent.click(screen.getByRole("button"));
      await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
      expect(subscribeEmail).toHaveBeenCalledTimes(2);
      expect(trackFp).toHaveBeenCalledWith("signup", expect.anything());
      expect(trackEventOnce).toHaveBeenCalledTimes(1);
    });
  });
}

it("keeps consent and completion independent when both forms are present", async () => {
  vi.mocked(subscribeEmail).mockResolvedValue({ ok: true } as never);
  render(
    <>
      {placements.map((p) => (
        <WeeklyEmailSignup key={p.sourceId} {...p} />
      ))}
    </>,
  );
  const top = within(screen.getByRole("form", { name: "Weekly Torah signup — homepage-top" }));
  const lower = within(screen.getByRole("form", { name: "Weekly Torah signup — homepage" }));
  await userEvent.type(top.getByRole("textbox"), "reader@example.test");
  await userEvent.click(top.getByRole("checkbox"));
  expect((lower.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  await userEvent.click(top.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
  expect(lower.getByRole("textbox")).toBeTruthy();
  expect(subscribeEmail).toHaveBeenCalledTimes(1);
});

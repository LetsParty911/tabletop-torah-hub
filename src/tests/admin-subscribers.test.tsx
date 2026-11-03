// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/api.functions", () => ({
  adminDeleteSubscribers: vi.fn(),
}));

import SubscribersManager, { type Subscriber } from "@/components/admin/SubscribersManager";
import { fetchSubscriberList, refreshAdminDashboard } from "@/lib/admin-subscribers-load";

const ROWS: Subscriber[] = [
  { id: "11111111-1111-4111-8111-111111111111", email: "reader.one@example.com", created_at: "2026-11-03T12:55:00Z" },
  { id: "22222222-2222-4222-8222-222222222222", email: "reader.two@example.com", created_at: "2026-11-03T12:52:00Z" },
];

afterEach(cleanup);

describe("refreshAdminDashboard", () => {
  it("still applies subscribers when another admin request rejects", async () => {
    let applied: Subscriber[] = [];
    const loadSubscribers = async () => {
      const r = await fetchSubscriberList(async () => ({ subscribers: ROWS }));
      if (r.ok) applied = r.subscribers;
    };
    const loadOthers = async () => {
      throw new Error("getWhatsNewPopup failed");
    };
    await expect(refreshAdminDashboard({ loadSubscribers, loadOthers })).rejects.toThrow(
      "getWhatsNewPopup failed",
    );
    expect(applied).toHaveLength(2);
    expect(applied[0].email).toBe("reader.one@example.com");
  });

  it("does not wait on other requests to fail before applying subscribers", async () => {
    let applied = 0;
    let rejectOthers!: (e: Error) => void;
    const others = new Promise<void>((_, rej) => (rejectOthers = rej));
    const p = refreshAdminDashboard({
      loadSubscribers: async () => {
        applied = ROWS.length;
      },
      loadOthers: () => others,
    });
    await Promise.resolve();
    expect(applied).toBe(2);
    rejectOthers(new Error("adminListPdfs failed"));
    await expect(p).rejects.toThrow();
  });
});

describe("fetchSubscriberList", () => {
  it("returns an error result instead of an empty list when the fetch fails", async () => {
    const r = await fetchSubscriberList(async () => {
      throw new Error("Forbidden");
    });
    expect(r).toEqual({ ok: false, error: "Forbidden" });
  });
});

describe("SubscribersManager load states", () => {
  const base = { accessToken: "token-123456", onChanged: vi.fn() };

  it("shows rows after a successful fetch", () => {
    render(<SubscribersManager {...base} subscribers={ROWS} status="ready" />);
    expect(screen.getByText("Subscribers (2)")).toBeTruthy();
    expect(screen.getByText("reader.one@example.com")).toBeTruthy();
    expect(screen.getByText("reader.two@example.com")).toBeTruthy();
    expect(screen.queryByText("No subscribers yet.")).toBeNull();
  });

  it("shows loading, not the empty state, while loading", () => {
    render(<SubscribersManager {...base} subscribers={[]} status="loading" onRefresh={vi.fn()} />);
    expect(screen.getByText("Loading subscribers…")).toBeTruthy();
    expect(screen.queryByText("No subscribers yet.")).toBeNull();
  });

  it("shows an error with Retry, not the empty state, when loading fails", () => {
    const onRefresh = vi.fn();
    render(
      <SubscribersManager {...base} subscribers={[]} status="error" loadError="Forbidden" onRefresh={onRefresh} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Could not load subscribers: Forbidden");
    expect(screen.queryByText("No subscribers yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("Refresh requests the latest subscribers", () => {
    const onRefresh = vi.fn();
    render(<SubscribersManager {...base} subscribers={ROWS} status="ready" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state only when a successful fetch returned no rows", () => {
    render(<SubscribersManager {...base} subscribers={[]} status="ready" />);
    expect(screen.getByText("No subscribers yet.")).toBeTruthy();
  });
});

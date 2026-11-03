// Pure helpers that keep the admin Subscribers list independent of every
// other dashboard request. A failure elsewhere (PDF list, banners, progress,
// checklist sources…) must never stop the subscriber rows from being applied,
// and a subscriber failure must surface as an error — never as an empty list.

export type SubscriberRow = { id: string; email: string; created_at: string };

export type SubscribersLoadStatus = "idle" | "loading" | "ready" | "error";

export type SubscriberFetchResult =
  | { ok: true; subscribers: SubscriberRow[] }
  | { ok: false; error: string };

/** Runs the (already access-checked) server fetch and never throws. */
export async function fetchSubscriberList(
  fetcher: () => Promise<{ subscribers: unknown }>,
): Promise<SubscriberFetchResult> {
  try {
    const res = await fetcher();
    if (!res || !Array.isArray(res.subscribers)) {
      return { ok: false, error: "Unexpected response while loading subscribers." };
    }
    return { ok: true, subscribers: res.subscribers as SubscriberRow[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message ? e.message : "Could not load subscribers." };
  }
}

/**
 * Starts the subscriber load and the rest of the dashboard load side by side
 * and waits for both to settle. The subscriber load is self-contained (it
 * applies its own state), so another request rejecting cannot block it. A
 * rejection from the rest of the dashboard is re-thrown afterwards so
 * existing callers keep their current error handling.
 */
export async function refreshAdminDashboard(opts: {
  loadSubscribers: () => Promise<void>;
  loadOthers: () => Promise<void>;
}): Promise<void> {
  const [, others] = await Promise.allSettled([opts.loadSubscribers(), opts.loadOthers()]);
  if (others.status === "rejected") throw others.reason;
}

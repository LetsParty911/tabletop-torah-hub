import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OLD_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  process.env.SENDER_API_TOKEN = "test-only-token";
  delete process.env.SENDER_GROUP_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...OLD_ENV };
});

describe("Sender subscriber sync", () => {
  it("finds the subscriber group on a second page", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "other", title: "Other" }], meta: { last_page: 2 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "target", title: "TorahForTheTable Website Subscribers" }], meta: { last_page: 2 } }) })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetcher);
    const { addSubscriberToSenderGroup } = await import("./sender.server");
    expect(await addSubscriberToSenderGroup("reader@example.com")).toEqual({ ok: true, alreadySubscribed: false });
    expect(fetcher.mock.calls[1][0]).toContain("page=2");
    expect(JSON.parse(fetcher.mock.calls[2][1].body).groups).toEqual(["target"]);
  });

  it("does not treat arbitrary 422 validation failure as an existing subscriber", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "target", title: "TorahForTheTable Website Subscribers" }], meta: { last_page: 1 } }) })
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Invalid subscriber payload" });
    vi.stubGlobal("fetch", fetcher);
    const { addSubscriberToSenderGroup } = await import("./sender.server");
    expect(await addSubscriberToSenderGroup("reader@example.com")).toEqual({ ok: false, reason: "api_error", status: 422 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails closed without a configured API token", async () => {
    delete process.env.SENDER_API_TOKEN;
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { addSubscriberToSenderGroup } = await import("./sender.server");
    expect(await addSubscriberToSenderGroup("reader@example.com")).toEqual({ ok: false, reason: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

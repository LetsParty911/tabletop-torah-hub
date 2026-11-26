import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getSenderNetRedirectTarget,
  SENDER_NET_REDIRECT_TARGETS,
} from "./sender-net-redirects";

const expectedTargets = {
  "/sn-family":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=family",
  "/sn-children":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=children",
  "/sn-deeper":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=deeper",
  "/sn-main":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=main_button",
  "/sn-footer":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=footer",
} as const;

describe("Sender.net Vayishlach bundle short links", () => {
  it.each(Object.entries(expectedTargets))("%s has the exact approved destination", (path, target) => {
    expect(SENDER_NET_REDIRECT_TARGETS[path as keyof typeof expectedTargets]).toBe(target);
    expect(getSenderNetRedirectTarget(path)).toBe(target);

    const url = new URL(target);
    expect(url.origin).toBe("https://torahforthetable.com");
    expect(url.pathname).toBe("/");
    expect([...url.searchParams.keys()]).toEqual([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
    ]);
  });

  it("does not claim the existing /sn link or any unrelated path", () => {
    expect(getSenderNetRedirectTarget("/sn")).toBeUndefined();
    expect(getSenderNetRedirectTarget("/k")).toBeUndefined();
    expect(getSenderNetRedirectTarget("/")).toBeUndefined();
    expect(getSenderNetRedirectTarget("/sn-family/extra")).toBeUndefined();
  });

  it("keeps Vercel configuration synchronized and temporary without changing /sn", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
    ) as {
      redirects: Array<{ source: string; destination: string; permanent: boolean }>;
    };

    for (const [source, destination] of Object.entries(expectedTargets)) {
      expect(config.redirects.find((redirect) => redirect.source === source)).toEqual({
        source,
        destination,
        permanent: false,
      });
    }

    expect(config.redirects.find((redirect) => redirect.source === "/sn")).toEqual({
      source: "/sn",
      destination:
        "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=toldos_5787",
      permanent: false,
    });
  });
});

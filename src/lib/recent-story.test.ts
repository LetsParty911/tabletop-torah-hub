import { describe, expect, it } from "vitest";
import { describeRecentStoryAction } from "@/lib/recent-story";

const click = { event: "publication_click" };
const taggedClickShape = { event: "publication_click" };

describe("describeRecentStoryAction", () => {
  it("reports a tagged Open PDF click as a request to open, never as opened/read/downloaded", () => {
    const did = describeRecentStoryAction({
      usedTorahReason: "Clicked Open PDF",
      pageviews: 3,
      events: [click, taggedClickShape],
    });
    expect(did).toBe("requested to open a PDF");
    expect(did).not.toMatch(/opened|read|download/i);
  });

  it("keeps download as the top-priority descriptor", () => {
    const did = describeRecentStoryAction({
      usedTorahReason: "Clicked Open PDF",
      pageviews: 2,
      events: [{ event: "publication_click" }, { event: "pdf_open" }, { event: "download" }],
    });
    expect(did).toBe("requested a download");
  });

  it("keeps embedded viewer open above the tagged click", () => {
    const did = describeRecentStoryAction({
      usedTorahReason: "Opened a PDF",
      pageviews: 2,
      events: [{ event: "publication_click" }, { event: "pdf_open" }],
    });
    expect(did).toBe("opened a PDF");
  });

  it("falls back to page-view wording for sessions without a tagged click", () => {
    const did = describeRecentStoryAction({
      usedTorahReason: null,
      pageviews: 4,
      events: [{ event: "page_view" }, { event: "publication_click" }],
    });
    expect(did).toBe("viewed 4 pages");
  });

  it("uses singular page wording for a single page view", () => {
    const did = describeRecentStoryAction({
      usedTorahReason: null,
      pageviews: 1,
      events: [{ event: "page_view" }],
    });
    expect(did).toBe("viewed 1 page");
  });

  it("never claims opened/read/downloaded for a reason of Clicked Open PDF with no viewer load", () => {
    for (const reason of [null, "Shared Torah", "Clicked Open PDF"]) {
      const did = describeRecentStoryAction({
        usedTorahReason: reason,
        pageviews: 2,
        events: [{ event: "page_view" }, { event: "share_click" }],
      });
      expect(did).not.toMatch(/opened a PDF|read|download/i);
    }
  });
});

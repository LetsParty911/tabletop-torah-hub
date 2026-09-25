import { describe, expect, it } from "vitest";
import { aggregatePublications, type PublicationEventRow } from "./publication-funnel";

const PUB_ID = "3f1c0c2e-1111-4222-8333-444455556666";

function row(partial: Partial<PublicationEventRow> & { event_name: string }): PublicationEventRow {
  return {
    session_id: "session-1",
    visitor_id: "visitor-1",
    publication_id: PUB_ID,
    publication_title: "Parshas Vayeitzei Booklet",
    metadata: { action_id: "action-1" },
    ...partial,
  };
}

describe("aggregatePublications", () => {
  it("joins a titleless download_served row to the same publication as the action", () => {
    const rows = [
      row({ event_name: "publication_impression" }),
      row({ event_name: "pdf_open" }),
      row({ event_name: "download" }),
      // Server-recorded: has the id, no title.
      row({ event_name: "download_served", publication_title: null }),
    ];

    const result = aggregatePublications(rows);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Parshas Vayeitzei Booklet");
    expect(result[0].id).toBe(PUB_ID);
    expect(result[0].downloadActions).toBe(1);
    expect(result[0].downloadsServed).toBe(1);
    expect(result[0].pdfOpens).toBe(1);
    expect(result[0].impressions).toBe(1);
  });

  it("counts a served-only action as one actual download", () => {
    const result = aggregatePublications([
      row({ event_name: "download_served", publication_title: null, metadata: { action_id: "served-only" } }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].downloadActions).toBe(1);
    expect(result[0].downloadsServed).toBe(1);
  });

  it("carries the display title from whichever event knows it", () => {
    const result = aggregatePublications([
      row({ event_name: "download_served", publication_title: null }),
      row({ event_name: "download" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Parshas Vayeitzei Booklet");
  });

  it("keeps different publication ids apart even with the same title", () => {
    const result = aggregatePublications([
      row({ event_name: "download" }),
      row({ event_name: "download", publication_id: "other-id" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("falls back to the title when no publication id is present", () => {
    const result = aggregatePublications([
      row({ event_name: "download", publication_id: null }),
      row({ event_name: "pdf_open", publication_id: null }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBeNull();
    expect(result[0].title).toBe("Parshas Vayeitzei Booklet");
  });
});

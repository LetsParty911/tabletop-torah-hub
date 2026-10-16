import { describe, expect, it } from "vitest";
import { isClientReturningEvidence, isClientNewVisitorEvidence } from "./visitor-return-evidence";

describe("returning-visitor evidence", () => {
  it("does not trust historically synthetic server-side false flags", () => {
    expect(isClientReturningEvidence({ event_name: "pdf_route_result", is_new_visitor: false })).toBe(false);
    expect(isClientReturningEvidence({ event_name: "download_served", is_new_visitor: false })).toBe(false);
  });
  it("keeps authentic browser new/returning signals", () => {
    expect(isClientReturningEvidence({ event_name: "session_start", is_new_visitor: false })).toBe(true);
    expect(isClientReturningEvidence({ event_name: "publication_click", is_new_visitor: false })).toBe(true);
    expect(isClientNewVisitorEvidence({ event_name: "page_view", is_new_visitor: true })).toBe(true);
    expect(isClientNewVisitorEvidence({ event_name: "pdf_route_result", is_new_visitor: true })).toBe(false);
    expect(isClientReturningEvidence({ event_name: "page_view", is_new_visitor: null })).toBe(false);
  });
});

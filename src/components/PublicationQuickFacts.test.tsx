import { describe, expect, it } from "vitest";
import { getPublicationQuickFacts } from "./PublicationQuickFacts";

describe("PublicationQuickFacts", () => {
  it("keeps supported audience, format and length separate", () => {
    expect(getPublicationQuickFacts({ audience: "Families", format: "Stories", length: "3 pages" })).toEqual([
      { key: "audience", text: "For Families" },
      { key: "format", text: "Stories" },
      { key: "length", text: "3 pages" },
    ]);
  });
  it("never invents metadata or duplicates an existing For label", () => {
    expect(getPublicationQuickFacts({ audience: "For Children", format: " ", length: null })).toEqual([
      { key: "audience", text: "For Children" },
    ]);
    expect(getPublicationQuickFacts({})).toEqual([]);
  });
});

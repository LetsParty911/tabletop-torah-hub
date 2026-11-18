import { describe, expect, it } from "vitest";
import { nextArchiveSearch, parseArchiveSearch, selectionCountLabel, stripArchiveDefaults } from "./archive-search";

describe("archive URL state", () => {
  it("resolves an empty URL to every default", () => {
    expect(parseArchiveSearch({})).toEqual({
      year: "all", parsha: "all", audience: "All", q: "", length: "All", type: "All", pub: "All", page: 1,
    });
  });

  it("writes the Jewish year as a number so the URL reads ?year=5786", () => {
    expect(stripArchiveDefaults(parseArchiveSearch({ year: "5786" }))).toEqual({ year: 5786 });
    expect(stripArchiveDefaults(parseArchiveSearch({ year: 5786 }))).toEqual({ year: 5786 });
  });

  it("resets to page 1 when a filter changes", () => {
    expect(nextArchiveSearch({ page: 3, parsha: "Noach" }, { parsha: "Toldos" })).toEqual({ parsha: "Toldos" });
  });

  it("keeps an explicit page change", () => {
    expect(nextArchiveSearch({ parsha: "Noach" }, { page: 2 })).toEqual({ parsha: "Noach", page: 2 });
  });

  it("clearing every filter returns a clean /archive", () => {
    expect(nextArchiveSearch({ year: 5787, audience: "Children", q: "noach" }, { year: "all", audience: "All", q: "" })).toEqual({});
  });

  it("ignores unknown audience and length values", () => {
    const s = parseArchiveSearch({ audience: "Robots", length: "huge" });
    expect(s.audience).toBe("All");
    expect(s.length).toBe("All");
  });

  it("labels audience counts as selections, not publications", () => {
    expect(selectionCountLabel(1)).toBe("1 selection");
    expect(selectionCountLabel(4)).toBe("4 selections");
  });
});

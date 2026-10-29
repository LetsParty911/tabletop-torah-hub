import { describe, expect, it } from "vitest";
import { matchesParshaSearch, toParshaComparableKey } from "./parsha-normalize";

const makeRow = (parshaKey: string) => ({
  parshaKey,
  title: "Parsha Challenge",
  publication: "Parsha Challenge",
  publisher: null,
  subtitle: null,
  description: "Questions and answers for the Shabbos table",
});

describe("Vayeira spelling aliases", () => {
  it("matches Vayera and Vayeira as the same parsha key, including prefixes", () => {
    expect(toParshaComparableKey("Vayera")).toBe(toParshaComparableKey("Vayeira"));
    expect(toParshaComparableKey("Parshas Vayera")).toBe(toParshaComparableKey("Parshas Vayeira"));
    expect(toParshaComparableKey("Vayera")).not.toBe(toParshaComparableKey("Va'eira"));
  });

  it.each([
    ["vayera", "Vayeira"],
    ["vayeira", "Vayera"],
    ["Parshas Vayera", "Vayeira"],
    ["Parshas Vayeira", "Vayera"],
    ["VAYERA", "Vayeira"],
    ["vayeira", "Vayeira"],
  ])('search "%s" finds a PDF assigned to "%s"', (query, parsha) => {
    expect(matchesParshaSearch(query, makeRow(parsha))).toBe(true);
  });

  it("preserves ordinary title and description search", () => {
    expect(matchesParshaSearch("challenge", makeRow("Vayeira"))).toBe(true);
    expect(matchesParshaSearch("questions", makeRow("Vayeira"))).toBe(true);
    expect(matchesParshaSearch("vayera", { ...makeRow("Noach"), description: "Notes on Vayeira" })).toBe(true);
  });

  it("does not match unrelated parshiyos or Va'eira", () => {
    expect(matchesParshaSearch("vayera", makeRow("Noach"))).toBe(false);
    expect(matchesParshaSearch("vayera", makeRow("Va'eira"))).toBe(false);
  });
});

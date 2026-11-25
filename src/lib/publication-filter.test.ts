import { describe, expect, it } from "vitest";
import { KLEIN_PUBLICATION_FILTER, publicationFilterName } from "./publication-filter";

describe("publication/source filter grouping", () => {
  it("groups both canonical Klein weekly upload slots under one reader-facing label", () => {
    expect(publicationFilterName({
      publication_id: "4d5f000c-6e90-4d58-aa9f-fd73fc005115",
      publication: "R' Yehuda Zev Klein — Dvar Torah 1",
      title: "From Leitzanei HaDor to Modern Cynics",
    })).toBe(KLEIN_PUBLICATION_FILTER);

    expect(publicationFilterName({
      publication_id: "c3fa24ef-b7a8-42d1-a237-480bc24cba57",
      publication: "R' Yehuda Zev Klein — Dvar Torah 2",
      title: "Surround Yourself with Good Friends",
    })).toBe(KLEIN_PUBLICATION_FILTER);
  });

  it("recognizes historical unlinked PDFs only with explicit Klein bylines", () => {
    for (const title of [
      "The Bonei Oilem Story R' Yehuda Zev Klein",
      "Perfect Lulav, Imperfect Sukkah - Rabbi Yehuda Zev Klein",
      "R Aryeh Levine's Chavrusa - R' Y Z Klein",
    ]) {
      expect(publicationFilterName({ title, publication_id: null, publication: null }))
        .toBe(KLEIN_PUBLICATION_FILTER);
    }
  });

  it("does not infer a Klein author credit from a surname or unrelated canonical publication", () => {
    expect(publicationFilterName({ title: "A story about Klein", publication: null })).toBeNull();
    expect(publicationFilterName({
      title: "R' Yehuda Zev Klein",
      publication: "Toras Avigdor",
      publication_id: "54517350-6c16-4d33-b551-dab40d27c5c2",
    })).toBe("Toras Avigdor");
  });

  it("preserves normal publication facets without manufacturing labels from article titles", () => {
    expect(publicationFilterName({ publication: "In the Margins", title: "A lesson" }))
      .toBe("In the Margins");
    expect(publicationFilterName({ publication: null, title: "A Beautiful Story" }))
      .toBeNull();
  });
});

describe("canonical weekly publication facets", () => {
  it("prefers the canonical publication name over a raw legacy slug", () => {
    expect(publicationFilterName({ publication_id: "bd544c49-a810-478d-bf5c-38b94a81bc31", publication_name: "Mi Ka'amcha Yisroel", publication: "mikaamcha" })).toBe("Mi Ka'amcha Yisroel");
    expect(publicationFilterName({ publication_name: "Toras Avigdor", publication: null })).toBe("Toras Avigdor");
  });
  it("recognizes registered Originals even if legacy metadata is absent", () => {
    expect(publicationFilterName({ publication_id: "81b9fadd-3f96-43a2-b21d-6619567e8b1b", publication: null })).toBe("Parsha Pearls from the Ramban");
  });
  it("keeps the two Klein uploads in one facet despite canonical slot names", () => {
    expect(publicationFilterName({ publication_id: "4d5f000c-6e90-4d58-aa9f-fd73fc005115", publication_name: "R' Yehuda Zev Klein — Dvar Torah 1" })).toBe(KLEIN_PUBLICATION_FILTER);
    expect(publicationFilterName({ publication_id: "c3fa24ef-b7a8-42d1-a237-480bc24cba57", publication_name: "R' Yehuda Zev Klein — Dvar Torah 2" })).toBe(KLEIN_PUBLICATION_FILTER);
  });
});

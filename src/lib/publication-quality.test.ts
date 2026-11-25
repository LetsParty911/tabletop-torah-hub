import { describe, expect, it } from "vitest";
import { missingPublicationFields, publicationQualityError, publishedMetadataEditError } from "./publication-quality";

const complete = {
  title: "Example Torah essay",
  parsha_key: "Vayishlach",
  jewish_year: 5787,
  audience: "Adults",
  format_type: "Essays",
  description: "A discussion of the weekly parsha.",
  page_count: 2,
};

describe("publication quality gate", () => {
  it("accepts a complete edition, including custom one-off publications", () => {
    expect(publicationQualityError(complete)).toBeNull();
  });
  it("identifies missing or invalid reader-facing metadata", () => {
    expect(missingPublicationFields({...complete, audience: null, format_type: "", description: "  ", page_count: 0}))
      .toEqual(["audience", "format", "description", "page count"]);
    expect(missingPublicationFields({...complete, audience: "Unknown", jewish_year: null, page_count: 1.5}))
      .toEqual(["Jewish year", "audience", "page count"]);
  });
  it("defers derived fields only during pre-upload form checks", () => {
    const { jewish_year, page_count, ...form } = complete;
    expect(publicationQualityError(form, false)).toBeNull();
    expect(missingPublicationFields(form)).toEqual(["Jewish year", "page count"]);
    expect(publicationQualityError({...form, description: null}, false)).toContain("description");
  });
  it("prevents removing required values from published editions", () => {
    expect(publishedMetadataEditError(complete, {...complete, description: null})).toContain("description");
    expect(publishedMetadataEditError(complete, {...complete, audience: "", page_count: 0})).toContain("audience, page count");
  });
  it("permits gradual repair of incomplete historical records", () => {
    const old = {...complete, description: null, audience: null};
    expect(publishedMetadataEditError(old, {...old, description: complete.description})).toBeNull();
    expect(publishedMetadataEditError(old, {...old, format_type: null})).toContain("format");
  });
});

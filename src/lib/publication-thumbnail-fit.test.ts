import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("public publications thumbnail presentation", () => {
  it("uses the same contain fit rule as other PDF preview cards", () => {
    const publications = readFileSync("src/routes/publications.tsx", "utf8");
    const archiveThumbnail = readFileSync("src/components/PdfCoverThumbnail.tsx", "utf8");
    expect(publications).toContain('className="h-full w-full object-contain"');
    expect(publications).not.toContain("object-cover object-top");
    expect(archiveThumbnail).toContain("object-contain");
  });
});

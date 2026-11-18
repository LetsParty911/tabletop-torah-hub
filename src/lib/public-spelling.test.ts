import { describe, expect, it } from "vitest";
import { renameLegacySeriesText } from "./tftt-originals";
import { buildDownloadFilename } from "./download-filename";

describe("public spelling", () => {
  it("shows Vayetzei instead of Vayeitzei", () => {
    expect(renameLegacySeriesText("Parshas Vayeitzei 5787")).toBe("Parshas Vayetzei 5787");
  });
  it("shows Parsha Questions & Answers instead of Parsha Challenge", () => {
    expect(renameLegacySeriesText("PARSHA CHALLENGE — Vayeitzei")).toBe("Parsha Questions & Answers — Vayetzei");
  });
  it("leaves other text alone", () => {
    expect(renameLegacySeriesText("Vayeira")).toBe("Vayeira");
    expect(renameLegacySeriesText(null)).toBeNull();
  });
  it("builds download filenames with the public spelling", () => {
    expect(buildDownloadFilename("Vayeitzei", "Parsha Challenge")).toBe("Parshas-Vayetzei_Parsha-Questions-Answers.pdf");
  });
});

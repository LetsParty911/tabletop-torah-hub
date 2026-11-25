import { describe, it, expect } from "vitest";
import { summarizeReadingLibrary, readingLibraryGroup } from "./reading-library";
describe("complete reading index", () => {
  it("includes combined readings, holidays and legacy aliases without double counting", () => {
    const rows = [
      {parsha_key:"Vayetzei", jewish_year:5787},
      {parsha_key:"Vayeitzei", jewish_year:5786},
      {parsha_key:"Acharei Mos-Kedoshim", jewish_year:5786},
      {parsha_key:"Sukkos", jewish_year:5787},
      {parsha_key:"Special collection", jewish_year:5786},
      {parsha_key:null, jewish_year:5786},
      {parsha_key:"Pinchas", jewish_year:null},
    ];
    const result = summarizeReadingLibrary(rows);
    expect(result.reduce((n,r)=>n+r.count,0)).toBe(5);
    expect(result.find(r=>r.slug==="vayetzei")).toMatchObject({count:2,years:[5787,5786],permanentParsha:true});
    expect(result.find(r=>r.slug==="acharei-mos-kedoshim")?.permanentParsha).toBe(true);
    expect(result.find(r=>r.slug==="sukkos")?.permanentParsha).toBe(false);
    expect(result.find(r=>r.slug==="special-collection")?.permanentParsha).toBe(false);
  });
});

describe("reading library groups", () => {
  it("keeps canonical, combined, holiday and unknown readings distinct", () => {
    expect(readingLibraryGroup("Vayeitzei")).toBe("bereishis");
    expect(readingLibraryGroup("Vayakhel-Pekudei")).toBe("shemos");
    expect(readingLibraryGroup("Behar-Bechukosai")).toBe("vayikra");
    expect(readingLibraryGroup("Matos-Masei")).toBe("bamidbar");
    expect(readingLibraryGroup("Nitzavim-Vayeilech")).toBe("devarim");
    expect(readingLibraryGroup("Pesach")).toBe("yom-tov");
    expect(readingLibraryGroup("Special collection")).toBe("other-readings");
  });
});

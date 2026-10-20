import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homepage = readFileSync("src/routes/index.tsx", "utf8");
const meter = readFileSync("src/components/ThursdayProgressMeter.tsx", "utf8");

describe("homepage progressive collection disclosure", () => {
  it("reveals the full list before scrolling to a hidden chooser", () => {
    const start = homepage.indexOf("const revealCollection =");
    expect(start).toBeGreaterThan(0);
    const helper = homepage.slice(start, start + 490);
    expect(helper).toContain("setShowAllResources(true)");
    expect(helper).toContain("window.requestAnimationFrame(");
    expect(helper.indexOf("setShowAllResources(true)")).toBeLessThan(helper.indexOf("requestAnimationFrame("));
    expect(helper).toContain('document.getElementById(targetId)?.scrollIntoView(');
    expect(helper).toContain("prefers-reduced-motion");
    expect(homepage).toContain('revealCollection("shabbos-table-chooser")');
  });

  it("opens the collection when readers use the browse or completed-upload CTA", () => {
    expect(homepage).toContain('onClick={() => revealCollection()}');
    expect(homepage).toContain('onCompleteClick={() => setShowAllResources(true)}');
    expect(meter).toContain("onCompleteClick?: () => void");
    expect(meter).toContain("onClick={onCompleteClick}");
  });

  it("continues to display only existing published weekly resources", () => {
    expect(homepage).toContain('resources.length > 0 && !showAllResources');
    expect(homepage).toContain('showAllResources ? (');
    expect(homepage).toContain("filteredResources.map((r) => (");
  });
});

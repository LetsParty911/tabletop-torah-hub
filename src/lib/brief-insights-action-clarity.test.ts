import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Brief Insights action clarity", () => {
  const source = readFileSync("src/routes/brief-insights.tsx", "utf8");
  it("keeps the parsha hub link outside the collapsed panel", () => {
    const linkPosition = source.indexOf("See all Divrei Torah for {emptyLabel ?? heading}");
    const panelPosition = source.indexOf('id={`${id}-panel`}');
    expect(linkPosition).toBeGreaterThan(-1);
    expect(panelPosition).toBeGreaterThan(-1);
    expect(linkPosition).toBeLessThan(panelPosition);
  });
  it("labels PDF availability rather than an unlabeled PDF action", () => {
    expect(source).toContain('"PDF available"');
    expect(source).toContain('label="Read Brief Insights PDF"');
  });
});

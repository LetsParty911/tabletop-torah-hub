import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("parsha year collection pages", () => {
  it("render their own year collection instead of nesting under the all-years parsha page", () => {
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    const block = tree.slice(tree.indexOf("const ParshaSlugYearRoute = "), tree.indexOf("} as any)", tree.indexOf("const ParshaSlugYearRoute = ")));
    expect(block).toContain("path: '/parsha/$slug/$year'");
    expect(block).toContain("getParentRoute: () => rootRouteImport");
  });
});

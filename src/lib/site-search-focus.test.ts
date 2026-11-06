import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("site search keyboard focus visibility", () => {
  it("has a distinct focus outline without changing search semantics", () => {
    const source = readFileSync("src/routes/__root.tsx", "utf8");
    expect(source).toContain('name="q"');
    expect(source).toContain('type="search"');
    expect(source).toContain("focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary");
  });
});

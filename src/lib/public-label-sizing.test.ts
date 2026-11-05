import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("accepted UX review: public labels use at least 11px", () => {
  const paths = [
    "src/components/CategoryBadge.tsx",
    "src/components/UpdateCountdown.tsx",
    "src/components/WhatsNewBanner.tsx",
    "src/routes/publication.$slug.tsx",
    "src/routes/publications.tsx",
    "src/components/TableChooser.tsx",
  ];
  it.each(paths)("%s has no 9.6px or 10.4px public labels", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/text-\\[0\\.(?:55|6|65)rem\\]/);
  });
});

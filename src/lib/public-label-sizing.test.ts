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
  it.each(paths)("%s avoids the old undersized label classes", (path) => {
    const source = readFileSync(path, "utf8");
    for (const size of ["0.55rem", "0.6rem", "0.65rem"]) {
      expect(source).not.toContain("text-[" + size + "]");
    }
  });
});

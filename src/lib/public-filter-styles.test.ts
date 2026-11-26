import { describe, expect, it } from "vitest";
import { publicFilterTone, PUBLIC_FILTER_FIELD_TONE, PUBLIC_FILTER_COUNT_TONE, PUBLIC_ARCHIVE_SEARCH_PLACEHOLDER } from "./public-filter-styles";

describe("shared reader filter appearance", () => {
  it.each(["pill", "segmented"] as const)("uses primary colors for selected %s filters", (variant) => {
    const selected = publicFilterTone(true, variant).split(" ");
    expect(selected).toContain("bg-primary");
    expect(selected).toContain("text-primary-foreground");
    expect(selected).not.toContain("bg-accent");
    const unselected = publicFilterTone(false, variant).split(" ");
    expect(unselected).not.toContain("bg-primary");
    expect(unselected).toContain("text-primary");
  });

  it("uses visible, theme-aware borders for unselected pills and fields", () => {
    expect(publicFilterTone(false)).toContain("border-muted-foreground");
    expect(PUBLIC_FILTER_FIELD_TONE).toContain("border-muted-foreground");
    expect(PUBLIC_FILTER_FIELD_TONE).toContain("focus:border-primary");
    expect(PUBLIC_FILTER_FIELD_TONE).toContain("focus-visible:outline-primary");
  });

  it("preserves readable count colors in both filter states", () => {
    expect(PUBLIC_FILTER_COUNT_TONE(true)).toContain("text-primary-foreground");
    expect(PUBLIC_FILTER_COUNT_TONE(false)).toContain("text-accent-readable");
  });

  it("uses a concise archive search prompt", () => {
    expect(PUBLIC_ARCHIVE_SEARCH_PLACEHOLDER.length).toBeLessThanOrEqual(24);
  });
});

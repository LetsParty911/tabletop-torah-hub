/** Reader-facing filters share the same selected and unselected states.
 * Keep these tones separate from decorative gold frames and status badges. */
export function publicFilterTone(active: boolean, variant: "pill" | "segmented" = "pill"): string {
  if (active) {
    return variant === "pill"
      ? "border-primary bg-primary text-primary-foreground shadow-sm"
      : "bg-primary text-primary-foreground shadow-sm";
  }
  return variant === "pill"
    ? "border-muted-foreground bg-background text-primary hover:border-primary hover:bg-accent/10"
    : "text-primary hover:bg-accent/10";
}

/** Use the full-strength, theme-aware muted foreground for control outlines,
 * not the translucent decorative accent border. */
export const PUBLIC_FILTER_FIELD_TONE =
  "border-muted-foreground bg-background text-foreground focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const PUBLIC_FILTER_COUNT_TONE = (active: boolean) =>
  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent/10 text-accent-readable";

export const PUBLIC_ARCHIVE_SEARCH_PLACEHOLDER = "Search title or topic";

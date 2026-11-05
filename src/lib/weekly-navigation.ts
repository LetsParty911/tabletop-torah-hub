export const WEEKLY_COLLECTION_ANCHOR = "this-weeks-collection";

export function isWeeklyCollectionHash(hash: string): boolean {
  return hash.replace(/^#/, "") === WEEKLY_COLLECTION_ANCHOR;
}

/** Called after React commits the expanded choices, never before they exist. */
export function scrollToWeeklyCollection(): void {
  const target = document.getElementById(WEEKLY_COLLECTION_ANCHOR);
  if (!target) return;
  target.scrollIntoView?.({
    block: "start",
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
  });
  target.focus({ preventScroll: true });
}
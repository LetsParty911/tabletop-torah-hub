import { useEffect, useRef } from "react";
import { getSessionId, trackFp } from "@/lib/first-party-analytics";

export type HomepageSectionId = "originals" | "weekly_collection";
const VISIBLE_RATIO = 0.5;
const DWELL_MS = 1000;

// In-memory de-duplication; reporting also de-duplicates by session ID.
const sent = new Set<string>();
function trackOnce(kind: "homepage_journey_start" | "section_impression", label: string, metadata: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const sid = getSessionId();
  if (!sid) return;
  const key = [sid, kind, label].join(":");
  if (sent.has(key)) return;
  sent.add(key);
  trackFp(kind, { metadata: { tracking_version: 1, ...metadata } });
}

/** Hydrated homepage with published content. This passive signal is not human proof. */
export function trackHomepageJourneyStart(hasOriginals: boolean): void {
  trackOnce("homepage_journey_start", "home", { has_originals: hasOriginals });
}

/** 50% continuous foreground visibility for one second, like publication-card impressions. */
export function useHomepageSectionImpression<T extends HTMLElement>(sectionId: HomepageSectionId, enabled: boolean) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => { if (timer !== null) clearTimeout(timer); timer = null; };
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) =>
        entry.target === element && entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO
      );
      if (!visible || document.visibilityState === "hidden") {
        clear();
        return;
      }
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        if (document.visibilityState === "hidden") return;
        trackOnce("section_impression", sectionId, { section_id: sectionId });
        observer.disconnect();
      }, DWELL_MS);
    }, { threshold: [0, VISIBLE_RATIO] });
    observer.observe(element);
    return () => { clear(); observer.disconnect(); };
  }, [sectionId, enabled]);
  return ref;
}

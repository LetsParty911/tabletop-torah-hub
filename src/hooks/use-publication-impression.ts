import { useEffect, useRef } from "react";
import { trackImpressionOnce, type PublicationContext } from "@/lib/first-party-analytics";

const VISIBLE_RATIO = 0.5;
const DWELL_MS = 1000;

/**
 * Counts a publication_impression once a card has been at least ~50% visible
 * for about a second. De-duplication per page view lives in
 * first-party-analytics so a long list can't spam impressions.
 */
export function usePublicationImpression<T extends HTMLElement>(pub: PublicationContext) {
  const ref = useRef<T | null>(null);
  const pubRef = useRef(pub);
  pubRef.current = pub;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
            if (!timer) {
              timer = setTimeout(() => {
                trackImpressionOnce(pubRef.current);
                observer.disconnect();
              }, DWELL_MS);
            }
          } else {
            clear();
          }
        }
      },
      { threshold: [VISIBLE_RATIO] },
    );

    observer.observe(el);
    return () => {
      clear();
      observer.disconnect();
    };
  }, []);

  return ref;
}

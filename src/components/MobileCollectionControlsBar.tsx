import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { MyTableIndicator } from "@/components/MyTableIndicator";

type Props = {
  /** Element id of the in-flow (sticky) collection controls. */
  anchorId: string;
  count: number;
  activeFilterCount: number;
  onOpenFilters: () => void;
};

/**
 * Mobile-only page-level clone of the collection controls.
 * `position: sticky` on the in-flow bar only sticks inside its parent section,
 * so it disappears once that section ends. This fixed, body-portaled bar takes
 * over as soon as the in-flow bar scrolls above the header line, and stays put
 * to the very bottom of the page. Desktop never renders it.
 */
export function MobileCollectionControlsBar({ anchorId, count, activeFilterCount, onOpenFilters }: Props) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    const update = () => {
      if (window.innerWidth >= 640) {
        setShow(false);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      // While its section is in view the in-flow bar stays stuck at top-14 (56px).
      // Once the section ends it scrolls away — that's when we take over.
      setShow(rect.top < 50);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [anchorId]);

  if (!mounted || !show) return null;

  return createPortal(
    <div className="fixed inset-x-0 top-14 z-[70] border-b border-accent/20 bg-background/95 px-3 py-2 backdrop-blur sm:hidden">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onOpenFilters();
            document.getElementById(anchorId)?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
              block: "start",
            });
          }}
          className="min-w-0 flex-1 truncate rounded-full border border-accent/45 bg-background px-4 py-2 text-left font-serif text-sm font-semibold text-primary shadow-sm"
        >
          Filter {count} selections{activeFilterCount > 0 ? ` · ${activeFilterCount} active` : ""}
        </button>
        <MyTableIndicator className="shrink-0" />
      </div>
    </div>,
    document.body,
  );
}

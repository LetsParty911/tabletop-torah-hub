import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

type Props = {
  collectionId: string;
};

export function BackToTop({ collectionId }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const el = document.getElementById(collectionId);
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show once the entire collection has scrolled above the viewport.
        setVisible(entry.boundingClientRect.bottom < 0);
      },
      { threshold: 0, rootMargin: "0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [collectionId]);

  const scrollToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      className={`fixed bottom-20 right-4 z-40 inline-flex items-center justify-center gap-1.5 rounded-full border border-accent/50 bg-background/90 px-3 py-2 text-xs font-semibold text-primary shadow-sm backdrop-blur-sm transition-opacity duration-200 hover:border-accent hover:bg-accent hover:text-accent-foreground ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <ArrowUp className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Top</span>
    </button>
  );
}

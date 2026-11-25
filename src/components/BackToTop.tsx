import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

type Props = {
  collectionId: string;
};

export function BackToTop({ collectionId }: Props) {
  const [collectionScrolled, setCollectionScrolled] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const el = document.getElementById(collectionId);
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show once the entire collection has scrolled above the viewport.
        setCollectionScrolled(entry.boundingClientRect.bottom < 0);
      },
      { threshold: 0, rootMargin: "0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [collectionId]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const footer = document.getElementById("site-footer");
    if (!footer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setFooterVisible(entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px" },
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  const scrollToTop = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const visible = collectionScrolled && !footerVisible;

  const buttonContent = <><ArrowUp className="h-4 w-4" aria-hidden="true" /><span>Back to top</span></>;
  const buttonStyle = "min-h-11 items-center justify-center gap-1.5 rounded-full border border-accent/50 bg-background px-4 py-2 text-xs font-semibold text-primary transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return (
    <>
      <div className="text-center sm:hidden">
        <button type="button" onClick={scrollToTop} className={`inline-flex ${buttonStyle}`}>{buttonContent}</button>
      </div>
      {visible && (
        <button type="button" onClick={scrollToTop} className={`fixed bottom-20 right-4 z-40 hidden shadow-sm sm:inline-flex ${buttonStyle}`}>{buttonContent}</button>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import {
  getWhatsNewPopup,
  type WhatsNewPopup as Popup,
} from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";

const SEEN_KEY = "tftt:whats-new-seen-version";

export function WhatsNewPopup() {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    (async () => {
      try {
        const p = await getWhatsNewPopup();
        if (cancelled) return;
        setPopup(p);
        if (!p.enabled || p.items.length === 0) return;
        let seen: string | null = null;
        try {
          seen = localStorage.getItem(SEEN_KEY);
        } catch {
          /* ignore */
        }
        if (seen === p.version) return;
        timer = window.setTimeout(() => {
          if (cancelled) return;
          setOpen(true);
          trackEvent("whats_new_popup_shown", {
            popup_version: p.version,
            item_count: p.items.length,
          });
        }, 800);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = (method: "close_button" | "got_it" | "escape" | "backdrop" | "link_click" = "close_button") => {
    if (popup) {
      try {
        localStorage.setItem(SEEN_KEY, popup.version);
      } catch {
        /* ignore */
      }
      trackEvent("whats_new_popup_dismissed", {
        popup_version: popup.version,
        method,
      });
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss("escape");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, popup]);

  if (!open || !popup) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={popup.heading}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={dismiss}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md">
        <div className="parchment-frame shadow-2xl">
          <div className="parchment-panel relative px-5 py-6 sm:px-6 sm:py-7">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-full p-1 text-accent hover:bg-accent/10 hover:text-primary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 pr-6">
              <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
              <h2 className="font-serif text-xl sm:text-2xl font-semibold text-primary leading-snug">
                {popup.heading}
              </h2>
            </div>

            <ul className="mt-4 space-y-4">
              {popup.items.map((item, idx) => {
                const showLink = Boolean(item.linkUrl && item.linkLabel);
                const isExternal = item.linkUrl?.startsWith("http");
                return (
                  <li
                    key={idx}
                    className="border-l-2 border-accent/50 pl-3"
                  >
                    <p className="font-serif font-bold text-primary text-base leading-snug">
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    )}
                    {showLink && (
                      <a
                        href={item.linkUrl!}
                        target={isExternal ? "_blank" : undefined}
                        rel={isExternal ? "noopener noreferrer" : undefined}
                        onClick={dismiss}
                        className="mt-2 inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        {item.linkLabel} →
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-md"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

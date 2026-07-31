import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { subscribeEmail } from "@/integrations/supabase/api.functions";
import { trackEvent, trackEventOnce } from "@/lib/analytics";

const DISMISSED_UNTIL_KEY = "tftt:email-popup-dismissed-until";
const SIGNED_UP_KEY = "tftt:email-popup-signed-up:v2";
const DISMISS_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TIME_TRIGGER_MS = 20_000;
const SCROLL_TRIGGER_RATIO = 0.4;

function shouldSkip(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (localStorage.getItem(SIGNED_UP_KEY) === "1") return true;
    const until = parseInt(localStorage.getItem(DISMISSED_UNTIL_KEY) ?? "0", 10) || 0;
    if (until > Date.now()) return true;
  } catch {
    // ignore
  }
  return false;
}

export function EmailCapturePopup() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const engagementMs = (): number | undefined => {
    if (shownAtRef.current == null) return undefined;
    const raw = performance.now() - shownAtRef.current;
    if (!Number.isFinite(raw)) return undefined;
    return Math.min(30 * 60 * 1000, Math.max(0, Math.round(raw)));
  };

  // Trigger: 20s on page OR 40% scroll depth, whichever comes first.
  useEffect(() => {
    if (isAdmin) return;
    if (typeof window === "undefined") return;
    if (shouldSkip()) return;

    let fired = false;
    const show = (trigger: "time" | "scroll") => {
      if (fired || shouldSkip()) return;
      fired = true;
      setOpen(true);
      shownAtRef.current = performance.now();
      trackEvent("email_popup_shown", { trigger });
      cleanup();
    };

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      if (window.scrollY / scrollable >= SCROLL_TRIGGER_RATIO) show("scroll");
    };

    const timer = window.setTimeout(() => show("time"), TIME_TRIGGER_MS);
    window.addEventListener("scroll", onScroll, { passive: true });

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    }
    return cleanup;
  }, [isAdmin]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_DAYS_MS));
    } catch {
      /* ignore */
    }
    trackEvent("email_popup_dismissed", {
      form_name: "timed_popup",
      engagement_ms: engagementMs(),
    });
    setOpen(false);
  }, []);

  // Escape to close + focus the field when opened.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Honeypot: bots fill hidden fields. Silently pretend success and stop.
    if (honeypot.trim() !== "") {
      setOpen(false);
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const r = await subscribeEmail({ data: { email, source: "timed_popup" } });
      if (r.ok) {
        try {
          localStorage.setItem(SIGNED_UP_KEY, "1");
        } catch {
          /* ignore */
        }
        setSuccess(true);
        trackEventOnce(
          "newsletter_signup",
          {
            form_name: "timed_popup",
            already_subscribed: !!r.alreadySubscribed,
            engagement_ms: engagementMs(),
          },
          "tftt:analytics-sent:newsletter_signup:popup",
        );
        setEmail("");
        window.setTimeout(() => setOpen(false), 2600);
      } else {
        trackEvent("email_popup_error", { form_name: "timed_popup", error: r.error ?? "unknown" });
        setMsg(r.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      trackEvent("email_popup_error", { form_name: "timed_popup", error: "exception" });
      setMsg("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || isAdmin) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 backdrop-blur-[2px] sm:items-center"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Weekly Torah email signup"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200 sm:w-[calc(100%-2rem)]"
      >
        <div className="parchment-frame shadow-2xl rounded-b-none sm:rounded-b-[inherit]">
          <div className="parchment-panel relative px-5 py-6 sm:px-7 sm:py-7">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-full p-1.5 text-accent hover:bg-accent/10 hover:text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {success ? (
              <p className="font-serif text-lg font-semibold text-primary pr-6">
                You're on the list — first email this Thursday.
              </p>
            ) : (
              <>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-primary pr-6 leading-snug">
                  Get it before Shabbos
                </h2>
                <div className="mt-3 h-px w-16 bg-accent/60" />
                <p className="mt-3 text-sm text-muted-foreground">
                  One email every Thursday when the new sheets are up. Nothing else, ever.
                </p>
                <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
                  {/* Honeypot — hidden from humans */}
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    className="absolute left-[-9999px] h-0 w-0 opacity-0"
                  />
                  <input
                    ref={inputRef}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email address"
                    className="flex-1 rounded-full border-2 border-accent/60 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-md disabled:opacity-60"
                  >
                    {submitting ? "Joining…" : "Notify Me"}
                  </button>
                </form>
                {msg && <p className="mt-3 text-xs text-accent">{msg}</p>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

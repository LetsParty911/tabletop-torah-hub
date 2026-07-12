import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { subscribeEmail } from "@/integrations/supabase/api.functions";
import { trackEvent, trackEventOnce } from "@/lib/analytics";

const DISMISSED_KEY = "tftt:email-popup-dismissed:v2";
const SIGNED_UP_KEY = "tftt:email-popup-signed-up:v2";
const DELAY_MS = 2000;

function shouldSkip(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(DISMISSED_KEY) === "1") return true;
    if (localStorage.getItem(SIGNED_UP_KEY) === "1") return true;
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
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAdmin) return;
    if (typeof window === "undefined") return;

    let timer: number | null = null;

    const onDownload = () => {
      console.info("[tftt] download-clicked received");
      if (shouldSkip()) {
        console.info("[tftt] popup suppressed (already dismissed/signed up)");
        return;
      }
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        if (!shouldSkip()) {
          setOpen(true);
          trackEventOnce(
            "email_popup_shown",
            { trigger: "download_click" },
            "tftt:analytics-sent:email_popup_shown",
          );
        }
      }, DELAY_MS);
    };

    window.addEventListener("tftt:download-clicked", onDownload);
    return () => {
      window.removeEventListener("tftt:download-clicked", onDownload);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isAdmin]);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    trackEvent("email_popup_dismissed", { form_name: "download_popup" });
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const r = await subscribeEmail({ data: { email } });
      if (r.ok) {
        try {
          localStorage.setItem(SIGNED_UP_KEY, "1");
        } catch {
          /* ignore */
        }
        trackEvent("newsletter_signup", {
          form_name: "download_popup",
          already_subscribed: !!r.alreadySubscribed,
        });
        setMsg(
          r.alreadySubscribed
            ? "You're already subscribed — thank you!"
            : "You're all set — check your inbox.",
        );
        setEmail("");
        window.setTimeout(() => setOpen(false), 1800);
      } else {
        trackEvent("email_popup_error", { form_name: "download_popup", error: r.error ?? "unknown" });
        setMsg(r.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      trackEvent("email_popup_error", { form_name: "download_popup", error: "exception" });
      setMsg("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || isAdmin) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Weekly Torah Notifications signup"
      className="fixed left-1/2 bottom-6 z-[60] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 sm:bottom-8"
    >
      <div className="parchment-frame shadow-2xl">
        <div className="parchment-panel relative px-5 py-5 sm:px-6 sm:py-6">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute right-3 top-3 rounded-full p-1 text-accent hover:bg-accent/10 hover:text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 className="font-serif text-lg sm:text-xl font-semibold text-primary pr-6 leading-snug">
            Enjoying this?
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Get next week's Divrei Torah in your inbox.
          </p>
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              className="flex-1 rounded-full border-2 border-accent/60 bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-md disabled:opacity-60"
            >
              {submitting ? "Joining…" : "Join the List"}
            </button>
          </form>
          {msg && <p className="mt-3 text-xs text-accent">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

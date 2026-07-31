import { useState } from "react";
import { subscribeEmail } from "@/integrations/supabase/api.functions";
import { trackEvent, trackEventOnce } from "@/lib/analytics";

type WeeklyEmailSignupProps = {
  /** Distinguishes the once-per-page analytics key across routes. */
  sourceId?: string;
  className?: string;
};

export function WeeklyEmailSignup({
  sourceId = "page",
  className = "",
}: WeeklyEmailSignupProps) {
  const [email, setEmail] = useState("");
  const [signupMsg, setSignupMsg] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupMsg(null);

    trackEvent("newsletter_signup_submit", {
      form_name: "weekly_torah_notifications",
    });

    try {
      const r = await subscribeEmail({ data: { email } });
      if (r.ok) {
        if (r.welcomeEmailSent) {
          setSignupMsg(
            "You're all set — welcome email sent. You'll get updates when new Divrei Torah are uploaded.",
          );
        } else if (r.alreadySubscribed) {
          setSignupMsg(
            "You're already subscribed — you'll get updates when new Divrei Torah are uploaded.",
          );
        } else {
          setSignupMsg(
            "You're subscribed, but the welcome email could not be sent right now.",
          );
        }
        setEmail("");
        trackEventOnce(
          "newsletter_signup",
          {
            form_name: "weekly_torah_notifications",
            already_subscribed: !!r.alreadySubscribed,
          },
          `tftt:analytics-sent:newsletter_signup:${sourceId}`,
        );
      } else {
        setSignupMsg(r.error ?? "Something went wrong. Please try again.");
      }
    } catch (error) {
      console.error("[newsletter-signup] error", error);
      setSignupMsg("Something went wrong. Please try again.");
    }
  };

  return (
    <section
      id="weekly-email-signup"
      className={`parchment-frame max-w-2xl mx-auto scroll-mt-8 ${className}`}
    >
      <div className="parchment-panel py-6 px-5 sm:px-6 sm:py-8 text-center">
        <div className="flex items-center justify-center gap-3 text-accent mb-3">
          <span aria-hidden className="h-px w-8 sm:w-12 bg-accent/60" />
          <span className="font-sans text-[0.6rem] sm:text-xs uppercase tracking-[0.25em] sm:tracking-[0.3em]">
            Stay Updated
          </span>
          <span aria-hidden className="h-px w-8 sm:w-12 bg-accent/60" />
        </div>
        <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary">
          Don't Miss a Week
        </h2>
        <p className="mt-2 font-serif italic font-medium text-sm sm:text-base text-primary max-w-md mx-auto">
          One weekly email when the new collection is ready.
        </p>
        <form
          onSubmit={handleSignup}
          className="mt-5 flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <input
            type="email"
            aria-label="Email address for weekly Torah reminders"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            className="flex-1 rounded-full border-2 border-accent/50 bg-background px-5 py-3 font-serif text-foreground placeholder:font-serif placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          <button
            type="submit"
            className="rounded-full bg-primary px-8 py-3.5 font-serif font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-md"
          >
            Remind Me Weekly
          </button>
        </form>
        {signupMsg && (
          <p className="mt-4 text-sm text-accent font-serif">{signupMsg}</p>
        )}
      </div>
    </section>
  );
}

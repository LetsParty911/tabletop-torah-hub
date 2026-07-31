import { useState } from "react";
import { subscribeEmail } from "@/integrations/supabase/api.functions";
import { trackEvent, trackEventOnce } from "@/lib/analytics";

type InlineEmailSignupProps = {
  sourceId?: string;
  className?: string;
};

export function InlineEmailSignup({
  sourceId = "inline",
  className = "",
}: InlineEmailSignupProps) {
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
    <div className={`w-full ${className}`}>
      <p className="text-center font-serif italic text-sm sm:text-base text-accent">
        One weekly email when the new collection is ready.
      </p>
      <form
        onSubmit={handleSignup}
        className="mt-2 flex flex-col sm:flex-row gap-2 max-w-xl mx-auto"
      >
        <input
          type="email"
          aria-label="Email address for weekly Torah reminders"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          className="flex-1 rounded-full border-2 border-accent/50 bg-background px-4 py-2.5 font-serif text-foreground placeholder:font-serif placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
        />
        <button
          type="submit"
          className="rounded-full bg-primary px-6 py-2.5 font-serif font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-md whitespace-nowrap"
        >
          Remind Me Weekly
        </button>
      </form>
      {signupMsg && (
        <p className="mt-2 text-center text-sm text-accent font-serif">{signupMsg}</p>
      )}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}

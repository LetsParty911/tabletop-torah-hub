import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { submitContactMessage } from "@/integrations/supabase/api.functions";
import { trackEvent } from "@/lib/analytics";

const CONTACT_EMAIL = "hello@torahforthetable.com";

export const Route = createFileRoute("/contact")({
  head: () => {
    const title = "Contact — Torah for the Table";
    const description =
      "Get in touch with Torah for the Table for questions, suggestions, submissions, or corrections.";
    const url = "https://torahforthetable.com/contact";
    const image =
      "https://torahforthetable.com/og-image.png";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "Torah for the Table" },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ContactPage,
});

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [errors, setErrors] = useState<{ email?: string; message?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    const nextErrors: { email?: string; message?: string } = {};
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    if (!trimmedEmail) nextErrors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      nextErrors.email = "Please enter a valid email.";
    if (!trimmedMessage) nextErrors.message = "Message cannot be empty.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await submitContactMessage({
        data: {
          name: name.trim() || undefined,
          email: trimmedEmail,
          message: trimmedMessage,
        },
      });
      if (res.ok) {
        setStatus({ kind: "ok", text: "Thank you — your message has been sent." });
        setName("");
        setEmail("");
        setMessage("");
        trackEvent("contact_submit", {
          form_name: "contact_form",
        });
      } else {
        setStatus({ kind: "err", text: res.error ?? "Something went wrong." });
      }
    } catch {
      setStatus({ kind: "err", text: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 sm:py-12 max-w-3xl space-y-8">
        <header className="text-center pt-4 sm:pt-6">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-primary">
            Get in Touch
          </h1>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Have a question, correction, suggestion, or a Dvar Torah to share? Send us a message below.
          </p>
        </header>

        <section className="parchment-frame">
          <div className="parchment-panel">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="contact-name"
                  className="block text-sm font-medium text-primary mb-1.5"
                >
                  Name <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border-2 border-accent/40 bg-background/60 px-3 py-2 text-base focus:border-accent focus:outline-none transition-colors"
                  maxLength={120}
                  disabled={submitting}
                />
              </div>

              <div>
                <label
                  htmlFor="contact-email"
                  className="block text-sm font-medium text-primary mb-1.5"
                >
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border-2 border-accent/40 bg-background/60 px-3 py-2 text-base focus:border-accent focus:outline-none transition-colors"
                  maxLength={254}
                  disabled={submitting}
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="contact-message"
                  className="block text-sm font-medium text-primary mb-1.5"
                >
                  Message <span className="text-destructive">*</span>
                </label>
                <textarea
                  id="contact-message"
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-md border-2 border-accent/40 bg-background/60 px-3 py-2 text-base focus:border-accent focus:outline-none transition-colors min-h-[160px] resize-y"
                  maxLength={5000}
                  disabled={submitting}
                  aria-invalid={!!errors.message}
                />
                {errors.message && (
                  <p className="mt-1 text-sm text-destructive">{errors.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
                {submitting ? "Sending…" : "Send Message"}
              </button>

              {status && (
                <p
                  className={`text-sm ${
                    status.kind === "ok" ? "text-primary" : "text-destructive"
                  }`}
                  role="status"
                >
                  {status.text}
                </p>
              )}
            </form>
          </div>
        </section>

        <section className="text-center">
          <p className="text-sm text-muted-foreground">Prefer email? Contact us directly at:</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-2 inline-flex items-center gap-2 font-serif text-lg text-primary hover:text-accent transition-colors"
          >
            <Mail className="h-4 w-4" />
            {CONTACT_EMAIL}
          </a>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}

import { useState } from "react";
import { Share2, Link2, Check } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

type Props = {
  pdfId: string;
  title: string;
  parsha?: string | null;
  /** "card" = small subordinate text actions, "inline" = beside a primary button */
  variant?: "card" | "inline";
  className?: string;
};

function buildViewUrl(pdfId: string) {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://torahforthetable.com";
  return `${origin}/view/${pdfId}`;
}

export function SharePublicationButton({
  pdfId,
  title,
  parsha,
  variant = "card",
  className = "",
}: Props) {
  const [copied, setCopied] = useState(false);

  const parshaLabel = parsha
    ? parsha.startsWith("Parshas")
      ? parsha
      : `Parshas ${parsha}`
    : "";

  const viewUrl = buildViewUrl(pdfId);

  const handleShare = () => {
    const message = `${title}${parshaLabel ? ` — ${parshaLabel}` : ""}, free to download and print: ${viewUrl}`;
    trackEvent("share_whatsapp", {
      file_id: pdfId,
      file_title: title,
      parsha: parsha ?? undefined,
    });
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewUrl);
      setCopied(true);
      trackEvent("copy_link", {
        file_id: pdfId,
        file_title: title,
        parsha: parsha ?? undefined,
      });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing if clipboard is unavailable.
    }
  };

  if (variant === "inline") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-accent/60 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-accent/10 transition-colors"
          aria-label={`Share ${title} on WhatsApp`}
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-accent/60 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-accent/10 transition-colors"
          aria-label={`Copy link to ${title}`}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Copy link
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
        aria-label={`Share ${title} on WhatsApp`}
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>
      <span className="text-accent/40" aria-hidden>
        |
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
        aria-label={`Copy link to ${title}`}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Copied
          </>
        ) : (
          <>
            <Link2 className="h-3.5 w-3.5" />
            Copy link
          </>
        )}
      </button>
    </div>
  );
}

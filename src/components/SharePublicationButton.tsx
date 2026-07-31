import { Share2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

type Props = {
  pdfId: string;
  title: string;
  parsha?: string | null;
  /** "card" = small subordinate text action, "inline" = beside a primary button */
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
  const handleShare = () => {
    const parshaLabel = parsha
      ? parsha.startsWith("Parshas")
        ? parsha
        : `Parshas ${parsha}`
      : "";
    const message = `${title}${parshaLabel ? ` — ${parshaLabel}` : ""}, free to download and print: ${buildViewUrl(pdfId)}`;
    trackEvent("share_whatsapp", { file_id: pdfId, file_title: title, parsha: parsha ?? undefined });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const base =
    variant === "inline"
      ? "inline-flex items-center justify-center gap-2 rounded-md border border-accent/60 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-accent/10 transition-colors"
      : "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors";

  return (
    <button type="button" onClick={handleShare} className={`${base} ${className}`} aria-label={`Share ${title} on WhatsApp`}>
      <Share2 className={variant === "inline" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      Share
    </button>
  );
}

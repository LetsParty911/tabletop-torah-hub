import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";

type DownloadToPrintButtonProps = {
  href: string;
  onClick?: () => void;
  className?: string;
  publicationId?: string;
  publicationTitle?: string;
  /** Preferred download filename; falls back to the server Content-Disposition. */
  filename?: string;
};

export function DownloadToPrintButton({
  href,
  onClick,
  className = "",
  publicationId,
  publicationTitle,
  filename: preferredFilename,
}: DownloadToPrintButtonProps) {
  const [starting, setStarting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Warm the origin lookup before the click so the download starts sooner.
  const warm = useCallback(() => {
    if (warmedRef.current || typeof document === "undefined") return;
    warmedRef.current = true;
    try {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "fetch";
      link.href = href;
      document.head.appendChild(link);
    } catch {
      // best effort only
    }
  }, [href]);

  const handleClick = useCallback(() => {
    onClick?.();

    setStarting(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStarting(false), 1200);

    // Fire-and-forget anonymous download tracking. Never blocks the download.
    const onAdminRoute =
      typeof window !== "undefined" &&
      (window.location.pathname === "/admin" ||
        window.location.pathname.startsWith("/admin/"));
    if (!onAdminRoute && (publicationId || publicationTitle)) {
      try {
        const payload = JSON.stringify({
          publication_id: publicationId,
          publication_title: publicationTitle,
        });
        const blob = new Blob([payload], { type: "application/json" });
        const sent =
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function" &&
          navigator.sendBeacon("/api/track-download", blob);
        if (!sent) {
          void fetch("/api/track-download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // never block the download
      }
    }
    // Signal that a download started, so the email popup can appear afterwards.
    if (!onAdminRoute && typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("tftt:download"));
      } catch {
        /* ignore */
      }
    }

    // No preventDefault: the browser handles the navigation/download natively,
    // which starts immediately.
  }, [onClick, publicationId, publicationTitle]);

  return (
    <a
      href={href}
      rel="nofollow"
      aria-label={
        publicationTitle ? `Download ${publicationTitle} to print` : "Download to print"
      }
      download={preferredFilename ?? ""}
      onClick={handleClick}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      aria-live="polite"
      className={[
        "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium",
        "transition-[transform,background-color,color] duration-100 select-none touch-manipulation",
        "bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground",
        "active:scale-[0.96] active:bg-accent active:text-accent-foreground",
        starting ? "scale-[0.98] bg-accent text-accent-foreground" : "",
        className,
      ].join(" ")}
    >
      {starting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {starting ? "Starting download…" : "Download to Print"}
    </a>
  );
}

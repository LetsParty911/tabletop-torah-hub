import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Download, Loader2 } from "lucide-react";

type DownloadToPrintButtonProps = {
  href: string;
  onClick?: () => void;
  className?: string;
  publicationId?: string;
  /** Short publication name shown on the button (e.g. "Toras Avigdor"). */
  publicationName?: string;
  /** Fallback title used for tracking and accessibility when name is omitted. */
  publicationTitle?: string;
  /** Preferred download filename; falls back to the server Content-Disposition. */
  filename?: string;
};

export function DownloadToPrintButton({
  href,
  onClick,
  className = "",
  publicationId,
  publicationName,
  publicationTitle,
  filename: preferredFilename,
}: DownloadToPrintButtonProps) {
  const displayName = publicationName ?? publicationTitle;
  const buttonLabel = displayName ? `Download ${displayName}` : "Download";

  const [starting, setStarting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warmedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    timerRef.current = null;
    pollRef.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // iOS Safari mishandles blob downloads (wrong/duplicate filenames), so there
  // we keep the native anchor navigation and can only approximate completion.
  const isIOS =
    typeof navigator !== "undefined" &&
    (/iP(hone|ad|od)/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document));

  const endLoadingSoon = useCallback(() => {
    clearTimers();
    const stop = () => {
      clearTimers();
      setStarting(false);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
    window.addEventListener("blur", stop, { once: true });
    document.addEventListener("visibilitychange", stop, { once: true });
    timerRef.current = setTimeout(stop, 2500);
  }, [clearTimers]);



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

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (starting) {
      e.preventDefault();
      return;
    }
    onClick?.();

    // Paint the loading state before the browser starts the navigation.
    flushSync(() => setStarting(true));
    endLoadingSoon();

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
    // No preventDefault: the browser handles the navigation/download natively,
    // which starts immediately.
  }, [onClick, publicationId, publicationTitle, starting, endLoadingSoon]);

  return (
    <a
      href={href}
      rel="nofollow"
      aria-label={displayName ? `Download ${displayName}` : "Download"}
      download={preferredFilename ?? ""}
      onClick={handleClick}
      onMouseEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      aria-live="polite"
      aria-busy={starting}
      aria-disabled={starting}
      className={[
        "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium",
        "transition-[transform,background-color,color,opacity] duration-100 select-none touch-manipulation",
        "bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground",
        "active:scale-[0.96] active:bg-accent active:text-accent-foreground",
        starting
          ? "scale-[0.98] bg-accent text-accent-foreground opacity-90 cursor-wait pointer-events-none"
          : "",
        className,
      ].join(" ")}
    >
      {starting ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      ) : (
        <Download className="h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0 truncate">
        {starting
          ? displayName
            ? `Preparing ${displayName}…`
            : "Preparing…"
          : buttonLabel}
      </span>

    </a>
  );
}


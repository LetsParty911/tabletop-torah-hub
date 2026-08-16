import { useCallback, useRef, useState } from "react";
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
  const [saved, setSaved] = useState(false);
  const warmedRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);




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

  const trackDownload = useCallback(() => {
    const onAdminRoute =
      typeof window !== "undefined" &&
      (window.location.pathname === "/admin" ||
        window.location.pathname.startsWith("/admin/"));
    if (onAdminRoute || (!publicationId && !publicationTitle)) return;
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
  }, [publicationId, publicationTitle]);

  const filenameFromHeader = (value: string | null): string | undefined => {
    if (!value) return undefined;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(value);
    if (star) {
      try {
        return decodeURIComponent(star[1]);
      } catch {
        /* fall through */
      }
    }
    const plain = /filename="([^"]+)"/i.exec(value);
    return plain?.[1];
  };

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (starting) {
        e.preventDefault();
        return;
      }
      onClick?.();
      trackDownload();
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setSaved(false);

      // The fetch/blob path is required on every supported browser, including
      // iOS, because response.blob() resolves only after the final byte arrives.
      const canBlob =
        typeof window !== "undefined" &&
        typeof window.URL?.createObjectURL === "function" &&
        typeof fetch === "function";
      if (!canBlob) {
        flushSync(() => setStarting(true));
        return;
      }

      // Fetch the (edge-cacheable) URL ourselves so the loading state lasts
      // for the entire transfer, then hand a blob to the download manager.
      e.preventDefault();
      flushSync(() => setStarting(true));
      const t0 = Date.now();

      void (async () => {
        let ok = false;
        try {
          const res = await fetch(href, { credentials: "same-origin" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const name =
            preferredFilename ??
            filenameFromHeader(res.headers.get("content-disposition")) ??
            "download.pdf";
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          ok = true;
          setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        } catch {
          // Fall back to letting the browser do it natively.
          window.location.href = href;
        } finally {
          // Repeat downloads are served from cache and finish in a few dozen
          // ms; hold the busy state briefly so the click is always visible.
          const elapsed = Date.now() - t0;
          const hold = Math.max(0, 450 - elapsed);
          setTimeout(() => {
            setStarting(false);
            if (ok) {
              setSaved(true);
              savedTimerRef.current = setTimeout(() => setSaved(false), 2200);
            }
          }, hold);
        }
      })();
    },

    [
      onClick,
      starting,
      href,
      preferredFilename,
      trackDownload,
    ],
  );


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
      ) : saved ? (
        <Check className="h-4 w-4 shrink-0" />
      ) : (
        <Download className="h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0 truncate">
        {starting
          ? displayName
            ? `Preparing ${displayName}…`
            : "Preparing…"
          : saved
            ? "Saved to your device"
            : buttonLabel}
      </span>


    </a>
  );
}


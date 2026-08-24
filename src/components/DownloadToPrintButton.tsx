import { getAttribution, getSessionId } from "@/lib/site-analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, Download, Loader2 } from "lucide-react";

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

  type DownloadPhase = "idle" | "starting" | "error";
  const [phase, setPhase] = useState<DownloadPhase>("idle");
  const busy = phase === "starting";
  const warmedRef = useRef(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    },
    [],
  );



  // Warm the origin lookup before the click so the download starts sooner.
  //
  // This must NEVER run on touch devices: `rel=prefetch` pulls the entire PDF,
  // and on a phone `touchstart` fires ~100ms before the tap completes, so the
  // prefetch and the real download transfer the same megabyte side by side and
  // split the cellular bandwidth in half. On desktop, hover precedes the click
  // by seconds on a connection where the extra copy is free.
  const warm = useCallback(() => {
    if (warmedRef.current || typeof document === "undefined") return;
    const coarsePointer =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (coarsePointer) return;
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
      const attribution = getAttribution();
      const payload = JSON.stringify({
        publication_id: publicationId,
        publication_title: publicationTitle,
        source_path: window.location.pathname,
        session_id: getSessionId(),
        ...(attribution ?? {}),
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


  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (busy) {
        e.preventDefault();
        return;
      }
      onClick?.();
      trackDownload();
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);

      // Let the browser stream the file straight to disk (single pass).
      // Buffering it through fetch()+Blob first made the file land later,
      // because the bytes were written twice: once to memory, once to disk.
      //
      // A plain <a download> link gives JS no real "it's done" signal, so
      // this button deliberately never claims a verified completion (e.g.
      // "Downloaded") - a fixed timer saying that would eventually be wrong
      // for some file size or connection speed (confirmed: a 1.85MB file
      // was still transferring for ~9s after the old timer had already
      // declared it done). "Starting download..." is the one thing we can
      // actually confirm - we did tell the browser to begin - so that's all
      // this shows, fading back to idle without asserting anything further.
      flushSync(() => setPhase("starting"));
      statusTimerRef.current = setTimeout(() => setPhase("idle"), 1200);
    },

    [onClick, busy, trackDownload],
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
      
      aria-live="polite"
      aria-busy={busy}
      aria-disabled={busy}
      className={[
        "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium",
        "transition-[transform,background-color,color,opacity] duration-100 select-none touch-manipulation",
        "bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground",
        "active:scale-[0.96] active:bg-accent active:text-accent-foreground",
        busy
          ? "scale-[0.98] bg-accent text-accent-foreground opacity-90 cursor-wait pointer-events-none"
          : "",
        className,
      ].join(" ")}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      ) : phase === "error" ? (
        <AlertCircle className="h-4 w-4 shrink-0" />
      ) : (
        <Download className="h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0 truncate">
        {phase === "starting"
          ? "Starting download…"
          : phase === "error"
            ? "Download failed — try again"
            : buttonLabel}
      </span>


    </a>
  );
}


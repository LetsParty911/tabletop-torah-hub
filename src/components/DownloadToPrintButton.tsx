import { getAttribution, getSessionId } from "@/lib/site-analytics";
import { getSessionId as getFpSessionId, getVisitorId, newActionId, trackFp } from "@/lib/first-party-analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AlertCircle, Download, Loader2 } from "lucide-react";

type DownloadTrackingContext = {
  publicationId?: string;
  publicationName?: string;
  publicationTitle?: string;
  parsha?: string | null;
  jewishYear?: number | null;
  publisher?: string | null;
  publicationSeries?: string | null;
  /** Correlates this action with the server's `download_served` event. */
  actionId?: string | null;
};

export function trackDownloadAction({
  publicationId,
  publicationName,
  publicationTitle,
  parsha,
  jewishYear,
  publisher,
  publicationSeries,
  actionId,
}: DownloadTrackingContext) {
  if (typeof window === "undefined") return;

  const path = window.location.pathname;
  const onAdminRoute =
    path === "/admin" || path.startsWith("/admin/") || path.startsWith("/admin-analytics");
  if (onAdminRoute || (!publicationId && !publicationTitle)) return;

  try {
    const attribution = getAttribution();
    const payload = JSON.stringify({
      publication_id: publicationId,
      publication_title: publicationTitle,
      source_path: path,
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
    // Analytics must never block the download action.
  }

  // Canonical event semantics: this records a user-initiated download action/request.
  // Browsers do not expose a reliable signal that a plain file download completed.
  trackFp("download", {
    publication_id: publicationId ?? null,
    publication_title: publicationTitle ?? null,
    publication_series: publicationSeries ?? publicationName ?? null,
    publisher: publisher ?? null,
    parsha: parsha ?? null,
    jewish_year: jewishYear ?? null,
    metadata: actionId ? { action_id: actionId } : {},
  });
}

/**
 * Adds the correlation ids to a download link. The server validates every
 * value; nothing here is trusted as-is.
 */
export function downloadHrefWithAction(href: string, actionId: string): string {
  try {
    const url = new URL(href, window.location.origin);
    // Only the /view/:id/download route records `download_served`. Direct
    // static/CDN files (e.g. the Sukkos decorations) gain nothing from the ids,
    // and a unique query per click defeats the browser cache, so the hover
    // prefetch was never reused and the file transferred twice.
    if (!url.pathname.startsWith("/view/")) return href;
    url.searchParams.set("a", actionId);
    const session = getFpSessionId();
    const visitor = getVisitorId();
    if (session) url.searchParams.set("s", session);
    if (visitor) url.searchParams.set("v", visitor);
    return url.pathname + url.search + url.hash;
  } catch {
    return href;
  }
}

type DownloadToPrintButtonProps = {
  href: string;
  onClick?: () => void;
  className?: string;
  publicationId?: string;
  /** Short publication name shown on the button (e.g. "Toras Avigdor"). */
  publicationName?: string;
  /** Fallback title used for tracking and accessibility when name is omitted. */
  publicationTitle?: string;
  /** Optional visible label when the call to action needs format-specific copy. */
  label?: string;
  /** Preferred download filename; falls back to the server Content-Disposition. */
  filename?: string;
  /** Canonical-event context (Phase 1 analytics). */
  parsha?: string | null;
  jewishYear?: number | null;
  publisher?: string | null;
  publicationSeries?: string | null;
};

export function DownloadToPrintButton({
  href,
  onClick,
  className = "",
  publicationId,
  publicationName,
  publicationTitle,
  label,
  filename: preferredFilename,
  parsha,
  jewishYear,
  publisher,
  publicationSeries,
}: DownloadToPrintButtonProps) {
  const displayName = publicationName ?? publicationTitle;
  const buttonLabel = label ?? (displayName ? `Download ${displayName}` : "Download");

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

  const trackDownload = useCallback((actionId: string) => {
    trackDownloadAction({
      actionId,
      publicationId,
      publicationName,
      publicationTitle,
      parsha,
      jewishYear,
      publisher,
      publicationSeries,
    });
  }, [
    publicationId,
    publicationName,
    publicationTitle,
    parsha,
    jewishYear,
    publisher,
    publicationSeries,
  ]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (busy) {
        e.preventDefault();
        return;
      }
      onClick?.();
      const actionId = newActionId();
      trackDownload(actionId);
      // Tag the outgoing request so the server can record that it successfully
      // served the file request (not that the download completed).
      try {
        e.currentTarget.href = downloadHrefWithAction(href, actionId);
      } catch {
        /* keep the plain link */
      }
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
    [onClick, busy, trackDownload, href],
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

import { useState, useCallback, useRef, useEffect } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const [phase, setPhase] = useState<"preparing" | "downloading" | "waiting" | "done">(
    "preparing",
  );
  const [waitSeconds, setWaitSeconds] = useState(10);
  const abortRef = useRef<AbortController | null>(null);
  const fakeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (fakeTimerRef.current) window.clearInterval(fakeTimerRef.current);
    };
  }, []);

  const startFakeProgress = useCallback(() => {
    // Crawl toward 90% while we wait for headers/server work (~30s).
    // Approaches 90 asymptotically so it always feels like it's moving.
    if (fakeTimerRef.current) window.clearInterval(fakeTimerRef.current);
    fakeTimerRef.current = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const step = Math.max(0.4, (90 - p) * 0.03);
        return Math.min(90, p + step);
      });
    }, 300);
  }, []);

  const stopFakeProgress = useCallback(() => {
    if (fakeTimerRef.current) {
      window.clearInterval(fakeTimerRef.current);
      fakeTimerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (loading) return;
      setLoading(true);
      setProgress(0);
      setPhase("preparing");
      onClick?.();

      // Fire-and-forget anonymous download tracking. Must never block/delay the
      // download. Admin routes are never measured or recorded.
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

      const controller = new AbortController();
      abortRef.current = controller;
      startFakeProgress();


      try {
        const res = await fetch(href, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const disposition = res.headers.get("Content-Disposition") || "";
        const match = /filename="?([^"]+)"?/i.exec(disposition);
        const filename = preferredFilename || match?.[1] || "document.pdf";

        const totalHeader = res.headers.get("Content-Length");
        const total = totalHeader ? parseInt(totalHeader, 10) : 0;

        let blob: Blob;

        stopFakeProgress();
        setPhase("downloading");
        toast.success("Your download is ready");
        setProgress(0);

        if (res.body && total > 0) {
          // Real byte-level progress

          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              setProgress(Math.min(99, (received / total) * 100));
            }
          }
          blob = new Blob(chunks as BlobPart[], { type: res.headers.get("Content-Type") || "application/pdf" });
        } else {
          // No length header — fall back to blob() and finish the fake bar
          blob = await res.blob();
        }

        setProgress(100);

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        // Hold a "waiting" state so the user doesn't think nothing happened
        // while the browser materializes the file in the downloads tray.
        setPhase("waiting");
        const WAIT_TOTAL = 5;
        setWaitSeconds(WAIT_TOTAL);
        await new Promise<void>((resolve) => {
          let remaining = WAIT_TOTAL;
          const tick = window.setInterval(() => {
            remaining -= 1;
            setWaitSeconds(remaining);
            if (remaining <= 0) {
              window.clearInterval(tick);
              resolve();
            }
          }, 1000);
        });
        setPhase("done");
        toast.success("Downloaded — check your Downloads folder or browser tray.");
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Fetch/CORS failed — trigger the browser's native download instead.
          // Use a hidden iframe so the current page isn't navigated away, and
          // hold the waiting state so the user knows something is still happening.
          const iframe = document.createElement("iframe");
          iframe.style.display = "none";
          iframe.src = href;
          document.body.appendChild(iframe);
          setTimeout(() => iframe.remove(), 60_000);

          stopFakeProgress();
          setProgress(100);
          setPhase("waiting");
          const WAIT_TOTAL = 8;
          setWaitSeconds(WAIT_TOTAL);
          await new Promise<void>((resolve) => {
            let remaining = WAIT_TOTAL;
            const tick = window.setInterval(() => {
              remaining -= 1;
              setWaitSeconds(remaining);
              if (remaining <= 0) {
                window.clearInterval(tick);
                resolve();
              }
            }, 1000);
          });
          setPhase("done");
          toast.success("Downloaded — check your Downloads folder or browser tray.");
        }
      } finally {
        stopFakeProgress();
        // brief pause so users see the final state before it resets
        window.setTimeout(() => {
          setLoading(false);
          setProgress(0);
          setPhase("preparing");
        }, 1200);
      }
    },
    [href, loading, onClick, preferredFilename, startFakeProgress, stopFakeProgress],
  );

  const label = loading
    ? phase === "downloading"
      ? `Downloading… ${Math.floor(progress)}%`
      : phase === "waiting"
        ? `Please wait ${waitSeconds}s for file to appear…`
        : phase === "done"
          ? "File ready — check your downloads"
          : `Preparing file… ${Math.floor(progress)}%`
    : "Download to Print";

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-disabled={loading}
      aria-busy={loading}
      tabIndex={loading ? -1 : 0}
      className={[
        "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
        loading
          ? "bg-accent/20 text-accent-foreground pointer-events-none cursor-wait"
          : "bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      ].join(" ")}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="relative inline-flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {label}
      </span>
    </a>
  );
}

import { useState, useCallback, useRef, useEffect } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

type DownloadToPrintButtonProps = {
  href: string;
  onClick?: () => void;
  className?: string;
};

export function DownloadToPrintButton({
  href,
  onClick,
  className = "",
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

      const controller = new AbortController();
      abortRef.current = controller;
      startFakeProgress();

      try {
        const res = await fetch(href, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const disposition = res.headers.get("Content-Disposition") || "";
        const match = /filename="?([^"]+)"?/i.exec(disposition);
        const filename = match?.[1] || "document.pdf";

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
        const WAIT_TOTAL = 10;
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
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          window.location.href = href;
        }
      } finally {
        stopFakeProgress();
        // brief pause so users see the final state before it resets
        window.setTimeout(() => {
          setLoading(false);
          setProgress(0);
          setPhase("preparing");
        }, 600);
      }
    },
    [href, loading, onClick, startFakeProgress, stopFakeProgress],
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

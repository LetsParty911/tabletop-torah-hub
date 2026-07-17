import { useState, useCallback, useRef, useEffect } from "react";
import { Download, Loader2 } from "lucide-react";

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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (loading) return;
      setLoading(true);
      onClick?.();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(href, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();

        // Extract filename from Content-Disposition if present
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = /filename="?([^"]+)"?/i.exec(disposition);
        const filename = match?.[1] || "document.pdf";

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Fallback: navigate directly so the user still gets the file
          window.location.href = href;
        }
      } finally {
        setLoading(false);
      }
    },
    [href, loading, onClick],
  );

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-disabled={loading}
      tabIndex={loading ? -1 : 0}
      className={[
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
        loading
          ? "bg-accent text-accent-foreground pointer-events-none opacity-90 cursor-wait"
          : "bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      ].join(" ")}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Getting file — please wait a moment…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" /> Download to Print
        </>
      )}
    </a>
  );
}

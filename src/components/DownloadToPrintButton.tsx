import { useCallback } from "react";
import { Download } from "lucide-react";

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
  const handleClick = useCallback(() => {
    onClick?.();

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
  }, [onClick, publicationId, publicationTitle]);

  return (
    <a
      href={href}
      rel="nofollow"
      download={preferredFilename ?? ""}
      onClick={handleClick}
      className={[
        "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
        "bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      ].join(" ")}
    >
      <Download className="h-4 w-4" />
      Download to Print
    </a>
  );
}

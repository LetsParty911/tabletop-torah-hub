import { useState, useCallback } from "react";
import { Download, Check } from "lucide-react";

type DownloadToPrintButtonProps = {
  href: string;
  onClick?: () => void;
  className?: string;
};

const DONE_MS = 2500;

export function DownloadToPrintButton({
  href,
  onClick,
  className = "",
}: DownloadToPrintButtonProps) {
  const [done, setDone] = useState(false);

  const handleClick = useCallback(() => {
    setDone(true);
    onClick?.();
    window.setTimeout(() => setDone(false), DONE_MS);
  }, [onClick]);

  return (
    <a
      href={href}
      onClick={handleClick}
      className={[
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
        done
          ? "bg-accent text-accent-foreground"
          : "bg-primary text-primary-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      ].join(" ")}
    >
      {done ? (
        <>
          <Check className="h-4 w-4" /> Done
        </>
      ) : (
        <>
          <Download className="h-4 w-4" /> Download to Print
        </>
      )}
    </a>
  );
}

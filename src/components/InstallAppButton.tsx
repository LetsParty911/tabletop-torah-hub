import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setHidden(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Hide if already running as installed app
    if (window.matchMedia?.("(display-mode: standalone)").matches) setHidden(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || !deferred) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice.outcome === "accepted") setHidden(true);
          setDeferred(null);
        } catch {
          /* ignore */
        }
      }}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--accent)]/40 bg-transparent px-3 py-1.5 text-xs font-medium text-[color:var(--accent)] transition-colors hover:bg-[color:var(--accent)]/10"
      }
      aria-label="Install Torah for the Table app"
    >
      <Download className="h-3.5 w-3.5" />
      Install app
    </button>
  );
}

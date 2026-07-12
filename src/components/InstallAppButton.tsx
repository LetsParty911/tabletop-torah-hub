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
        "inline-flex items-center gap-1.5 rounded-full border-2 border-[#D4AF37] bg-[#1A365D] px-4 py-2 text-sm font-semibold text-[#FAF6EC] shadow-lg shadow-black/30 ring-1 ring-black/10 transition-transform hover:scale-[1.03] hover:bg-[#22406F] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
      }
      aria-label="Install Torah for the Table app"
    >
      <Download className="h-4 w-4 text-[#D4AF37]" />
      Install app
    </button>
  );
}

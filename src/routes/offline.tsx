import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [
      { title: "Offline — Torah for the Table" },
      { name: "description", content: "You appear to be offline." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OfflinePage,
});

function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="max-w-md text-center parchment-panel">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--accent)]">
          Torah for the Table
        </p>
        <div className="gold-divider mt-4"><span className="gold-divider-dot" /></div>
        <h1 className="mt-4 font-serif text-3xl text-foreground">You're offline</h1>
        <p className="mt-3 text-muted-foreground">
          It looks like your connection dropped. Once you're back online, the weekly collection
          will be waiting.
        </p>
        <button
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-[color:var(--primary)] px-5 py-2.5 text-sm font-medium text-[color:var(--primary-foreground)] transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
      <div className="w-full mt-auto">
        <SiteFooter />
      </div>
    </div>
  );
}

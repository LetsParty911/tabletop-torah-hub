import { Megaphone } from "lucide-react";
import type { AnnouncementBanner as Banner } from "@/integrations/supabase/api.functions";
import { resolveAnnouncementDisplay } from "@/lib/announcement-display";

export function AnnouncementBanner({ initialBanner }: { initialBanner: Banner }) {
  // The admin-saved setting is authoritative; hidden when off or empty.
  const d = resolveAnnouncementDisplay(initialBanner);
  if (!d) return null;

  return (
    <div className="bg-primary text-primary-foreground border-y-2 border-accent shadow-md">
      <div className="mx-auto max-w-5xl px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-x-4 gap-y-2 text-center">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 shrink-0" style={{ color: "#E8C468" }} aria-hidden="true" />
          <p className="font-semibold text-sm sm:text-base tracking-wide text-primary-foreground">
            {d.text}
          </p>
        </div>
        {d.linkUrl && d.linkLabel && (
          <a
            href={d.linkUrl}
            target={d.isExternal ? "_blank" : undefined}
            rel={d.isExternal ? "noopener noreferrer" : undefined}
            className="inline-flex items-center rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold text-primary hover:opacity-90 transition-colors whitespace-nowrap shadow-sm"
            style={{ backgroundColor: "#E8C468" }}
          >
            {d.linkLabel} →
          </a>
        )}
      </div>
    </div>
  );
}

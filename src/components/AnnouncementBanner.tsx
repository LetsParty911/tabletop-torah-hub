import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import {
  getAnnouncementBanner,
  type AnnouncementBanner as Banner,
} from "@/integrations/supabase/api.functions";

export function AnnouncementBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await getAnnouncementBanner();
        if (!cancelled) setBanner(b);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!banner || !banner.enabled || !banner.text || !banner.text.trim()) {
    return null;
  }

  const showLink = Boolean(banner.linkUrl && banner.linkLabel);
  const isExternal = banner.linkUrl?.startsWith("http");

  return (
    <div className="bg-primary text-primary-foreground border-y-2 border-accent shadow-md">
      <div className="mx-auto max-w-5xl px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-x-4 gap-y-1 text-center">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <p className="font-semibold text-sm sm:text-base tracking-wide">
            {banner.text}
          </p>
        </div>
        {showLink && (
          <a
            href={banner.linkUrl!}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="inline-flex items-center rounded-full bg-accent px-4 py-1.5 text-xs sm:text-sm font-bold text-accent-foreground hover:bg-accent/90 transition-colors whitespace-nowrap shadow-sm"
          >
            {banner.linkLabel} →
          </a>
        )}
      </div>
    </div>
  );
}

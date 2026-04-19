import { useEffect, useState } from "react";
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
    <div className="border-b border-accent/30 bg-accent/10">
      <div className="mx-auto max-w-5xl px-4 py-2.5 flex flex-col sm:flex-row items-center justify-center gap-x-4 gap-y-1 text-center">
        <p className="font-serif italic text-sm sm:text-base text-primary">
          {banner.text}
        </p>
        {showLink && (
          <a
            href={banner.linkUrl!}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="text-xs sm:text-sm font-medium text-accent hover:text-primary underline underline-offset-2 transition-colors whitespace-nowrap"
          >
            {banner.linkLabel} →
          </a>
        )}
      </div>
    </div>
  );
}

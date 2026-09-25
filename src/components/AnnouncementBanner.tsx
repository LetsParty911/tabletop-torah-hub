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

  // The admin-saved text is authoritative.
  const displayText = banner.text.trim();
  const hasConfiguredLink = Boolean(banner.linkUrl && banner.linkLabel);
  const emailReminderBanner = /email|reminder|subscribe/i.test(displayText);
  const linkUrl = hasConfiguredLink ? banner.linkUrl! : emailReminderBanner ? "#weekly-email-signup" : null;
  const linkLabel = hasConfiguredLink ? banner.linkLabel! : emailReminderBanner ? "Subscribe" : null;
  const showLink = Boolean(linkUrl && linkLabel);
  const isExternal = linkUrl?.startsWith("http");

  return (
    <div className="bg-primary text-primary-foreground border-y-2 border-accent shadow-md">
      <div className="mx-auto max-w-5xl px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-x-4 gap-y-2 text-center">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 shrink-0" style={{ color: "#E8C468" }} aria-hidden="true" />
          <p className="font-semibold text-sm sm:text-base tracking-wide text-primary-foreground">
            {displayText}
          </p>
        </div>
        {showLink && (
          <a
            href={linkUrl!}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="inline-flex items-center rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold text-primary hover:opacity-90 transition-colors whitespace-nowrap shadow-sm"
            style={{ backgroundColor: "#E8C468" }}
          >
            {linkLabel} →
          </a>
        )}
      </div>
    </div>
  );
}

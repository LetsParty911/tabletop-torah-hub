import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  getWhatsNewBanner,
  type WhatsNewBanner as Banner,
} from "@/integrations/supabase/api.functions";

export function WhatsNewBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await getWhatsNewBanner();
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
    <div className="flex justify-center px-4 pt-3">
      <div
        className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 shadow-sm border border-primary/20 max-w-full"
        style={{ backgroundColor: "#F5E6A8" }}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-xs sm:text-sm font-semibold text-primary tracking-wide">
          <span className="uppercase text-[0.65rem] sm:text-xs mr-2 opacity-80">What&rsquo;s New</span>
          <span className="font-medium">{banner.text}</span>
        </span>
        {showLink && (
          <a
            href={banner.linkUrl!}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="ml-1 inline-flex items-center rounded-full bg-primary px-3 py-0.5 text-[0.7rem] sm:text-xs font-bold text-primary-foreground hover:opacity-90 whitespace-nowrap"
          >
            {banner.linkLabel} →
          </a>
        )}
      </div>
    </div>
  );
}

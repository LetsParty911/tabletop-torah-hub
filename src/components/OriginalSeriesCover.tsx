import { useState } from "react";
import type { OriginalPromotionSeries } from "@/lib/originals-promotion";

/**
 * Permanent series branding, never a weekly issue preview.
 * All repository-owned assets are exact 320 x 400 WebP images.
 * Actual PDF cards and archives continue to use their own first-page previews.
 */
export function OriginalSeriesCover({ series, eager = false }: { series: OriginalPromotionSeries; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border border-[#ba9b54]/70 shadow-sm" style={{ backgroundColor: series.accentColor }}>
      {!failed ? (
        <img src={series.coverSrc} alt={`Promotional cover of ${series.title}`} width={320} height={400}
          loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)}
          className="h-full w-full object-contain" />
      ) : (
        <div role="img" aria-label={`Series artwork for ${series.title}`} className="flex h-full w-full items-center justify-center px-2 text-center font-serif text-sm font-bold text-[#fff8e9]">
          {series.title}
        </div>
      )}
    </div>
  );
}

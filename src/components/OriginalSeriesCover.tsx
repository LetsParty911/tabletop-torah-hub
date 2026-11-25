import { useState } from "react";
import { SmallPdfImage } from "@/components/SmallPdfImage";
import type { OriginalPromotionSeries } from "@/lib/originals-promotion";

const COVER_STYLES: Record<string, { background: string; accent: string; ink: string }> = {
  qa: { background: "#f8efdc", accent: "#1a365d", ink: "#11243c" },
  stories: { background: "#f5e7ca", accent: "#8a5638", ink: "#563523" },
  margins: { background: "#eee7d6", accent: "#566751", ink: "#364539" },
  ramban: { background: "#e9e2d2", accent: "#79613e", ink: "#493b2b" },
  chizkuni: { background: "#f0e8d4", accent: "#654a78", ink: "#493858" },
  medrash: { background: "#f6e3c4", accent: "#a06132", ink: "#69401f" },
  questions: { background: "#e2eaf0", accent: "#325c7c", ink: "#203d55" },
};

export function OriginalSeriesCover({
  series, src, smallSrc, editionLabel, mini = false, published = false,
}: {
  series: OriginalPromotionSeries;
  src?: string | null;
  smallSrc?: string | null;
  editionLabel?: string | null;
  mini?: boolean;
  published?: boolean;
}) {
  // Remount the image state when a new weekly thumbnail arrives.
  return <CoverImage key={src ?? series.key} {...{ series, src, smallSrc, editionLabel, mini, published }} />;
}

function CoverImage({
  series, src, smallSrc, editionLabel, mini, published,
}: {
  series: OriginalPromotionSeries;
  src?: string | null;
  smallSrc?: string | null;
  editionLabel?: string | null;
  mini: boolean;
  published: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const palette = COVER_STYLES[series.key] ?? COVER_STYLES.qa;
  const fallbackLabel = published ? "Series identity" : "Coming Soon";
  return (
    <div className="relative aspect-[17/22] w-full overflow-hidden rounded-sm border border-[#c9b27a]/70 bg-[#fff9ef] shadow-sm">
      {src && !failed ? (
        <SmallPdfImage
          src={src}
          verifiedSmallSrc={smallSrc}
          alt={`First page of ${series.title}${editionLabel ? `, ${editionLabel}` : ""}`}
          width={170}
          height={220}
          loading="lazy"
          decoding="async"
          onUnavailable={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <div
          role="img"
          aria-label={`${series.title} — ${fallbackLabel}; not an issue cover`}
          className="flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden border-l-[3px] px-1.5 py-1 text-center"
          style={{ backgroundColor: palette.background, color: palette.ink, borderLeftColor: palette.accent }}
        >
          <div className={mini ? "text-[6px] font-bold uppercase tracking-wide" : "text-[8px] font-bold uppercase tracking-wide"} style={{ color: palette.accent }}>
            TFTT Originals
          </div>
          <div className="h-px w-3/4" style={{ backgroundColor: palette.accent }} />
          <div className={mini ? "font-serif text-[9px] font-bold leading-tight" : "font-serif text-xs font-bold leading-tight sm:text-sm"}>
            {series.title}
          </div>
          <div className="h-px w-3/4" style={{ backgroundColor: palette.accent }} />
          <div className={mini ? "text-[7px] font-medium" : "text-[10px] font-medium"}>{fallbackLabel}</div>
        </div>
      )}
    </div>
  );
}

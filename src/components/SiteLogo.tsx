const LOGO_HORIZONTAL_LIGHT = "/assets/logo-horizontal-light.svg";
const LOGO_HEADER_SHABBOS = "/assets/logo-header-shabbos.svg";
const LOGO_ICON = "/assets/logo-icon.svg";

/**
 * Responsive header lockup using the Shabbos-table artwork and wordmark.
 * The same asset scales across mobile, tablet, and desktop so the visual
 * relationship between the artwork and name stays consistent.
 */
export function SiteLogoHorizontal({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center ${className}`}>
      <img
        src={LOGO_HEADER_SHABBOS}
        alt="Torah for the Table"
        width={640}
        height={201}
        className="h-11 w-auto object-contain sm:h-14 lg:h-16"
      />
    </span>
  );
}

/** Full horizontal lockup for footer / page headers on light backgrounds. */
export function SiteLogoStacked({ className = "" }: { className?: string }) {
  return (
    <img
      src={LOGO_HORIZONTAL_LIGHT}
      alt="Torah for the Table"
      width={2400}
      height={800}
      className={`h-16 w-auto object-contain sm:h-20 ${className}`}
    />
  );
}

/** Icon-only mark. */
export function SiteLogoIcon({
  className = "",
  size = 48,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      src={LOGO_ICON}
      alt="Torah for the Table"
      width={size}
      height={size}
      className={`object-contain ${className}`}
    />
  );
}

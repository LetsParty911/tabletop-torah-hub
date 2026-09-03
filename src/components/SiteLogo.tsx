const LOGO_HORIZONTAL_LIGHT = "/assets/logo-horizontal-light.svg";
const LOGO_HEADER_DESKTOP = "/assets/logo-header-desktop.webp";
const LOGO_HEADER_TABLET = "/assets/logo-header-tablet.webp";
const LOGO_HEADER_MOBILE = "/assets/logo-header-mobile.webp";
const LOGO_ICON = "/assets/logo-icon.svg";

/** Responsive Shabbos-table header lockup. */
export function SiteLogoHorizontal({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center ${className}`}>
      <picture>
        <source media="(min-width: 1024px)" srcSet={LOGO_HEADER_DESKTOP} />
        <source media="(min-width: 768px)" srcSet={LOGO_HEADER_TABLET} />
        <img
          src={LOGO_HEADER_MOBILE}
          alt="Torah for the Table"
          width={600}
          height={189}
          className="h-12 w-auto object-contain sm:h-14 md:h-16 lg:h-16"
        />
      </picture>
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

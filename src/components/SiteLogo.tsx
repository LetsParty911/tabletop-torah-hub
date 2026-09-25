const LOGO_STACKED = "/assets/logo-stacked.png";
const LOGO_HEADER_DESKTOP = "/assets/logo-header-desktop.webp";
const LOGO_HEADER_TABLET = "/assets/logo-header-tablet.webp";
const LOGO_HEADER_MOBILE = "/assets/logo-header-mobile.webp";
const LOGO_FOOTER = "/assets/logo-footer.webp";
const LOGO_ICON = "/assets/logo-icon.png";

const BRAND_COMPACT = "/assets/brand-logo-compact.webp";
const BRAND_FOOTER = "/assets/brand-logo-footer.webp";

/** Compact header logo cropped from the approved navy/gold banner artwork. */
export function SiteLogoHorizontal({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center overflow-hidden rounded-md bg-primary ${className}`}>
      <img
        src={BRAND_COMPACT}
        alt="Torah for the Table"
        width={480}
        height={156}
        decoding="async"
        className="h-11 w-auto object-contain sm:h-12 md:h-14"
      />
    </span>
  );
}

/** Restrained footer logo (with tagline) from the approved banner artwork. */
export function SiteLogoFooter({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center overflow-hidden rounded-lg bg-primary ${className}`}>
      <img
        src={BRAND_FOOTER}
        alt="Torah for the Table — Torah. For your table."
        width={560}
        height={228}
        loading="lazy"
        decoding="async"
        className="h-20 w-auto object-contain sm:h-24"
      />
    </span>
  );
}

/** Full homepage brand banner: mobile-safe crop under 640px, full artwork above. */
export function BrandBanner() {
  return (
    <picture>
      <source media="(max-width: 639px)" srcSet="/assets/brand-banner-mobile.webp" />
      <source
        srcSet="/assets/brand-banner-800.webp 800w, /assets/brand-banner-1280.webp 1280w, /assets/brand-banner-1920.webp 1920w"
        sizes="(min-width: 1024px) 1024px, 100vw"
      />
      <img
        src="/assets/brand-banner-1280.webp"
        alt="Torah for the Table — Torah. For your table."
        width={1280}
        height={427}
        fetchPriority="high"
        className="block h-auto w-full rounded-lg shadow-sm"
      />
    </picture>
  );
}

/** Full stacked lockup for page headers on light backgrounds. */
export function SiteLogoStacked({ className = "" }: { className?: string }) {
  return (
    <img
      src={LOGO_STACKED}
      alt="Torah for the Table"
      width={1650}
      height={900}
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

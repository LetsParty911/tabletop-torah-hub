const LOGO_STACKED = "/assets/logo-stacked.png";
const LOGO_HEADER_DESKTOP = "/assets/logo-header-desktop.webp";
const LOGO_HEADER_TABLET = "/assets/logo-header-tablet.webp";
const LOGO_HEADER_MOBILE = "/assets/logo-header-mobile.webp";
const LOGO_FOOTER = "/assets/logo-footer.webp";
const LOGO_ICON = "/assets/logo-icon.png";

const BRAND_COMPACT = "/assets/brand-logo-compact.webp";

/** Wordmark-only header logo in crisp HTML typography. */
export function SiteLogoHorizontal({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex items-baseline whitespace-nowrap font-serif text-[1.35rem] leading-none font-semibold tracking-tight sm:text-2xl md:text-[1.75rem] ${className}`}
    >
      <span className="text-primary">Torah</span>
      <span className="text-accent-readable italic font-medium">For</span>
      <span className="text-primary">The</span>
      <span className="text-primary">Table</span>
      <span className="text-accent-readable text-[0.7em] font-medium">.com</span>
    </span>
  );
}

/** Crisp footer wordmark rendered in HTML so there are no raster artifacts. */
export function SiteLogoFooter({ className = "" }: { className?: string }) {
  const gold = {
    backgroundImage: "linear-gradient(180deg, #fff2b2 0%, #f3c454 42%, #c98a1f 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  } as const;

  return (
    <span
      className={`block w-[min(88vw,560px)] overflow-hidden rounded-lg border border-white/5 bg-[#031b35] px-5 py-4 shadow-sm sm:px-7 sm:py-5 ${className}`}
      aria-label="TorahForTheTable.com"
    >
      <span className="block text-center font-serif font-semibold leading-[0.84] tracking-[-0.045em]">
        <span className="block text-[2.35rem] sm:text-[3.35rem]" style={gold}>
          TorahFor
        </span>
        <span className="mt-1 block text-[2rem] sm:text-[2.9rem]">
          <span style={gold}>The</span>
          <span className="text-white">Table</span>
          <span className="text-[0.7em]" style={gold}>.com</span>
        </span>
      </span>
      <span
        className="mx-auto mt-3 block h-px w-[90%]"
        style={{ backgroundImage: "linear-gradient(90deg, transparent, #e0a334 18%, #fff1ad 50%, #e0a334 82%, transparent)" }}
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

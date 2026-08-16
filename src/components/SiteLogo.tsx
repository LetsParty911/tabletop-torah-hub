const LOGO_HORIZONTAL_LIGHT = "/assets/logo-horizontal-light.svg";
const LOGO_ICON = "/assets/logo-icon.svg";

/**
 * Header lockup. Mobile shows the icon-only mark to save header width;
 * >= sm shows the full horizontal lockup (light backgrounds — the site
 * header/footer sit on warm parchment #FDF9F3).
 */
export function SiteLogoHorizontal({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center ${className}`}>
      <img
        src={LOGO_HORIZONTAL_LIGHT}
        alt="Torah for the Table"
        width={2400}
        height={800}
        className="h-14 w-auto object-contain sm:h-20"
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

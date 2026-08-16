import logoMark from "@/assets/logo-mark.png.asset.json";

/** Wordmark: TORAH / — FOR THE — / TABLE */
function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const top =
    size === "lg"
      ? "text-2xl sm:text-3xl"
      : size === "md"
        ? "text-base sm:text-lg"
        : "text-sm";
  const mid =
    size === "lg" ? "text-sm" : size === "md" ? "text-[0.6rem] sm:text-[0.7rem]" : "text-[0.55rem]";

  return (
    <span className="flex flex-col items-center leading-none text-primary">
      <span className={`font-serif font-semibold tracking-[0.14em] ${top}`}>TORAH</span>
      <span className="flex w-full items-center gap-1.5 py-0.5">
        <span className="h-px flex-1 bg-accent/70" />
        <span className={`font-serif tracking-[0.22em] text-accent ${mid}`}>FOR THE</span>
        <span className="h-px flex-1 bg-accent/70" />
      </span>
      <span className={`font-serif font-semibold tracking-[0.14em] ${top}`}>TABLE</span>
    </span>
  );
}

/** Horizontal lockup used in the header: mark · gold rule · wordmark. */
export function SiteLogoHorizontal({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 sm:gap-3 ${className}`}>
      <img
        src={logoMark.url}
        alt=""
        aria-hidden="true"
        width={40}
        height={40}
        className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10"
      />

      <span className="hidden h-8 w-px shrink-0 bg-accent/70 sm:block sm:h-10" />
      <span className="hidden sm:block">
        <Wordmark size="md" />
      </span>
    </span>
  );
}

/** Stacked primary lockup: mark above the three-line wordmark. */
export function SiteLogoStacked({ className = "" }: { className?: string }) {
  return (
    <span className={`flex flex-col items-center gap-3 ${className}`}>
      <img
        src={logoMark.url}
        alt="Torah for the Table"
        className="h-16 w-16 object-contain sm:h-20 sm:w-20"
      />
      <Wordmark size="lg" />
    </span>
  );
}

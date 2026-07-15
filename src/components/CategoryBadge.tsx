import { cn } from "@/lib/utils";

type Props = {
  label: string;
  active?: boolean;
  onClick?: () => void;
  as?: "button" | "span";
  size?: "sm" | "xs";
  variant?: "default" | "secondary";
};

/**
 * Pill badge for category/tag display.
 * Default = antique gold (content type filters).
 * Secondary = deep navy (publication/source filters).
 */
export function CategoryBadge({
  label,
  active = false,
  onClick,
  as,
  size = "sm",
  variant = "default",
}: Props) {
  const Tag = (as ?? (onClick ? "button" : "span")) as any;
  const base =
    "inline-flex items-center rounded-full border font-sans font-medium uppercase tracking-wider transition-colors whitespace-nowrap";
  const sizing =
    size === "xs"
      ? "px-2 py-0.5 text-[0.6rem]"
      : "px-2.5 py-0.5 text-[0.65rem] sm:text-xs";

  const variants = {
    default: {
      active: "bg-accent text-accent-foreground border-accent",
      inactive:
        "bg-background text-accent border-accent/80 hover:bg-accent/10",
    },
    secondary: {
      active: "bg-primary text-primary-foreground border-primary",
      inactive:
        "bg-background text-primary border-primary/60 hover:bg-primary/10",
    },
  };

  const state = active
    ? variants[variant].active
    : variants[variant].inactive;
  const interactive = onClick ? "cursor-pointer" : "";
  return (
    <Tag
      type={Tag === "button" ? "button" : undefined}
      onClick={onClick}
      className={cn(base, sizing, state, interactive)}
    >
      {label}
    </Tag>
  );
}


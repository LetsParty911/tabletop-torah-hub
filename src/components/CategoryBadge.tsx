import { cn } from "@/lib/utils";

type Props = {
  label: string;
  active?: boolean;
  onClick?: () => void;
  as?: "button" | "span";
  size?: "sm" | "xs";
};

/**
 * Gold outline pill badge for category/tag display.
 * Active state = filled gold background with dark text.
 */
export function CategoryBadge({
  label,
  active = false,
  onClick,
  as,
  size = "sm",
}: Props) {
  const Tag = (as ?? (onClick ? "button" : "span")) as any;
  const base =
    "inline-flex items-center rounded-full border font-sans font-medium uppercase tracking-wider transition-colors whitespace-nowrap";
  const sizing =
    size === "xs"
      ? "px-2 py-0.5 text-[0.6rem]"
      : "px-2.5 py-0.5 text-[0.65rem] sm:text-xs";
  const state = active
    ? "bg-accent text-accent-foreground border-accent"
    : "bg-background text-accent border-accent/80 hover:bg-accent/10";
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

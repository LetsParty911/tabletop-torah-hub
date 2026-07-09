import { useState } from "react";

export function ExpandableSummary({
  text,
  className = "",
}: {
  text: string | null;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text || text.trim().length === 0) return null;

  return (
    <div className={className}>
      <p
        className={`font-sans text-xs sm:text-sm text-muted-foreground leading-relaxed ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1.5 text-xs font-medium text-accent hover:text-primary transition-colors"
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </div>
  );
}

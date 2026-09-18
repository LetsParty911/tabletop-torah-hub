import { Link } from "@tanstack/react-router";
import { BookmarkCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { trackFp } from "@/lib/first-party-analytics";
import { readMyTable, subscribeMyTable } from "@/lib/my-table";

type Props = { className?: string };

/** Compact live "My Table · N" link. Renders nothing until hydrated. */
export function MyTableIndicator({ className = "" }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    setCount(readMyTable().length);
    return subscribeMyTable((items) => setCount(items.length));
  }, []);

  if (count === null) return null;

  return (
    <Link
      to="/my-table"
      onClick={() => trackFp("my_table_open", { metadata: { saved_count: count } })}
      className={`inline-flex items-center gap-2 rounded-full border border-accent/50 bg-background/90 px-4 py-2 font-serif text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground ${className}`}
    >
      <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
      {count > 0 ? `My Table · ${count}` : "My Table"}
    </Link>
  );
}

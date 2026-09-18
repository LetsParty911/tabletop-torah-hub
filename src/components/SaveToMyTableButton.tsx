import { Bookmark, BookmarkCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { trackFp } from "@/lib/first-party-analytics";
import {
  addToMyTable,
  isInMyTable,
  removeFromMyTable,
  subscribeMyTable,
  type MyTableItem,
} from "@/lib/my-table";

type Props = {
  item: Omit<MyTableItem, "savedAt">;
  className?: string;
  /** Optional compact styling for dense card layouts. */
  size?: "default" | "sm";
  /** Optional analytics context, e.g. the chooser that surfaced this item. */
  analyticsContext?: Record<string, unknown>;
};

export function SaveToMyTableButton({
  item,
  className = "",
  size = "default",
  analyticsContext,
}: Props) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isInMyTable(item.id));
    return subscribeMyTable(() => setSaved(isInMyTable(item.id)));
  }, [item.id]);

  const toggle = () => {
    const context = {
      publication_id: item.id,
      publication_title: item.title,
      publication_series: item.publication,
      publisher: item.publisher,
      parsha: item.parsha,
      metadata: analyticsContext ?? {},
    };
    if (saved) {
      removeFromMyTable(item.id);
      setSaved(false);
      trackFp("my_table_remove", context);
    } else {
      addToMyTable(item);
      setSaved(true);
      trackFp("my_table_add", context);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      className={`inline-flex items-center justify-center gap-2 rounded-full border font-serif font-semibold transition-colors ${
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5"
      } ${
        saved
          ? "border-accent bg-accent/15 text-primary"
          : "border-accent/50 bg-background text-primary hover:bg-accent hover:text-accent-foreground"
      } ${className}`}
    >
      {saved ? <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
      {saved ? "Saved to My Table" : "Save to My Table"}
    </button>
  );
}

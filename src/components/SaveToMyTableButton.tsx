import { Bookmark, BookmarkCheck } from "lucide-react";
import { useEffect, useState } from "react";

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
};

export function SaveToMyTableButton({ item, className = "" }: Props) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isInMyTable(item.id));
    return subscribeMyTable(() => setSaved(isInMyTable(item.id)));
  }, [item.id]);

  const toggle = () => {
    if (saved) {
      removeFromMyTable(item.id);
      setSaved(false);
    } else {
      addToMyTable(item);
      setSaved(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 font-serif font-semibold transition-colors ${
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

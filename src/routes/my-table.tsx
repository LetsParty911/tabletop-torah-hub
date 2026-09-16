import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { audienceLabel, normalizeAudience } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { formatReadingLabel } from "@/lib/parshiyos";
import {
  clearMyTable,
  readMyTable,
  removeFromMyTable,
  subscribeMyTable,
  type MyTableItem,
} from "@/lib/my-table";

export const Route = createFileRoute("/my-table")({
  component: MyTablePage,
  head: () => ({
    meta: [
      { title: "My Table | Torah for the Table" },
      {
        name: "description",
        content: "Your saved Divrei Torah from Torah for the Table.",
      },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
});

function itemMeta(item: MyTableItem) {
  return [
    item.audience
      ? audienceLabel(normalizeAudience(item.audience, item.title)) ?? item.audience
      : null,
    formatTypeLabel(item.formatType),
    typeof item.pageCount === "number"
      ? `${item.pageCount} ${item.pageCount === 1 ? "page" : "pages"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function MyTablePage() {
  const [items, setItems] = useState<MyTableItem[]>([]);

  useEffect(() => {
    setItems(readMyTable());
    return subscribeMyTable(setItems);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, MyTableItem[]>();
    for (const item of items) {
      const key = item.parsha || "Saved Torah";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-primary">
              <Bookmark className="h-5 w-5" aria-hidden="true" />
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold text-primary sm:text-4xl">My Table</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Save Divrei Torah as you browse, then come back here when you're ready to choose what to print.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Saved on this device only. No account is required.
            </p>
          </div>
        </section>

        {items.length === 0 ? (
          <section className="mt-7 rounded-2xl border border-accent/30 bg-card/40 p-7 text-center">
            <h2 className="font-serif text-2xl font-semibold text-primary">Nothing saved yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Open any Dvar Torah and choose <strong>Save to My Table</strong>. Your saved choices will appear here.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                to="/"
                className="rounded-full bg-primary px-5 py-2.5 font-serif font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Browse this week
              </Link>
              <Link
                to="/archive"
                className="rounded-full border border-accent/50 px-5 py-2.5 font-serif font-semibold text-primary hover:bg-accent/10"
              >
                Browse Archive
              </Link>
            </div>
          </section>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {items.length} saved {items.length === 1 ? "selection" : "selections"}
              </p>
              <button
                type="button"
                onClick={() => clearMyTable()}
                className="inline-flex items-center gap-2 rounded-full border border-accent/35 px-4 py-2 text-sm font-medium text-primary hover:bg-accent/10"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Clear My Table
              </button>
            </div>

            <div className="mt-5 space-y-7">
              {grouped.map(([group, groupItems]) => (
                <section key={group} className="parchment-frame">
                  <div className="parchment-panel">
                    <h2 className="font-serif text-2xl font-bold text-primary">
                      {group === "Saved Torah" ? group : formatReadingLabel(group)}
                    </h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {groupItems.map((item) => {
                        const meta = itemMeta(item);
                        return (
                          <article key={item.id} className="rounded-xl border border-accent/30 bg-background/65 p-4">
                            <h3 className="font-serif text-lg font-bold leading-snug text-primary">
                              <Link to="/view/$id" params={{ id: item.id }} className="hover:text-accent hover:underline">
                                {item.title}
                              </Link>
                            </h3>
                            {item.publisher && (
                              <p className="mt-1 text-xs text-muted-foreground">Published by {item.publisher}</p>
                            )}
                            {meta && (
                              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{meta}</p>
                            )}
                            {item.description && (
                              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                            )}
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Link
                                to="/view/$id"
                                params={{ id: item.id }}
                                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground"
                              >
                                View & Print
                              </Link>
                              <button
                                type="button"
                                onClick={() => removeFromMyTable(item.id)}
                                className="rounded-full border border-accent/35 px-4 py-2 text-sm font-medium text-primary hover:bg-accent/10"
                              >
                                Remove
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

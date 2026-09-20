import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, CheckCircle2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { requestSubscriberPreferenceLink } from "@/integrations/supabase/subscriber-preferences.functions";
import { audienceLabel, normalizeAudience } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { formatReadingLabel } from "@/lib/parshiyos";
import {
  clearMyTable,
  clearTablePack,
  readMyTable,
  readTablePackIds,
  removeFromMyTable,
  setTablePackIds,
  subscribeMyTable,
  subscribeTablePack,
  toggleTablePackItem,
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
  const [packIds, setPackIds] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [linkStatus, setLinkStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    setItems(readMyTable());
    setPackIds(readTablePackIds());
    const unsubTable = subscribeMyTable(setItems);
    const unsubPack = subscribeTablePack(setPackIds);
    return () => {
      unsubTable();
      unsubPack();
    };
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

  const packSet = useMemo(() => new Set(packIds), [packIds]);
  const packItems = useMemo(
    () => items.filter((item) => packSet.has(item.id)),
    [items, packSet],
  );
  const knownPages = useMemo(
    () => packItems.reduce((sum, item) => sum + (item.pageCount ?? 0), 0),
    [packItems],
  );
  const hasUnknownPages = packItems.some((item) => item.pageCount === null);

  const requestPreferenceLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLinkStatus("sending");
    try {
      await requestSubscriberPreferenceLink({ data: { email: email.trim() } });
      setLinkStatus("sent");
    } catch {
      setLinkStatus("error");
    }
  };

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
              Save Divrei Torah as you browse, then choose what actually belongs in My Pack.
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
            <section className="mt-6 rounded-2xl border-2 border-accent/45 bg-card/45 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-readable">Ready for tonight</p>
                  <h2 className="mt-1 font-serif text-2xl font-bold text-primary">Tonight's Table Pack</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Choose only what you actually plan to print. We keep each publisher's PDF unchanged and give you one compact checklist to work through.
                  </p>
                </div>
                <div className="rounded-xl border border-accent/30 bg-background/65 px-4 py-3 text-right">
                  <div className="text-2xl font-bold text-primary">{packItems.length}</div>
                  <div className="text-xs text-muted-foreground">
                    {packItems.length === 1 ? "selection" : "selections"}
                  </div>
                  <div className="mt-1 text-xs font-medium text-foreground">
                    {knownPages > 0 ? `${knownPages}${hasUnknownPages ? "+" : ""} total pages` : "Page total pending"}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTablePackIds(items.map((item) => item.id))}
                  disabled={packItems.length === items.length}
                  className="rounded-full border border-accent/40 px-4 py-2 text-sm font-medium text-primary hover:bg-accent/10 disabled:opacity-50"
                >
                  Select all saved
                </button>
                <button
                  type="button"
                  onClick={() => clearTablePack()}
                  disabled={packItems.length === 0}
                  className="rounded-full border border-accent/40 px-4 py-2 text-sm font-medium text-primary hover:bg-accent/10 disabled:opacity-50"
                >
                  Clear pack
                </button>
              </div>

              {packItems.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-accent/35 px-4 py-4 text-sm text-muted-foreground">
                  Check <strong>Tonight's pack</strong> on any saved item below to build your print list.
                </p>
              ) : (
                <div className="mt-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Print checklist
                  </div>
                  <ol className="mt-3 space-y-2">
                    {packItems.map((item, index) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-2 rounded-xl border border-accent/25 bg-background/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-primary">
                            {index + 1}. {item.title}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{itemMeta(item)}</div>
                        </div>
                        <Link
                          to="/view/$id"
                          params={{ id: item.id }}
                          className="shrink-0 rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground"
                        >
                          View & Print
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>

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
                        const inPack = packSet.has(item.id);
                        return (
                          <article key={item.id} className={`rounded-xl border bg-background/65 p-4 ${inPack ? "border-accent/70 ring-1 ring-accent/25" : "border-accent/30"}`}>
                            <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                              <input
                                type="checkbox"
                                checked={inPack}
                                onChange={() => toggleTablePackItem(item.id)}
                                className="h-4 w-4 rounded border-accent/50 accent-[hsl(var(--primary))]"
                              />
                              Tonight's pack
                            </label>
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

        <section className="mt-8 rounded-2xl border border-accent/30 bg-card/35 p-5 text-center sm:p-6">
          <h2 className="font-serif text-2xl font-semibold text-primary">Personalize your Thursday email</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Already subscribed? We can email you a private link to choose what kind of Torah you want each week — children, family stories, quick vorts, questions, halacha, deeper learning, and preferred length.
          </p>
          <form onSubmit={requestPreferenceLink} className="mx-auto mt-5 flex max-w-xl flex-col gap-2 sm:flex-row">
            <label htmlFor="preference-email" className="sr-only">Email address</label>
            <input
              id="preference-email"
              type="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (linkStatus !== "idle") setLinkStatus("idle");
              }}
              placeholder="Your subscribed email address"
              className="h-11 min-w-0 flex-1 rounded-full border border-accent/35 bg-background px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={linkStatus === "sending"}
              className="h-11 rounded-full bg-primary px-5 font-serif font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {linkStatus === "sending" ? "Sending…" : "Send My Link"}
            </button>
          </form>
          {linkStatus === "sent" && (
            <p className="mt-3 text-sm text-primary">
              If that address is subscribed, your private preference link is on its way.
            </p>
          )}
          {linkStatus === "error" && (
            <p className="mt-3 text-sm text-destructive">Could not send the link right now. Please try again.</p>
          )}
          <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
            We show the same confirmation either way so subscription addresses remain private.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

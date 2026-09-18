import { Link } from "@tanstack/react-router";
import { BookmarkCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";


import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { MyTableIndicator } from "@/components/MyTableIndicator";
import { SaveToMyTableButton } from "@/components/SaveToMyTableButton";
import { normalizeAudience } from "@/lib/audience";
import { buildDownloadFilename } from "@/lib/download-filename";
import { trackFp } from "@/lib/first-party-analytics";
import { formatTypeLabel } from "@/lib/format-labels";
import { readMyTable, subscribeMyTable } from "@/lib/my-table";
import { standardizeCopy } from "@/lib/standardize-copy";

import {
  CHOOSERS,
  chooseReason,
  chooserMetaLine,
  pickRecommendations,
  type ChooserKey,
  type ChooserResource,
} from "@/lib/table-chooser";

type Props = {
  resources: ChooserResource[];
  parshaKey: string | null;
  displayTitle: (r: ChooserResource) => string;
  displayPublicationName: (r: ChooserResource) => string;
};

export function TableChooser({ resources, parshaKey, displayTitle, displayPublicationName }: Props) {
  const [selected, setSelected] = useState<ChooserKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const lastViewed = useRef<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(false);

  const recommendations = useMemo(
    () => (selected ? pickRecommendations(resources, selected, 3) : []),
    [resources, selected],
  );

  const selectedLabel = useMemo(
    () => CHOOSERS.find((c) => c.key === selected)?.label,
    [selected],
  );

  useEffect(() => {
    setMounted(true);
    setSavedCount(readMyTable().length);
    return subscribeMyTable((items) => setSavedCount(items.length));
  }, []);

  // Keep the last page content scrollable above the fixed bar on mobile.
  useEffect(() => {
    if (!selected) return;
    document.body.classList.add("has-chooser-bar");
    return () => document.body.classList.remove("has-chooser-bar");
  }, [selected]);


  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const selectChooser = (key: ChooserKey, label: string) => {
    setSelected(key);
    pendingScrollRef.current = true;
    trackFp("chooser_select", { metadata: { chooser: key, label } });
  };


  useEffect(() => {
    if (!selected || recommendations.length === 0 || !resultsRef.current || !pendingScrollRef.current) return;
    pendingScrollRef.current = false;
    const el = resultsRef.current;
    const id = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const hiddenAbove = rect.bottom < 80;
      const belowFold = rect.top > viewportHeight * 0.55;
      if (!hiddenAbove && !belowFold) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [selected, recommendations]);

  useEffect(() => {
    if (!selected || recommendations.length === 0) return;
    // One recommendation_view per distinct chooser + result set, never per render.
    const key = `${selected}:${recommendations.map((r) => r.id).join(",")}`;
    if (lastViewed.current === key) return;
    lastViewed.current = key;
    trackFp("recommendation_view", {
      metadata: {
        chooser: selected,
        count: recommendations.length,
        publication_ids: recommendations.map((r) => r.id),
      },
    });
  }, [selected, recommendations]);

  if (resources.length === 0) return null;

  const itemFor = (r: ChooserResource) => ({
    id: r.id,
    title: displayTitle(r),
    publication: r.publication,
    publisher: r.publisher,
    parsha: parshaKey,
    audience: normalizeAudience(r.audience, r.title) ?? r.audience,
    formatType: formatTypeLabel(r.format_type) ?? formatTypeLabel(r.content_type),
    pageCount: r.page_count,
    description: r.summary_quick || r.description || r.subtitle,
  });

  return (
    <section id="shabbos-table-chooser" className="mt-8 scroll-mt-24">
      <div className="mx-auto max-w-4xl rounded-2xl border border-accent/35 bg-card/40 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-center sm:text-left">
            <h2 className="font-serif text-xl font-bold text-primary sm:text-2xl md:text-3xl">
              What would you like for your Shabbos table?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose what you need and we'll point you to a good place to start.
            </p>
          </div>
          <MyTableIndicator className="shrink-0" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {CHOOSERS.map((chooser) => {
            const active = selected === chooser.key;
            return (
              <button
                key={chooser.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (active) {
                    setSelected(null);
                    return;
                  }
                  selectChooser(chooser.key, chooser.label);
                }}

                className={`min-w-0 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-accent bg-accent/15 shadow-sm"
                    : "border-accent/30 bg-background/70 hover:border-accent/60 hover:bg-card/60"
                }`}
              >
                <span className="block font-serif text-base font-bold text-primary">{chooser.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{chooser.blurb}</span>
              </button>
            );
          })}
        </div>

        {selected && recommendations.length > 0 && (
          <div ref={resultsRef} className="mt-5 scroll-mt-24 border-t border-accent/25 pt-4">
            <p className="text-center font-sans text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-accent-readable sm:text-xs">
              Recommended for you this week
            </p>
            {selectedLabel && (
              <p className="mt-1 text-center text-xs italic text-muted-foreground">
                Showing {selectedLabel} picks
              </p>
            )}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {recommendations.map((r) => (
                <div
                  key={r.id}
                  className="flex min-w-0 flex-col rounded-xl border border-accent/35 bg-background/70 p-4"
                >
                  <h3 className="font-serif text-base font-bold leading-snug text-primary">
                    <Link
                      to="/view/$id"
                      params={{ id: r.id }}
                      onClick={() =>
                        trackFp("recommendation_click", {
                          publication_id: r.id,
                          publication_title: r.title,
                          publication_series: r.publication,
                          publisher: r.publisher,
                          parsha: parshaKey,
                          metadata: { chooser: selected },
                        })
                      }
                      className="transition-colors hover:text-accent hover:underline"
                    >
                      {displayTitle(r)}
                    </Link>
                  </h3>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground sm:text-sm">
                    {standardizeCopy(chooseReason(r))}
                  </p>
                  {chooserMetaLine(r) && (
                    <p className="mt-2 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                      {chooserMetaLine(r)}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    <Link
                      to="/view/$id"
                      params={{ id: r.id }}
                      onClick={() =>
                        trackFp("recommendation_click", {
                          publication_id: r.id,
                          publication_title: r.title,
                          parsha: parshaKey,
                          metadata: { chooser: selected, action: "view" },
                        })
                      }
                      className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-1.5 font-serif text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      View
                    </Link>
                    <SaveToMyTableButton
                      item={itemFor(r)}
                      size="sm"
                      analyticsContext={{ chooser: selected, surface: "chooser" }}
                    />
                    <DownloadToPrintButton
                      href={`/view/${r.id}/download`}
                      publicationId={r.id}
                      publicationName={displayPublicationName(r)}
                      publicationTitle={r.title}
                      publisher={r.publisher}
                      publicationSeries={r.publication}
                      parsha={parshaKey}
                      filename={buildDownloadFilename(parshaKey, r.publication || r.title)}
                      className="px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 text-center">
          <a
            href="#filters"
            className="font-serif text-sm font-semibold text-accent-readable underline-offset-4 hover:text-primary hover:underline"
          >
            Browse all {resources.length} {resources.length === 1 ? "selection" : "selections"}
          </a>
        </div>
      </div>

      {selected && mounted && createPortal(
        <div className="tftt-chooser-bar lg:hidden">

          {menuOpen && (
            <button
              type="button"
              aria-label="Close category menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-[80] bg-primary/30"
            />
          )}
          <div
            className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            style={{ pointerEvents: "none" }}
          >
            {menuOpen && (
              <div
                role="menu"
                aria-label="Choose a category"
                className="mx-auto mb-2 max-w-md overflow-hidden rounded-2xl border border-accent/40 bg-card shadow-lg"
                style={{ pointerEvents: "auto" }}
              >
                {CHOOSERS.map((chooser) => (
                  <button
                    key={chooser.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected === chooser.key}
                    onClick={() => {
                      setMenuOpen(false);
                      if (selected !== chooser.key) selectChooser(chooser.key, chooser.label);
                      else pendingScrollRef.current = true;
                    }}
                    className={`block w-full px-4 py-3 text-left font-serif text-sm font-semibold ${
                      selected === chooser.key ? "bg-accent/20 text-primary" : "text-primary"
                    }`}
                  >
                    {chooser.label}
                  </button>
                ))}
              </div>
            )}
            <div
              className="mx-auto flex max-w-md min-w-0 items-center gap-2 rounded-full border border-accent/40 bg-card/95 px-3 py-2 shadow-lg backdrop-blur"
              style={{ pointerEvents: "auto" }}
            >
              <span className="min-w-0 flex-1 truncate font-serif text-xs font-semibold text-primary">
                {selectedLabel} selected
              </span>
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((v) => !v)}
                className="shrink-0 rounded-full border border-accent/50 px-3 py-1.5 font-serif text-xs font-semibold text-primary"
              >
                Change
              </button>
              <Link
                to="/my-table"
                onClick={() => trackFp("my_table_open", { metadata: { saved_count: savedCount ?? 0 } })}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 font-serif text-xs font-semibold text-primary-foreground"
              >
                <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {savedCount && savedCount > 0 ? `My Table (${savedCount})` : "My Table"}
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </section>

  );
}

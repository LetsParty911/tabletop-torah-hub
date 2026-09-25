import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, ArrowLeft } from "lucide-react";
import type {
  ReadingCollectionSummary,
  ReadingResource,
} from "@/integrations/supabase/reading-pages.functions";
import { normalizeAudience, audienceLabel } from "@/lib/audience";
import { formatTypeLabel } from "@/lib/format-labels";
import { buildDownloadFilename } from "@/lib/download-filename";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { SharePublicationButton } from "@/components/SharePublicationButton";
import { SiteFooter } from "@/components/SiteFooter";

export function ReadingCollectionView({
  collection,
  resources,
}: {
  collection: ReadingCollectionSummary;
  resources: ReadingResource[];
}) {
  const [audience, setAudience] = useState<"All" | "Children" | "Families" | "Adults">("All");
  const [length, setLength] = useState<"All" | "short" | "long">("All");
  const [type, setType] = useState("All");

  const resourceType = (r: ReadingResource) =>
    formatTypeLabel(r.format_type) ?? formatTypeLabel(r.content_type) ?? null;

  const types = useMemo(
    () => [...new Set(resources.map(resourceType).filter((v): v is string => Boolean(v)))].sort(),
    [resources],
  );

  const filtered = resources.filter((r) => {
    const audienceMatch =
      audience === "All" || normalizeAudience(r.audience, r.title) === audience;
    const lengthMatch =
      length === "All" ||
      (typeof r.page_count === "number" &&
        (length === "short" ? r.page_count < 5 : r.page_count >= 5));
    const typeMatch = type === "All" || resourceType(r) === type;
    return audienceMatch && lengthMatch && typeMatch;
  });

  const quickKids = resources.find(
    (r) => normalizeAudience(r.audience, r.title) === "Children",
  );
  const quickFamily = resources.find(
    (r) => normalizeAudience(r.audience, r.title) === "Families",
  );
  const quickShort = [...resources]
    .filter((r) => typeof r.page_count === "number")
    .sort((a, b) => (a.page_count ?? 9999) - (b.page_count ?? 9999))[0];
  const quickPicks = [
    quickKids && { label: "For Kids", resource: quickKids },
    quickFamily && quickFamily.id !== quickKids?.id
      ? { label: "For the Family", resource: quickFamily }
      : null,
    quickShort && quickShort.id !== quickKids?.id && quickShort.id !== quickFamily?.id
      ? {
          label: `${quickShort.page_count === 1 ? "1-Page Quick Pick" : "Quick Pick"}`,
          resource: quickShort,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; resource: ReadingResource }>;

  const hasLengthChoice =
    resources.some((r) => typeof r.page_count === "number" && r.page_count < 5) &&
    resources.some((r) => typeof r.page_count === "number" && r.page_count >= 5);

  const metaLine = (r: ReadingResource) =>
    [
      audienceLabel(normalizeAudience(r.audience, r.title)) ?? r.audience,
      resourceType(r),
      typeof r.page_count === "number"
        ? r.page_count === 1
          ? "1 page · Quick Pick"
          : r.page_count >= 20
            ? `Long Study · ${r.page_count} pages`
            : `${r.page_count} pages`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const filterClass = (active: boolean) =>
    `inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
      active
        ? "border-accent bg-accent text-accent-foreground"
        : "border-accent/40 bg-background text-primary hover:border-accent hover:bg-accent/10"
    }`;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          to="/archive"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Archive
        </Link>

        <section className="parchment-frame mt-5">
          <div className="parchment-panel text-center">
            <p className="font-sans text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-readable">
              {collection.kind === "yom-tov" ? "Yom Tov Collection" : "Parsha Collection"}
            </p>
            <h1 className="mt-2 font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-primary">
              {collection.label}
            </h1>
            <p className="mt-1 font-sans text-sm font-semibold text-muted-foreground">
              {collection.jewish_year}
            </p>
            <p className="mx-auto mt-4 max-w-2xl font-serif text-base sm:text-lg leading-relaxed text-primary/85">
              {collection.count} carefully selected {collection.count === 1 ? "Dvar Torah" : "Divrei Torah"} for children, families and adults.
            </p>
          </div>
        </section>

        {quickPicks.length > 0 && (
          <section className="mt-6 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-5 sm:px-5">
            <p className="text-center font-sans text-[0.65rem] font-bold uppercase tracking-[0.18em] text-accent-readable">
              Tonight's Table
            </p>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Three easy places to start if you want to print quickly.
            </p>
            <div className="mx-auto mt-3 grid max-w-3xl gap-3 sm:grid-cols-3">
              {quickPicks.map(({ label, resource }) => (
                <Link
                  key={`${label}-${resource.id}`}
                  to="/view/$id"
                  params={{ id: resource.id }}
                  className="rounded-xl border border-accent/30 bg-background/70 p-3 text-center transition-colors hover:border-accent/70 hover:bg-background"
                >
                  <p className="font-sans text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-accent-readable">
                    {label}
                  </p>
                  <p className="mt-1 font-serif font-bold leading-snug text-primary">
                    {resource.publication_name || resource.title}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-7 rounded-xl border border-accent/25 bg-card/25 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Audience</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["All", "Children", "Families", "Adults"] as const).map((value) => {
                  const available =
                    value === "All" ||
                    resources.some((r) => normalizeAudience(r.audience, r.title) === value);
                  if (!available) return null;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={audience === value}
                      onClick={() => setAudience(value)}
                      className={filterClass(audience === value)}
                    >
                      {audienceLabel(value)}
                    </button>
                  );
                })}
              </div>
            </div>

            {hasLengthChoice && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Length</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    ["All", "All"],
                    ["short", "Under 5 Pages"],
                    ["long", "5+ Pages"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={length === value}
                      onClick={() => setLength(value as "All" | "short" | "long")}
                      className={filterClass(length === value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {types.length > 1 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">Content type</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["All", ...types].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={type === value}
                      onClick={() => setType(value)}
                      className={filterClass(type === value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <p className="mt-5 text-sm text-muted-foreground">
          Showing {filtered.length} of {resources.length} selections
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {filtered.map((resource) => {
            const description = resource.summary_quick || resource.description || resource.subtitle;
            const meta = metaLine(resource);
            return (
              <article
                key={resource.id}
                className="flex h-full flex-col rounded-xl border border-accent/35 bg-background/60 p-4 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {resource.publication_name && resource.publication_slug ? (
                      <Link
                        to="/publication/$slug"
                        params={{ slug: resource.publication_slug }}
                        className="font-serif text-lg font-bold leading-snug text-primary hover:text-accent hover:underline"
                      >
                        {resource.publication_name}
                      </Link>
                    ) : (
                      <h2 className="font-serif text-lg font-bold leading-snug text-primary">
                        {resource.title}
                      </h2>
                    )}
                    {resource.title !== resource.publication_name && resource.publication_name && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{resource.title}</p>
                    )}
                    {resource.publisher && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Published by {resource.publisher}</p>
                    )}
                    {meta && (
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {meta}
                      </p>
                    )}
                    {description && (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link
                      to="/view/$id"
                      params={{ id: resource.id }}
                      className="inline-flex items-center justify-center rounded-full border border-accent/50 px-4 py-2.5 font-serif font-semibold text-primary transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      View & Preview
                    </Link>
                    <DownloadToPrintButton
                      href={`/view/${resource.id}/download`}
                      publicationId={resource.id}
                      publicationName={resource.publication_name || resource.title}
                      publicationTitle={resource.title}
                      publisher={resource.publisher}
                      publicationSeries={resource.publication_name}
                      parsha={resource.parsha_key}
                      filename={buildDownloadFilename(
                        resource.parsha_key,
                        resource.publication_name || resource.title,
                      )}
                      className="w-full px-4 py-2.5"
                    />
                  </div>
                  <div className="mt-2 flex justify-center">
                    <SharePublicationButton
                      pdfId={resource.id}
                      title={resource.publication_name || resource.title}
                      parsha={resource.parsha_key}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="mt-8 text-center text-muted-foreground">
            No selections match these filters. Try clearing one.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

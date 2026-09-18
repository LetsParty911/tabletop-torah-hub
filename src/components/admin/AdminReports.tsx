import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminCollectionReport,
  adminDailyReport,
} from "@/integrations/supabase/admin-analytics-canonical";
import { formatCountRate, shouldShowRate } from "@/lib/admin-analytics-display";
import { formatDayLabel } from "@/lib/admin-reports";

type DailyReport = Awaited<ReturnType<typeof adminDailyReport>>;
type CollectionReport = Awaited<ReturnType<typeof adminCollectionReport>>;
type AnyReport = DailyReport | CollectionReport;
type Kind = "daily" | "collection";

function etTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function metricLines(report: AnyReport): string[] {
  const m = report.metrics;
  if (!m) return [];
  return [
    `People: ${m.people}`,
    `Used Torah: ${m.usedTorah}`,
    `PDF opens: ${m.pdfOpens}`,
    `Download actions: ${m.downloads}`,
    `Returning readers: ${m.returningReaders}`,
    `Signups: ${m.signups}`,
  ];
}

/** Plain-text version suitable for email or WhatsApp. Deterministic. */
function plainText(report: AnyReport): string {
  const heading =
    report.kind === "daily"
      ? `Torah For The Table — Daily Report\n${report.title}`
      : `Torah For The Table — Collection Report\n${report.title}`;
  const lines: string[] = [heading, report.windowLabel, ""];
  const m = report.metrics;

  if (!m || m.people === 0) {
    lines.push("Quiet period: no canonical reader activity was recorded.");
  } else {
    lines.push(...metricLines(report));
    lines.push("");
    const top = report.highlights?.topPublication;
    if (top) {
      lines.push(
        `Top publication: ${top.title} — ${top.impressions} shown, ${top.pdfOpens} PDF opens, ${top.downloadActions} download actions`,
      );
    }
    const source = report.highlights?.topSource;
    if (source) lines.push(`Top source: ${source.label} (${source.sessions} sessions)`);
    const campaign = report.highlights?.topCampaign;
    if (campaign) lines.push(`Top campaign: ${campaign.label} (${campaign.sessions} sessions)`);
    const failed = report.highlights?.searchesWithoutOutcome ?? [];
    lines.push(
      failed.length
        ? `Searches with no content outcome: ${failed.map((s) => `"${s.term}"`).join(", ")}`
        : "Searches with no content outcome: none",
    );
    lines.push(
      `Suspected automated sessions set aside: ${report.highlights?.dataHealth.suspectedAutomationSessions ?? 0} of ${report.highlights?.dataHealth.rawSessions ?? 0} raw sessions`,
    );
  }

  if (report.observations.length) {
    lines.push("", report.kind === "daily" ? "Observations:" : "What changed:");
    lines.push(...report.observations.map((note) => `- ${note}`));
  }
  if (report.changes.length) {
    lines.push("", "Compared with the prior comparable period:");
    lines.push(...report.changes.map((note) => `- ${note}`));
  }
  lines.push(
    "",
    `Canonical filtered analytics. Most recent event: ${report.highlights?.dataHealth.mostRecentEventAt ? `${etTime(report.highlights.dataHealth.mostRecentEventAt)} ET` : "none in period"}.`,
  );
  return lines.join("\n");
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <span className="block text-[11px] font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block font-serif text-2xl font-bold text-primary">{value}</span>
    </div>
  );
}

function ReportBody({ report }: { report: AnyReport }) {
  const m = report.metrics;
  const highlights = report.highlights;
  const quiet = !m || m.people === 0;

  return (
    <article className="space-y-6">
      <header>
        <h3 className="font-serif text-2xl font-bold text-primary">{report.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{report.windowLabel}</p>
      </header>

      {quiet ? (
        <p className="font-serif text-lg leading-relaxed text-foreground">
          This was a quiet period. No canonical reader activity was recorded, so there is nothing
          further to report.
        </p>
      ) : (
        <>
          <p className="font-serif text-lg leading-relaxed text-foreground">
            {m.people} {m.people === 1 ? "person" : "people"} visited. {m.usedTorah} used Torah,
            with {m.pdfOpens} PDF opens and {m.downloads} download actions.{" "}
            {m.returningReaders > 0
              ? `${m.returningReaders} were returning readers.`
              : "No returning readers were identified."}{" "}
            {m.signups > 0
              ? `${m.signups} ${m.signups === 1 ? "signup" : "signups"} came in.`
              : "There were no signups."}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="People" value={m.people} />
            <Stat label="Used Torah" value={m.usedTorah} />
            <Stat label="PDF opens" value={m.pdfOpens} />
            <Stat label="Downloads" value={m.downloads} />
            <Stat label="Returning" value={m.returningReaders} />
            <Stat label="Signups" value={m.signups} />
          </div>

          <section className="grid gap-6 border-y border-border py-5 md:grid-cols-2">
            <div>
              <h4 className="font-serif text-base font-semibold text-primary">Top publications</h4>
              {report.publications.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No publication activity in this period.
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {report.publications.map((publication) => (
                    <li key={publication.title}>
                      <span className="font-medium text-foreground">{publication.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {publication.impressions} shown · {publication.clicks} selected ·{" "}
                        {publication.pdfOpens} PDF opens · {publication.downloadActions} download
                        actions
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {shouldShowRate(publication.downloadDenominator)
                          ? `Open to download: ${formatCountRate(publication.downloadNumerator, publication.downloadDenominator)}`
                          : `Open to download: ${publication.downloadNumerator} of ${publication.downloadDenominator} (too few for a rate)`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="font-serif text-base font-semibold text-primary">
                  Outreach and sources
                </h4>
                <ul className="mt-2 space-y-1 text-sm">
                  {report.sources.map((source) => (
                    <li key={source.label} className="flex justify-between">
                      <span>{source.label}</span>
                      <span className="text-muted-foreground">{source.sessions} sessions</span>
                    </li>
                  ))}
                  {report.sources.length === 0 && (
                    <li className="text-sm text-muted-foreground">No source data.</li>
                  )}
                </ul>
                {report.campaigns.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Campaigns:{" "}
                    {report.campaigns.map((c) => `${c.label} (${c.sessions})`).join(" · ")}
                  </p>
                )}
              </div>
              <div>
                <h4 className="font-serif text-base font-semibold text-primary">
                  Likely network reach
                </h4>
                <p className="text-xs text-muted-foreground">
                  Approximate network location, never merged with campaign attribution.
                </p>
                <p className="mt-1 text-sm">
                  {report.locations.length
                    ? report.locations.map((l) => `${l.label} (${l.sessions})`).join(" · ")
                    : "No approximate location data in this period."}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="font-serif text-base font-semibold text-primary">Searches</h4>
              {report.searches.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No searches in this period.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {report.searches.map((search, index) => (
                    <li key={`${search.at}-${index}`} className="flex justify-between gap-3">
                      <span>“{search.term}”</span>
                      <span className="text-xs text-muted-foreground">
                        {search.ledToContent ? "Led to Torah" : "No content outcome"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="font-serif text-base font-semibold text-primary">Data health</h4>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>
                  {highlights?.dataHealth.suspectedAutomationSessions ?? 0} suspected automated
                  sessions set aside of {highlights?.dataHealth.rawSessions ?? 0} raw sessions.
                  Nothing is deleted.
                </li>
                <li>
                  Most recent canonical event:{" "}
                  {highlights?.dataHealth.mostRecentEventAt
                    ? `${etTime(highlights.dataHealth.mostRecentEventAt)} ET`
                    : "none in this period"}
                  .
                </li>
              </ul>
            </div>
          </section>
        </>
      )}

      <section className="border-t border-border pt-5">
        <h4 className="font-serif text-base font-semibold text-primary">
          {report.kind === "daily" ? "Observations" : "What changed"}
        </h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
          {report.observations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {report.comparable && report.changes.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {report.changes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        {!report.comparable && (
          <p className="mt-3 text-xs text-muted-foreground">
            Not enough comparable data in the prior period to show a comparison.
          </p>
        )}
      </section>
    </article>
  );
}

export default function AdminReports({ accessToken }: { accessToken: string }) {
  const [kind, setKind] = useState<Kind>("daily");
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [parsha, setParsha] = useState<string | null>(null);
  const [report, setReport] = useState<AnyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next =
        kind === "daily"
          ? await adminDailyReport({ data: { accessToken, dayKey } })
          : await adminCollectionReport({ data: { accessToken, parsha } });
      setReport(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not build this report.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, kind, dayKey, parsha]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(plainText(report));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const dayOptions = useMemo(
    () => (report && report.kind === "daily" ? report.availableDays : []),
    [report],
  );
  const collectionOptions = useMemo(
    () => (report && report.kind === "collection" ? report.available : []),
    [report],
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-serif text-2xl font-bold text-primary">Reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Plain-English summaries built from the same canonical filtered analytics as the rest of
          this page. Every line is a fixed rule over counts, not an opinion.
        </p>
      </section>

      <div className="flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={kind === "daily" ? "default" : "ghost"}
            onClick={() => {
              setKind("daily");
              setReport(null);
            }}
          >
            Daily
          </Button>
          <Button
            size="sm"
            variant={kind === "collection" ? "default" : "ghost"}
            onClick={() => {
              setKind("collection");
              setReport(null);
            }}
          >
            Collection
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {kind === "daily" && dayOptions.length > 0 && (
            <label className="text-xs text-muted-foreground">
              <span className="sr-only">Report day</span>
              <select
                value={report && report.kind === "daily" ? report.dayKey : ""}
                onChange={(event) => setDayKey(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {dayOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatDayLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "collection" && collectionOptions.length > 0 && (
            <label className="text-xs text-muted-foreground">
              <span className="sr-only">Collection</span>
              <select
                value={report && report.kind === "collection" ? (report.parsha ?? "") : ""}
                onChange={(event) => setParsha(event.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {collectionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!report}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy report"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            {loading ? "Rebuilding…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!report && !error ? (
        <p className="py-10 text-center text-muted-foreground">Building the report…</p>
      ) : (
        report && <ReportBody report={report} />
      )}
    </div>
  );
}

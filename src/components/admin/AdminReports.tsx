import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminCollectionReport,
  adminDailyReport,
} from "@/integrations/supabase/admin-analytics-canonical";
import { formatDayLabel, formatRate } from "@/lib/admin-reports";

type DailyReport = Awaited<ReturnType<typeof adminDailyReport>>;
type CollectionReport = Awaited<ReturnType<typeof adminCollectionReport>>;
type LoadedCollection = Extract<CollectionReport, { empty: false }>;
type AnyReport = DailyReport | LoadedCollection;

function isLoadedCollection(report: CollectionReport): report is LoadedCollection {
  return report.empty === false;
}

function line(label: string, value: number) {
  return { label, value };
}

function plainText(report: AnyReport): string {
  const m = report.metrics;
  const lines: string[] = [
    report.title,
    report.windowLabel,
    "",
    `People: ${m.people}`,
    `Used Torah: ${m.usedTorah}`,
    `PDF opens: ${m.pdfOpens}`,
    `Download actions: ${m.downloads}`,
    `Returning readers: ${m.returningReaders}`,
    `Signups: ${m.signups}`,
    "",
  ];
  if (report.publications.length) {
    lines.push("Top publications:");
    for (const publication of report.publications.slice(0, 5)) {
      lines.push(
        `- ${publication.title}: seen ${publication.impressions}, opens ${publication.pdfOpens}, downloads ${publication.downloadActions}`,
      );
    }
    lines.push("");
  }
  if (report.sources.length) {
    lines.push(`Top source: ${report.sources[0]!.label} (${report.sources[0]!.sessions} sessions)`);
  }
  if (report.campaigns.length) {
    lines.push(`Top campaign: ${report.campaigns[0]!.label} (${report.campaigns[0]!.sessions} sessions)`);
  }
  lines.push(
    `Searches with no downstream content action: ${report.failedSearches.length} of ${report.searches.length}`,
  );
  lines.push(
    `Suspected automated sessions set aside: ${report.suspectedAutomatedSessions} of ${report.raw.sessions} raw sessions`,
  );
  lines.push(`Most recent canonical event: ${report.lastEventAt ?? "none in this period"}`);
  if (report.comparisonMetrics) {
    lines.push("", `Compared with ${report.comparisonLabel}:`);
    lines.push(
      `People ${report.comparisonMetrics.people} → ${m.people}; download actions ${report.comparisonMetrics.downloads} → ${m.downloads}`,
    );
  }
  if (report.changes.length) lines.push("", "What changed:", ...report.changes.map((change) => `- ${change}`));
  lines.push("", "Observations:", ...report.observations.map((note) => `- ${note}`));
  return lines.join("\n");
}

function MetricRow({ items }: { items: Array<{ label: string; value: number }> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-border bg-background/50 p-3">
          <dt className="text-[11px] font-semibold uppercase text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 font-serif text-2xl font-bold text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReportBody({ report }: { report: AnyReport }) {
  const m = report.metrics;
  const quiet = m.people === 0 && m.pdfOpens === 0 && m.downloads === 0;
  return (
    <div className="space-y-6">
      <header>
        <h3 className="font-serif text-xl font-bold text-primary">{report.title}</h3>
        <p className="text-sm text-muted-foreground">{report.windowLabel}</p>
      </header>

      {quiet ? (
        <p className="text-sm text-foreground">
          This period was quiet: no recorded visitors, PDF opens or download actions.
        </p>
      ) : (
        <p className="font-serif text-lg leading-relaxed text-foreground">
          {m.people} {m.people === 1 ? "person" : "people"} visited, {m.usedTorah} used Torah,{" "}
          {m.pdfOpens} PDF opens and {m.downloads} download actions.
        </p>
      )}

      <MetricRow
        items={[
          line("People", m.people),
          line("Used Torah", m.usedTorah),
          line("PDF opens", m.pdfOpens),
          line("Downloads", m.downloads),
          line("Returning", m.returningReaders),
          line("Signups", m.signups),
        ]}
      />

      {report.publications.length > 0 && (
        <section>
          <h4 className="font-serif text-base font-semibold text-primary">Top publications</h4>
          <ul className="mt-2 divide-y divide-border text-sm">
            {report.publications.map((publication) => (
              <li key={publication.title} className="py-2">
                <span className="font-medium">{publication.title}</span>
                <span className="block text-xs text-muted-foreground">
                  Seen {publication.impressions} · Opens {publication.pdfOpens} · Download actions{" "}
                  {publication.downloadActions} · Open→download:{" "}
                  {formatRate(publication.downloadNumerator, publication.downloadDenominator)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-6 sm:grid-cols-3">
        <div>
          <h4 className="font-serif text-base font-semibold text-primary">Sources</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {report.sources.length ? (
              report.sources.map((item) => (
                <li key={item.label} className="flex justify-between gap-2">
                  <span>{item.label}</span>
                  <span className="text-muted-foreground">{item.sessions}</span>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No source data.</li>
            )}
          </ul>
        </div>
        <div>
          <h4 className="font-serif text-base font-semibold text-primary">Campaigns</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {report.campaigns.length ? (
              report.campaigns.map((item) => (
                <li key={item.label} className="flex justify-between gap-2">
                  <span className="break-all">{item.label}</span>
                  <span className="text-muted-foreground">{item.sessions}</span>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No named campaigns.</li>
            )}
          </ul>
        </div>
        <div>
          <h4 className="font-serif text-base font-semibold text-primary">Likely network reach</h4>
          <p className="text-[11px] text-muted-foreground">Approximate; never merged with campaigns.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {report.locations.length ? (
              report.locations.map((item) => (
                <li key={item.label} className="flex justify-between gap-2">
                  <span>{item.label}</span>
                  <span className="text-muted-foreground">{item.sessions}</span>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No location data.</li>
            )}
          </ul>
        </div>
      </section>

      <section>
        <h4 className="font-serif text-base font-semibold text-primary">Searches that went nowhere</h4>
        {report.searches.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No searches in this period.</p>
        ) : report.failedSearches.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            All {report.searches.length} searches led to a publication, open or download.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {report.failedSearches.map((search, index) => (
              <li key={`${search.at}-${index}`} className="rounded-md border border-border px-2 py-1">
                “{search.term}”
              </li>
            ))}
          </ul>
        )}
      </section>

      {report.comparisonMetrics && (
        <section>
          <h4 className="font-serif text-base font-semibold text-primary">Compared with {report.comparisonLabel}</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            People {report.comparisonMetrics.people} → {m.people} · Used Torah{" "}
            {report.comparisonMetrics.usedTorah} → {m.usedTorah} · Download actions{" "}
            {report.comparisonMetrics.downloads} → {m.downloads}
          </p>
        </section>
      )}

      {report.changes.length > 0 && (
        <section>
          <h4 className="font-serif text-base font-semibold text-primary">What changed</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {report.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="font-serif text-base font-semibold text-primary">Observations</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {report.observations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-border pt-3 text-xs text-muted-foreground">
        Canonical filtered analytics · {report.suspectedAutomatedSessions} session
        {report.suspectedAutomatedSessions === 1 ? "" : "s"} set aside as likely automated and{" "}
        {report.internalSessions} internal/test sessions excluded, out of {report.raw.sessions} raw sessions
        (nothing deleted) · Most recent canonical event:{" "}
        {report.lastEventAt ? new Date(report.lastEventAt).toLocaleString("en-US", { timeZone: "America/New_York" }) : "none in this period"}{" "}
        · Observations are fixed rules, not AI opinions.
      </footer>
    </div>
  );
}

export default function AdminReports({ accessToken }: { accessToken: string }) {
  const [kind, setKind] = useState<"daily" | "collection">("daily");
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [parsha, setParsha] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyReport | null>(null);
  const [collection, setCollection] = useState<CollectionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (kind === "daily") {
        const result = await adminDailyReport({ data: { accessToken, dayKey } });
        setDaily(result);
        setDayKey(result.dayKey);
      } else {
        const result = await adminCollectionReport({ data: { accessToken, parsha } });
        setCollection(result);
        if (isLoadedCollection(result)) setParsha(result.parsha);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not build the report.");
    } finally {
      setLoading(false);
    }
    // dayKey/parsha are intentionally read, not tracked, so pickers trigger one load each.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, kind, dayKey, parsha]);

  useEffect(() => {
    void load();
  }, [load]);

  const active: AnyReport | null =
    kind === "daily" ? daily : collection && isLoadedCollection(collection) ? collection : null;

  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(plainText(active));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={kind === "daily" ? "default" : "outline"} onClick={() => setKind("daily")}>
            Daily
          </Button>
          <Button
            size="sm"
            variant={kind === "collection" ? "default" : "outline"}
            onClick={() => setKind("collection")}
          >
            Collection
          </Button>
          {kind === "daily" && daily && (
            <select
              value={dayKey ?? daily.dayKey}
              onChange={(event) => setDayKey(event.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              aria-label="Choose a completed day"
            >
              {daily.availableDays.map((day) => (
                <option key={day} value={day}>
                  {formatDayLabel(day)}
                </option>
              ))}
            </select>
          )}
          {kind === "collection" && collection && collection.available.length > 0 && (
            <select
              value={parsha ?? collection.available[0]}
              onChange={(event) => setParsha(event.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              aria-label="Choose a completed collection"
            >
              {collection.available.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!active}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy report"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!active}>
            <Printer />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            {loading ? "Building…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!active && !error && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {loading
            ? "Building the report…"
            : kind === "collection"
              ? "No completed collection window yet."
              : "No report available."}
        </p>
      )}
      {active && (
        <div className="report-print-area rounded-md border border-border p-4 sm:p-6">
          <ReportBody report={active} />
        </div>
      )}
    </div>
  );
}

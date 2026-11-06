import { summarizeTrafficQuality, type TrafficQualityInput } from "@/lib/traffic-quality-report";

/** Shows the raw and classified data side by side, without calling visitor IDs people. */
export default function TrafficQualityPanel({ report }: { report: TrafficQualityInput }) {
  const quality = summarizeTrafficQuality(report);
  const buckets = [
    { label: "High-confidence human", count: quality.classifications.high_confidence_human },
    { label: "Likely human", count: quality.classifications.likely_human },
    { label: "Uncertain", count: quality.classifications.uncertain },
    { label: "Suspected automation", count: quality.classifications.suspected_automation },
    { label: "Internal / test", count: quality.classifications.internal_test },
  ];

  return (
    <section aria-labelledby="traffic-quality-heading" className="space-y-4 rounded-lg border border-border bg-background/50 p-4 sm:p-5">
      <div>
        <h3 id="traffic-quality-heading" className="font-serif text-lg font-semibold text-primary">Traffic quality</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Raw traffic is shown separately from browser IDs with evidence of human-like activity.
          Publication selection is tracked separately from simply visiting a page.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Raw visitor IDs</p>
          <p className="mt-1 font-serif text-2xl font-bold text-primary">{quality.rawVisitorIds.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">All recorded browser IDs; includes bots and tests</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Qualified visitor IDs</p>
          <p className="mt-1 font-serif text-2xl font-bold text-primary">{quality.qualifiedVisitorIds.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">High-confidence + likely-human sessions only</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Publication clickers</p>
          <p className="mt-1 font-serif text-2xl font-bold text-primary">{quality.publicationClickerIds.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Distinct qualified browser IDs · {quality.qualifiedPublicationClicks.toLocaleString()} recorded clicks</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Suspected automated sessions</p>
          <p className="mt-1 font-serif text-2xl font-bold text-primary">{quality.classifications.suspected_automation.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Session classification, not a count of people</p>
        </div>
      </div>
      <div className="border-t border-border pt-3">
        <h4 className="text-sm font-semibold">Session classification</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {quality.qualifiedSessions.toLocaleString()} qualified sessions out of {quality.rawSessions.toLocaleString()} raw sessions.
          These categories are mutually exclusive at session level.
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {buckets.map((item) => (
            <div key={item.label} className="flex justify-between gap-3 border-b border-border/60 pb-1">
              <dt>{item.label}</dt>
              <dd className="font-semibold tabular-nums">{item.count.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
        {quality.classifiedSessions !== quality.rawSessions && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Some raw sessions could not be reconciled to a classification.
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Visitor IDs identify browsers, not verified individuals. A browser may have both qualified and excluded sessions.
        Scanner-like visits can remain uncertain even if they simulate clicks. A publication click is not proof that a PDF was read.
      </p>
    </section>
  );
}

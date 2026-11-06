import type { ReadingJourneyReport } from "@/lib/reading-journey";

function rate(n: number, total: number): string {
  return total < 10 ? "Small sample" : String(Math.round((100 * n) / total)) + "%";
}

export default function ReadingJourneyPanel({ data, rangeLabel }: { data: ReadingJourneyReport; rangeLabel: string }) {
  const stages = [
    { label: "Reached an original publication card", value: data.originalsReached, denominator: data.originalsEligibleSessions },
    { label: "Reached the weekly collection heading", value: data.weeklyReached, denominator: data.countedSessions },
    { label: "Saw a publication card", value: data.cardsSeen, denominator: data.countedSessions },
    { label: "Clicked a publication", value: data.clickedPublications, denominator: data.countedSessions },
    { label: "Did not click a publication", value: data.didNotClick, denominator: data.countedSessions },
  ];
  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold text-primary">Reader journey</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {rangeLabel} · Homepage sessions recorded after the journey tracking update. Only high-confidence and likely-human sessions are included in the main counts.
        </p>
      </div>
      {data.instrumentedSessions === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No journey-tracked homepage sessions in this period yet. Historical visits cannot be reconstructed as section views. Choose a newer range after the tracking update is live.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Qualified homepage sessions</p>
              <p className="mt-1 font-serif text-2xl font-bold text-primary tabular-nums">{data.countedSessions}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">With publication clicks</p>
              <p className="mt-1 font-serif text-2xl font-bold text-primary tabular-nums">{data.clickedPublications}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Excluded or uncertain</p>
              <p className="mt-1 font-serif text-2xl font-bold text-primary tabular-nums">{data.excludedSessions}</p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-semibold">Observed action</th><th className="px-3 py-3 text-right font-semibold">Sessions</th><th className="px-3 py-3 text-right font-semibold">Rate</th></tr></thead>
              <tbody className="divide-y divide-border">
                {stages.map((stage) => (
                  <tr key={stage.label}><td className="px-3 py-3">{stage.label}</td><td className="px-3 py-3 text-right tabular-nums">{stage.value}</td><td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{rate(stage.value, stage.denominator)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="font-serif text-lg font-semibold text-primary">Where activity stops</h3>
            <p>Reached the weekly collection without a publication click: <b>{data.weeklyWithoutClick}</b> sessions.</p>
            <p>Saw an original but did not reach the main weekly collection: <b>{data.originalsWithoutWeekly}</b> sessions.</p>
            <p>No tracked view of either section: <b>{data.neitherSectionReached}</b> sessions. This does not prove an immediate exit.</p>
          </div>
          {data.sources.length > 0 && (
            <div>
              <h3 className="font-serif text-lg font-semibold text-primary">By arrival source</h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-3 py-2">Source</th><th className="px-3 py-2 text-right">Sessions</th><th className="px-3 py-2 text-right">Clicked</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {data.sources.map((source) => (<tr key={source.label}><td className="px-3 py-2">{source.label}</td><td className="px-3 py-2 text-right tabular-nums">{source.sessions}</td><td className="px-3 py-2 text-right tabular-nums">{source.clicked}</td></tr>))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each session is counted at most once per action. A section is considered reached only when at least 50% of the first original card or collection heading stays visible for one continuous second; card impressions use the existing 50%/one-second rule.
            Stages are not strictly sequential: visitors may jump straight to a publication or the main collection. A click is an attempted opening, not a completed download. Excluded/uncertain sessions never enter conversion denominators.
            Passive section views cannot qualify a visitor as human. The Originals rate includes only visits where originals were available.
          </p>
        </>
      )}
    </section>
  );
}

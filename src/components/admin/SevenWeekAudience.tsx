import { useCallback, useEffect, useState } from "react";
import { adminSevenWeekAudience } from "@/integrations/supabase/admin-analytics-canonical";

type Report = Awaited<ReturnType<typeof adminSevenWeekAudience>>;

export default function SevenWeekAudience({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      setData(await adminSevenWeekAudience({ data: { accessToken } }));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The loyalty report could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, [accessToken]);
  useEffect(() => { void reload(); }, [reload]);
  return <section className="rounded-lg border border-border p-4 space-y-5" aria-label="Seven-week audience loyalty">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="font-serif text-xl font-bold text-primary">Seven-week reader loyalty</h3>
        <p className="text-xs text-muted-foreground">Seven completed Sunday–Saturday weeks, New York time. Separate from Thursday publication weeks.</p></div>
      <button type="button" onClick={() => void reload()} disabled={busy}
        className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50">
        {busy ? "Loading..." : "Refresh"}</button>
    </div>
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    {busy && !data && <p className="text-sm text-muted-foreground">Loading complete visitor history…</p>}
    {data && <>
      <p className="text-xs text-muted-foreground">{data.windowStart} through {data.weeks.at(-1)?.through}. Browser IDs are not identifiable people; figures require existing likely-human session qualification.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["In 2+ weeks", data.inTwoPlusWeeks],
          ["Consecutive-week returners", data.consecutiveWeekVisitors],
          ["Actions in 2+ weeks", data.engagedInTwoPlusWeeks],
          ["All seven weeks", data.inAllSevenWeeks],
        ].map(([name, count]) => <div key={name} className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">{name}</p><p className="font-serif text-2xl font-semibold">{count}</p>
        </div>)}
      </div>
      <div className="overflow-x-auto"><table className="min-w-[780px] w-full text-left text-xs">
        <thead><tr className="border-b border-border"><th className="py-2">Week starting</th><th>Qualified</th>
          <th>First recorded</th><th>Seen earlier</th><th>Also prior week</th>
          <th>Deliberate actions</th><th>PDF clickers</th><th>Top source</th></tr></thead>
        <tbody>{data.weeks.map((w) => <tr key={w.week} className="border-b border-border/40">
          <td className="py-2">{w.week}</td><td>{w.visitors}</td><td>{w.firstObserved}</td><td>{w.seenEarlier}</td>
          <td>{w.priorWeekRepeat}{w.priorWeekRate !== null ? ` (${Math.round(w.priorWeekRate * 100)}%)` : ""}</td>
          <td>{w.deliberateVisitors}</td><td>{w.pdfRequestedVisitors}</td><td>{w.topSource}</td>
        </tr>)}</tbody></table></div>
      <div className="grid gap-5 md:grid-cols-2">
        <div><h4 className="font-semibold text-sm mb-2">Sources that bring readers back</h4>
          <ul className="space-y-1 text-xs">{data.sourceLoyalty.map((s) => <li key={s.source} className="flex justify-between gap-2">
            <span>{s.source}</span><span>{s.consecutiveWeekVisitors} consecutive / {s.visitors} total</span>
          </li>)}</ul></div>
        <div><h4 className="font-semibold text-sm mb-2">Repeat readership by publication series</h4>
          <ul className="space-y-1 text-xs">{data.seriesLoyalty.length ? data.seriesLoyalty.map((s) =>
            <li key={s.series} className="flex justify-between gap-2"><span>{s.series}</span>
              <span>{s.multiWeekReaders} repeat / {s.readers} readers</span></li>) :
            <li>No series-level PDF click history available yet.</li>}</ul></div>
      </div>
      <details><summary className="cursor-pointer text-sm font-semibold">Repeatedly selected publications</summary>
        <ul className="mt-2 space-y-1 text-xs">{data.publicationLoyalty.map((p, i) =>
          <li key={i} className="flex justify-between gap-3"><span>{p.title} ({p.series})</span>
            <span>{p.returningAcrossWeeks} in multiple weeks / {p.readers} visitors</span></li>)}</ul></details>
      <details><summary className="cursor-pointer text-sm font-semibold">PDF and signup evidence by week</summary>
        <div className="overflow-x-auto"><table className="mt-2 min-w-[650px] w-full text-xs text-left">
          <thead><tr><th>Week</th><th>PDF attempted</th><th>Passive preview</th><th>Preview focus</th>
            <th>Signup attempts</th><th>Failures</th><th>Success</th></tr></thead>
          <tbody>{data.weeks.map((w) => <tr key={w.week} className="border-t border-border/40">
            <td className="py-2">{w.week}</td><td>{w.pdfRequestedVisitors}</td><td>{w.automaticPreviewVisitors}</td>
            <td>{w.previewFocusVisitors}</td><td>{w.signupAttemptVisitors}</td>
            <td>{w.signupFailureVisitors}</td><td>{w.signupSuccessVisitors}</td>
          </tr>)}</tbody></table></div></details>
      <p className="text-xs text-muted-foreground">Traffic quality: {data.trafficQuality.likelyHumanSessions} qualified sessions; {data.trafficQuality.excludedSuspectedAutomation} suspected automation, {data.trafficQuality.excludedUncertain} uncertain and {data.trafficQuality.excludedInternal} internal/test excluded. All raw records are retained. {data.caveat}</p>
    </>}
  </section>;
}

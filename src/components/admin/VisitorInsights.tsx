import type { adminAnalyticsReport } from "@/integrations/supabase/admin-analytics-canonical";
import { formatCountRate } from "@/lib/admin-analytics-display";

type Insights = Awaited<ReturnType<typeof adminAnalyticsReport>>["report"]["visitorInsights"];

function NumberCard({ name, value, note }: { name: string; value: number; note?: string }) {
  return <div className="rounded-lg border border-border p-3">
    <p className="text-xs font-medium text-muted-foreground">{name}</p>
    <p className="mt-1 font-serif text-2xl font-bold text-primary">{value}</p>
    {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
  </div>;
}

function SimpleList({
  title, values, description,
}: {
  title: string;
  values: Array<{ label: string; sessions: number }>;
  description?: string;
}) {
  return <section>
    <h3 className="font-serif text-lg font-semibold text-primary">{title}</h3>
    {description && <p className="mb-2 text-xs text-muted-foreground">{description}</p>}
    {values.length ? <ul className="divide-y divide-border text-sm">
      {values.map((row) => <li key={row.label} className="flex justify-between gap-3 py-2">
        <span className="break-words">{row.label}</span><span className="shrink-0 tabular-nums">{row.sessions} visits</span>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">No recorded observations.</p>}
  </section>;
}

export default function VisitorInsights({ insights }: { insights: Insights }) {
  const behavior = insights.behavior;
  if (!insights.sessions) {
    return <section className="space-y-2">
      <h2 className="font-serif text-2xl font-semibold text-primary">Visitor Insights</h2>
      <p className="text-sm text-muted-foreground">No qualified visitor sessions in the selected period.</p>
    </section>;
  }

  const busiestHours = [...insights.hoursET].sort((a, b) => b.sessions - a.sessions || a.hour - b.hour).slice(0, 6);
  const totalPdfSessions = behavior.pdfAttemptSessions;

  return <section className="space-y-9" aria-label="Additional visitor insights">
    <header>
      <h2 className="font-serif text-2xl font-semibold text-primary">Visitor Insights</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        A closer look at who reaches the website and what helps them find Torah.
        Calculated from existing analytics events, using only sessions already classified as likely human.
        No new browser tracking or visitor prompts are added by this report.
      </p>
    </header>

    <section className="space-y-3">
      <h3 className="font-serif text-lg font-semibold text-primary">Engagement and difficulties</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <NumberCard name="Qualified visits" value={insights.sessions} />
        <NumberCard name="Visits with PDF attempted open" value={totalPdfSessions} note={formatCountRate(totalPdfSessions, insights.sessions)} />
        <NumberCard name="Multiple-page visits" value={behavior.multiplePageSessions} />
        <NumberCard name="Single page, no deliberate action" value={behavior.singlePageNoSelection} note="Not proof of disinterest; visits may be cut short." />
        <NumberCard name="Publication selected, no counted PDF attempt" value={behavior.selectedWithoutPdf} />
        <NumberCard name="Visits using search" value={behavior.searchSessions} />
        <NumberCard name="Visits with print clicks" value={behavior.printSessions} />
        <NumberCard name="Visits with share clicks" value={behavior.shareSessions} />
        <NumberCard name="Visits with signup success" value={behavior.signupSessions} />
        <NumberCard name="Visits with signup failures" value={behavior.signupFailures} />
        <NumberCard name="Visits with reported site errors" value={behavior.errorSessions} />
        <NumberCard name="Visits with PDF route errors" value={behavior.pdfRouteFailureSessions} />
      </div>
      <p className="text-xs text-muted-foreground">These are overlapping visit categories, not a sum. A counted PDF attempt is not proof that a file finished downloading or was read.</p>
    </section>

    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Which sources bring meaningful visitors?</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        First recorded source in each visit. PDF rate = visits with a counted PDF attempted open / visits from that source.
        A returning browser ID may appear under multiple sources. Percentages are withheld for fewer than 10 visits.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground"><tr>
            <th className="p-2">Source</th><th className="p-2">Visits</th><th className="p-2">Browser IDs</th>
            <th className="p-2">Returning IDs</th><th className="p-2">PDF attempts</th>
            <th className="p-2">PDF visit rate</th><th className="p-2">Share visits</th>
          </tr></thead>
          <tbody className="divide-y divide-border">{insights.bySource.map((row) => <tr key={row.source}>
            <td className="p-2 font-medium">{row.source}</td><td className="p-2 tabular-nums">{row.sessions}</td>
            <td className="p-2 tabular-nums">{row.browserIds}</td><td className="p-2 tabular-nums">{row.returningBrowserIds}</td>
            <td className="p-2 tabular-nums">{row.pdfAttemptSessions}</td>
            <td className="p-2">{formatCountRate(row.pdfAttemptSessions, row.sessions)}</td>
            <td className="p-2 tabular-nums">{row.shareSessions}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Where visitors begin</h3>
      <p className="mb-3 text-xs text-muted-foreground">Landing page within the selected reporting period. Exit and scroll detail remain in Overview → Additional charts.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[570px] text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground"><tr>
          <th className="p-2">Landing page</th><th className="p-2">Visits</th>
          <th className="p-2">PDF-attempt visits</th><th className="p-2">No deliberate action</th>
        </tr></thead>
        <tbody className="divide-y divide-border">{insights.byEntryPage.map((row) => <tr key={row.path}>
          <td className="p-2 break-all">{row.path}</td><td className="p-2 tabular-nums">{row.sessions}</td>
          <td className="p-2 tabular-nums">{row.pdfSessions}</td><td className="p-2 tabular-nums">{row.noActionSessions}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="font-serif text-lg font-semibold text-primary">Busiest arrival hours</h3>
        <p className="mb-2 text-xs text-muted-foreground">New York time; visit start hour, not visitor's local hour.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {busiestHours.map((row) => <div className="rounded border border-border p-3" key={row.hour}>
            <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, row.hour)))}</p>
            <p className="font-serif text-xl font-semibold">{row.sessions} visits</p>
            <p className="text-xs text-muted-foreground">{row.pdfSessions} PDF-attempt visits</p>
          </div>)}
        </div>
      </section>
      <section>
        <h3 className="font-serif text-lg font-semibold text-primary">Visits by weekday</h3>
        <p className="mb-2 text-xs text-muted-foreground">New York weekday, counting each visit once.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {insights.weekdaysET.map((day) => <div className="rounded border border-border p-3" key={day.label}>
            <p className="text-xs text-muted-foreground">{day.label}</p>
            <p className="font-serif text-xl font-semibold">{day.sessions}</p>
            <p className="text-xs text-muted-foreground">{day.pdfSessions} PDF attempts</p>
          </div>)}
        </div>
      </section>
    </div>

    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <SimpleList title="Browser language" values={insights.browserLanguages}
        description="Primary Accept-Language header; reflects browser preference, not a person's identity, fluency or religious affiliation." />
      <SimpleList title="Network category" values={insights.networkTypes}
        description="Provider-detected mobile, VPN, hosting, etc.; not definitive. Business networks can represent real readers." />
      <SimpleList title="Network organization" values={insights.networkOrganizations}
        description="Network operator, ISP or institution, not the visitor's employer or identity. Includes B&H network visitors when qualified." />
    </div>

    <p className="text-xs text-muted-foreground">
      {insights.note} Existing returning-reader, device/browser, geographic, PDF-by-publication and multiweek loyalty reports remain available in their current sections.
    </p>
  </section>;
}

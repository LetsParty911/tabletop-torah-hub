import { useCallback, useEffect, useState } from "react";
import {
  adminRetentionCohorts,
  type adminAnalyticsReport,
} from "@/integrations/supabase/admin-analytics-canonical";
import { formatCountRate } from "@/lib/admin-analytics-display";
import CampaignLinkBuilder from "@/components/admin/CampaignLinkBuilder";
import InternalDeviceControl from "@/components/admin/InternalDeviceControl";

type ReportData = Awaited<ReturnType<typeof adminAnalyticsReport>>;
type CohortData = Awaited<ReturnType<typeof adminRetentionCohorts>>;
type DetailKey = keyof ReportData["report"]["details"];

function Stat({
  label,
  value,
  note,
  onClick,
}: {
  label: string;
  value: number | string;
  note?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="block text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <span className="mt-1 block font-serif text-2xl font-bold text-primary">{value}</span>
      {note && <span className="mt-1 block text-xs text-muted-foreground">{note}</span>}
    </>
  );
  if (!onClick) return <div className="rounded-md border border-border p-3">{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-border p-3 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </button>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function OwnerSummary({
  data,
  accessToken,
  openDetail,
}: {
  data: ReportData;
  accessToken: string;
  openDetail: (key: DetailKey, title: string, description: string) => void;
}) {
  const { report } = data;
  const m = report.metrics;
  const confidence = report.confidence;
  const [cohorts, setCohorts] = useState<CohortData | null>(null);
  const [cohortError, setCohortError] = useState<string | null>(null);

  const loadCohorts = useCallback(async () => {
    try {
      setCohorts(await adminRetentionCohorts({ data: { accessToken } }));
    } catch (e) {
      setCohortError(e instanceof Error ? e.message : "Could not load returning-reader cohorts.");
    }
  }, [accessToken]);

  useEffect(() => {
    void loadCohorts();
  }, [loadCohorts]);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-serif text-2xl font-bold text-primary">Owner summary</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.rangeLabel} · everything below counts readers only. Internal/test visits and
          suspected automation are recorded but kept out of these numbers.
        </p>
      </section>

      <Block title="People">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="People"
            value={m.people}
            note="Distinct browser visitors"
            onClick={() => openDetail("people", "People", "The distinct browser visitors included in this report.")}
          />
          <Stat label="New" value={m.newVisitors} note="First observed visit" />
          <Stat
            label="Returning"
            value={m.returningReaders}
            note="Seen before this period"
            onClick={() => openDetail("returning", "Returning Readers", "Visitors with prior canonical history.")}
          />
          <Stat
            label="Confident humans"
            value={confidence.counts.high_confidence_human + confidence.counts.likely_human}
            note="High-confidence plus likely"
          />
          <Stat label="Uncertain" value={confidence.counts.uncertain} note="No deliberate action recorded" />
          <Stat
            label="Suspected automation"
            value={confidence.counts.suspected_automation}
            note="Set aside, not deleted"
          />
          <Stat
            label="Internal / test"
            value={confidence.counts.internal_test}
            note={`${confidence.markedInternalSessions} from devices you marked`}
          />
          <Stat label="Sessions" value={m.sessions} note="Visits counted in this period" />
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            What these labels mean
          </summary>
          <dl className="mt-2 space-y-2 text-xs text-muted-foreground">
            {Object.entries(confidence.labels).map(([key, label]) => (
              <div key={key}>
                <dt className="font-semibold text-foreground">{label}</dt>
                <dd>{confidence.explanations[key as keyof typeof confidence.explanations]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            These are reporting labels, not identity claims. Visitor IDs are never merged on network
            or device evidence; where two IDs share a network we can only say “possible relationship
            — insufficient evidence”.
          </p>
        </details>
      </Block>

      <Block title="What they did">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Engaged"
            value={m.engagedSessions}
            note="Real intent or 2+ pages"
            onClick={() => openDetail("engaged", "Engaged Sessions", "Sessions with meaningful intent or at least two pageviews.")}
          />
          <Stat
            label="Used Torah"
            value={m.usedTorah}
            note="Opened, downloaded, shared or signed up"
            onClick={() => openDetail("usedTorah", "Used Torah", "Sessions with a qualifying Torah action.")}
          />
          <Stat
            label="PDF opens"
            value={m.pdfOpens}
            note="Viewer opened, not a download"
            onClick={() => openDetail("pdfOpens", "PDF Opens", "Every canonical PDF-open event in this period.")}
          />
          <Stat
            label="Download actions"
            value={m.downloads}
            note="Someone tapped download"
            onClick={() => openDetail("downloads", "Download Actions", "Every user-initiated download request.")}
          />
          <Stat
            label="Served download requests"
            value={m.downloadsServed}
            note="File redirect issued — not proof the file finished"
            onClick={() =>
              openDetail(
                "downloadsServed",
                "Served Download Requests",
                "The application validated the publication and issued the redirect to the file. It does not prove every byte transferred.",
              )
            }
          />
          <Stat
            label="Unmatched actions"
            value={m.downloadActionsUnmatched}
            note="Tapped but no served request recorded"
          />
          <Stat label="Chooser used" value={m.chooserSelections} note="Guided choices made" />
          <Stat label="My Table" value={m.myTableAdds} note={`${m.myTableOpens} opened the list`} />
          <Stat label="Signups" value={m.signups} note="Weekly email" />
        </div>
      </Block>

      <Block title="Acquisition">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Where they came from</h4>
            <ul className="mt-2 space-y-1 text-sm">
              {report.sources.slice(0, 6).map((source) => (
                <li key={source.label} className="flex justify-between">
                  <span>{source.label}</span>
                  <span>{source.sessions}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Exact link source</h4>
            {report.utmSources.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {report.utmSources.slice(0, 6).map((item) => (
                  <li key={item.label} className="flex justify-between gap-3">
                    <span className="break-all">{item.label}</span>
                    <span>{item.sessions}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No tagged links in this period.</p>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Campaigns</h4>
            {report.campaigns.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {report.campaigns.slice(0, 6).map((item) => (
                  <li key={item.label}>
                    <div className="flex justify-between gap-3">
                      <span className="break-all">{item.label}</span>
                      <span>{item.sessions}</span>
                    </div>
                    {item.variants.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-3 text-xs text-muted-foreground">
                        {item.variants.map((variant) => (
                          <li key={variant.content} className="flex justify-between gap-3">
                            <span className="break-all">variant: {variant.content}</span>
                            <span>{variant.sessions}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No named campaigns in this period.</p>
            )}
          </div>
        </div>
      </Block>

      <Block title="What worked">
        {report.publications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No publication activity in this period.</p>
        ) : (
          <ul className="space-y-4 text-sm">
            {report.publications.slice(0, 5).map((publication) => (
              <li key={publication.title} className="border-b border-border pb-3">
                <p className="font-medium text-foreground">{publication.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {publication.impressions} shown → {publication.clicks} selected →{" "}
                  {publication.pdfOpens} PDF opens → {publication.downloadActions} download actions →{" "}
                  {publication.downloadsServed} served
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Selection rate: {formatCountRate(publication.clickNumerator, publication.clickDenominator)} ·
                  Access to download: {formatCountRate(publication.downloadNumerator, publication.downloadDenominator)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {publication.newVisitorSessions} new · {publication.returningSessions} returning ·{" "}
                  {publication.devices.slice(0, 3).map((device) => `${device.label} (${device.sessions})`).join(" · ") || "device unknown"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Returning audience">
        {cohortError && <p className="text-sm text-destructive">{cohortError}</p>}
        {!cohorts && !cohortError && <p className="text-sm text-muted-foreground">Working out return rates…</p>}
        {cohorts && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {cohorts.cohorts.map((cohort) => (
                <div key={cohort.window} className="rounded-md border border-border p-3">
                  <span className="block text-xs font-semibold uppercase text-muted-foreground">
                    {cohort.window} return
                  </span>
                  <span className="mt-1 block font-serif text-xl font-bold text-primary">
                    {cohort.eligible === 0
                      ? "Not enough elapsed time yet"
                      : cohort.rate === null
                        ? `${cohort.returned} of ${cohort.eligible}`
                        : `${Math.round(cohort.rate * 100)}%`}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {cohort.returned} returned of {cohort.eligible} eligible
                    {cohort.immature > 0 ? ` · ${cohort.immature} too recent to judge` : ""}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Active in 2+ different weeks: {cohorts.loyalty.twoPlusWeeks} · 4+ weeks:{" "}
              {cohorts.loyalty.fourPlusWeeks} · of {cohorts.loyalty.visitorsConsidered} visitors seen in
              the last {cohorts.lookbackDays} days. Only visitors whose first visit we actually observed
              can enter a cohort, and percentages are hidden under 10 eligible visitors.
            </p>
          </div>
        )}
      </Block>

      <Block title="Recent story">
        {report.recentStories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meaningful visits to describe yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {report.recentStories.map((story, index) => (
              <li key={`${story.at}-${index}`} className="text-muted-foreground">
                {story.text}
              </li>
            ))}
          </ul>
        )}
        {report.locations.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Most common approximate locations: {report.locations.slice(0, 3).map((item) => item.label).join(" · ")}.
            Locations are derived from the network and may reflect a carrier, VPN or hosting exit rather
            than where the reader is.
          </p>
        )}
      </Block>

      <Block title="Tools">
        <div className="space-y-6">
          <InternalDeviceControl accessToken={accessToken} />
          <CampaignLinkBuilder defaultCampaign={data.rangeLabel} />
        </div>
      </Block>
    </div>
  );
}

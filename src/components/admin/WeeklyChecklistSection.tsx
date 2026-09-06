import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import PublishProgress, { type PublishResult } from "@/components/admin/PublishProgress";
import { useAuth } from "@/hooks/use-auth";
import { adminListPdfs } from "@/integrations/supabase/api.functions";

export type ChecklistStatus = "uploaded" | "skipped" | "missing";
export type ChecklistItem = { title: string; status: ChecklistStatus };

type WeeklyChecklistSectionProps = {
  currentParshaLabel: string;
  currentParshaKey: string | null;
  uploadedCount: number;
  countableTotal: number;
  checklist: ChecklistItem[];
  publishingWeek: boolean;
  unpublishedCount: number;
  onPublishAllForWeek: () => void;
  publishResults: PublishResult[] | null;
  onDismissPublishResults: () => void;
  onUseExpectedTitle: (title: string) => void;
  onToggleSkip: (title: string) => void;
};

type PdfLite = {
  parsha_key?: string | null;
  title?: string | null;
  jewish_year?: number | null;
  created_at?: string | null;
};

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9]+/g, "");

const TITLE_ALIASES: Record<string, string[]> = {
  parshaquestionsanswers: [
    "parshaquestionsanswers",
    "roshhashanahquestionsanswers",
    "roshhashanahqa",
  ],
  storiesfortheshabbostable: [
    "storiesfortheshabbostable",
    "storiesfortheyomtovtable",
  ],
};

export default function WeeklyChecklistSection({
  currentParshaLabel,
  currentParshaKey,
  uploadedCount,
  countableTotal,
  checklist,
  publishingWeek,
  unpublishedCount,
  onPublishAllForWeek,
  publishResults,
  onDismissPublishResults,
  onUseExpectedTitle,
  onToggleSkip,
}: WeeklyChecklistSectionProps) {
  const { session } = useAuth();
  const [verifiedTitles, setVerifiedTitles] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const accessToken = session?.access_token;
    if (!accessToken || !currentParshaKey) {
      setVerifiedTitles(null);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const result = await adminListPdfs({ data: { accessToken } });
        const rows = (result.pdfs ?? []) as PdfLite[];
        const targetParsha = normalize(currentParshaKey);
        const matching = rows
          .filter((row) => normalize(row.parsha_key) === targetParsha)
          .sort((a, b) =>
            String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
          );

        // Use the year of the newest PDF for this tracked collection. This is
        // more reliable around Rosh Hashanah than asking for the calendar's
        // current Jewish year before the holiday begins.
        const newestYear = matching.find((row) => typeof row.jewish_year === "number")?.jewish_year;
        const currentRows =
          typeof newestYear === "number"
            ? matching.filter((row) => row.jewish_year === newestYear)
            : matching;

        if (!cancelled) {
          setVerifiedTitles(
            new Set(currentRows.map((row) => normalize(row.title)).filter(Boolean)),
          );
        }
      } catch {
        if (!cancelled) setVerifiedTitles(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, currentParshaKey]);

  const effectiveChecklist = useMemo(() => {
    if (!verifiedTitles) return checklist;

    return checklist.map((item) => {
      if (item.status !== "missing") return item;
      const sourceKey = normalize(item.title);
      const accepted = TITLE_ALIASES[sourceKey] ?? [sourceKey];
      const found = accepted.some((key) => verifiedTitles.has(key));
      return found ? { ...item, status: "uploaded" as const } : item;
    });
  }, [checklist, verifiedTitles]);

  const effectiveUploadedCount = effectiveChecklist.filter(
    (item) => item.status === "uploaded",
  ).length;
  const effectiveCountableTotal = effectiveChecklist.filter(
    (item) => item.status !== "skipped",
  ).length;

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-primary">
            Weekly Upload Checklist
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tracking <span className="font-medium text-foreground">{currentParshaLabel}</span>
            {currentParshaKey ? ` (${currentParshaKey})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm font-medium text-primary">
            {effectiveUploadedCount || uploadedCount} uploaded
            <span className="text-muted-foreground font-normal">
              {" "}· {effectiveChecklist.length - effectiveCountableTotal} skipped ·{" "}
              {effectiveCountableTotal - effectiveUploadedCount} remaining
            </span>
          </div>
          <button
            type="button"
            onClick={onPublishAllForWeek}
            disabled={publishingWeek || unpublishedCount === 0}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={unpublishedCount === 0 ? "No draft PDFs for this parsha" : `Publish ${unpublishedCount} draft PDF${unpublishedCount === 1 ? "" : "s"} for this week`}
          >
            {publishingWeek
              ? "Publishing…"
              : `Publish All for This Week${unpublishedCount > 0 ? ` (${unpublishedCount})` : ""}`}
          </button>
        </div>
      </div>

      <PublishProgress
        publishResults={publishResults}
        publishingWeek={publishingWeek}
        onDismiss={onDismissPublishResults}
      />

      <ul className="mt-4 divide-y divide-accent/30">
        {effectiveChecklist.map((item) => (
          <li
            key={item.title}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1 basis-full sm:basis-auto">
              {item.status === "uploaded" && (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              )}
              {item.status === "missing" && (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              {item.status === "skipped" && (
                <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <span className="font-medium break-words min-w-0 flex-1">{item.title}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  item.status === "uploaded"
                    ? "bg-primary/10 text-primary"
                    : item.status === "skipped"
                      ? "bg-muted text-muted-foreground"
                      : "bg-accent/20 text-foreground"
                }`}
              >
                {item.status === "uploaded"
                  ? "Uploaded"
                  : item.status === "skipped"
                    ? "Skipped"
                    : "Missing"}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-8 sm:ml-0">
              {item.status === "missing" && (
                <button
                  type="button"
                  onClick={() => onUseExpectedTitle(item.title)}
                  className="text-xs underline text-primary"
                >
                  Use this title
                </button>
              )}
              {item.status !== "uploaded" && (
                <button
                  type="button"
                  onClick={() => onToggleSkip(item.title)}
                  className="text-xs rounded border border-accent/60 px-2 py-1 hover:bg-accent/10"
                >
                  {item.status === "skipped" ? "Unskip" : "Skip this week"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

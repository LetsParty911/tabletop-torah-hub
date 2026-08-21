import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import PublishProgress, { type PublishResult } from "@/components/admin/PublishProgress";

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
            {uploadedCount} uploaded
            <span className="text-muted-foreground font-normal">
              {" "}· {checklist.length - countableTotal} skipped ·{" "}
              {countableTotal - uploadedCount} remaining
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
        {checklist.map((item) => (
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

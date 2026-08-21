import React from "react";
import { Download, Eye } from "lucide-react";
import { formatTypeLabel } from "@/lib/format-labels";
import {
  AUDIENCE_OPTIONS,
  BADGE_OPTIONS,
  CONTENT_TYPE_OPTIONS,
  FORMAT_TYPE_OPTIONS,
  type PdfRow,
} from "@/lib/pdf-constants";
import WordCountHint from "@/components/admin/WordCountHint";

const getCurrentPdfFileName = (filePath: string | null | undefined): string => {
  if (!filePath) return "(no file)";
  const last = filePath.split("/").pop() || filePath;
  return last.replace(/^\d{10,}_/, "");
};

export type DescBulkState =
  | { status: "idle" }
  | { status: "running"; current: number; total: number; currentTitle: string }
  | {
      status: "done";
      total: number;
      successes: number;
      failures: Array<{ id: string; title: string; error: string }>;
    };

type PdfListSectionProps = {
  pdfs: PdfRow[];
  showAllPdfs: boolean;
  onToggleShowAllPdfs: () => void;
  yearFilter: string;
  onYearFilterChange: (value: string) => void;
  checklistParshaComparableKey: string | null;
  jewishYear: number | null;
  toParshaComparableKey: (value: string) => string;
  descBulk: DescBulkState;
  onGenerateAllDescriptions: () => void;

  editingPdfId: string | null;
  onStartEditPdf: (id: string) => void;
  onCancelEditPdf: () => void;
  onToggle: (id: string, published: boolean) => void;
  generatingSummaryId: string | null;
  onGenerateSummary: (p: PdfRow) => void;
  onDelete: (id: string) => void;

  replaceFile: File | null;
  onReplaceFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  replacing: boolean;
  onReplacePdf: (id: string) => void;

  editMetaTitle: string;
  onEditMetaTitleChange: (value: string) => void;
  editMetaSubtitle: string;
  onEditMetaSubtitleChange: (value: string) => void;
  editMetaDescription: string;
  onEditMetaDescriptionChange: (value: string) => void;
  editMetaAudience: string;
  onEditMetaAudienceChange: (value: string) => void;
  editMetaFeaturedSlot: string;
  onEditMetaFeaturedSlotChange: (value: string) => void;
  editMetaContentType: string;
  onEditMetaContentTypeChange: (value: string) => void;
  editMetaFormatType: string;
  onEditMetaFormatTypeChange: (value: string) => void;
  editMetaPageCount: string;
  onEditMetaPageCountChange: (value: string) => void;
  editMetaBadge: string;
  onEditMetaBadgeChange: (value: string) => void;
  savingMeta: boolean;
  onSaveMeta: (id: string) => void;
};

export default function PdfListSection({
  pdfs,
  showAllPdfs,
  onToggleShowAllPdfs,
  yearFilter,
  onYearFilterChange,
  checklistParshaComparableKey,
  jewishYear,
  toParshaComparableKey,
  descBulk,
  onGenerateAllDescriptions,
  editingPdfId,
  onStartEditPdf,
  onCancelEditPdf,
  onToggle,
  generatingSummaryId,
  onGenerateSummary,
  onDelete,
  replaceFile,
  onReplaceFileInputChange,
  replacing,
  onReplacePdf,
  editMetaTitle,
  onEditMetaTitleChange,
  editMetaSubtitle,
  onEditMetaSubtitleChange,
  editMetaDescription,
  onEditMetaDescriptionChange,
  editMetaAudience,
  onEditMetaAudienceChange,
  editMetaFeaturedSlot,
  onEditMetaFeaturedSlotChange,
  editMetaContentType,
  onEditMetaContentTypeChange,
  editMetaFormatType,
  onEditMetaFormatTypeChange,
  editMetaPageCount,
  onEditMetaPageCountChange,
  editMetaBadge,
  onEditMetaBadgeChange,
  savingMeta,
  onSaveMeta,
}: PdfListSectionProps) {
  const availableYears = Array.from(
    new Set(pdfs.map((p) => p.jewish_year).filter((y): y is number => !!y)),
  ).sort((a, b) => b - a);
  const thisWeekPdfs = pdfs.filter(
    (p) =>
      checklistParshaComparableKey != null &&
      toParshaComparableKey(p.parsha_key) === checklistParshaComparableKey &&
      (jewishYear == null || p.jewish_year === jewishYear),
  );
  const basePdfs = showAllPdfs ? pdfs : thisWeekPdfs;
  const filteredPdfs =
    showAllPdfs && yearFilter !== "all"
      ? basePdfs.filter((p) => String(p.jewish_year ?? "") === yearFilter)
      : basePdfs;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-2xl font-semibold text-primary">
            {showAllPdfs ? "All PDFs" : "This Week's PDFs"} ({filteredPdfs.length}
            {showAllPdfs && yearFilter !== "all" ? ` of ${pdfs.length}` : ""})
          </h2>
          <button
            type="button"
            onClick={onToggleShowAllPdfs}
            className="rounded-full border-2 border-accent/60 px-3 py-1 text-xs font-semibold text-primary hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {showAllPdfs ? "Show this week only" : "Show all PDFs"}
          </button>
        </div>
        {showAllPdfs && availableYears.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Jewish Year:</span>
            <select
              value={yearFilter}
              onChange={(e) => onYearFilterChange(e.target.value)}
              className="border rounded px-2 py-1 bg-background"
            >
              <option value="all">All years</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onGenerateAllDescriptions}
            disabled={descBulk.status === "running"}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {descBulk.status === "running"
              ? `Summarizing ${descBulk.current}/${descBulk.total}…`
              : "Summarize & categorize missing"}
          </button>
          {descBulk.status === "running" && (
            <span className="text-xs text-muted-foreground truncate max-w-[16rem]">
              {descBulk.currentTitle}
            </span>
          )}
          {descBulk.status === "done" && (
            <span className="text-xs text-muted-foreground">
              {descBulk.total === 0
                ? "Nothing missing — all set."
                : `Done: ${descBulk.successes}/${descBulk.total} updated${descBulk.failures.length ? `, ${descBulk.failures.length} failed` : ""}.`}
            </span>
          )}
        </div>
      </div>



      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th className="py-2 pr-3">Parshas</th>
              <th className="py-2 pr-3">Year</th>
              <th className="py-2 pr-3">Title</th>
              <th className="py-2 pr-3">Published</th>
              <th className="py-2 pr-3">Created</th>
              <th className="py-2 pr-3">Actions</th>
              <th className="py-2 text-right">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filteredPdfs.map((p) => (
              <React.Fragment key={p.id}>
              <tr className="border-b">
                <td className="py-2 pr-3">{p.parsha_key}</td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {p.jewish_year ?? "—"}
                </td>
                <td className="py-2 pr-3">
                  <div className="font-medium">{p.title}</div>
                  {p.subtitle && (
                    <div className="text-muted-foreground text-xs">{p.subtitle}</div>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => onToggle(p.id, !p.published)}
                    className={`px-2 py-1 rounded text-xs ${p.published ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                  >
                    {p.published ? "Yes" : "No"}
                  </button>
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="py-2 pr-3">
                  <a
                    href={`/view/${p.id}/download`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Download className="h-3 w-3" /> Download
                  </a>
                </td>
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() =>
                        editingPdfId === p.id ? onCancelEditPdf() : onStartEditPdf(p.id)
                      }
                      className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      {editingPdfId === p.id ? "Close" : "Edit / Replace"}
                    </button>
                    <button
                      onClick={() => onGenerateSummary(p)}
                      disabled={generatingSummaryId !== null}
                      className="inline-flex items-center gap-1 rounded-full border-2 border-accent px-2.5 py-1 text-xs font-semibold text-primary hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
                      title="Generate summary, content type, description & page count"
                    >
                      {generatingSummaryId === p.id ? "Working…" : "Summarize"}
                    </button>
                    <button
                      onClick={() => onDelete(p.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-destructive/70 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
              {editingPdfId === p.id && (
                <tr key={`${p.id}-edit`} className="border-b bg-muted/30">
                  <td colSpan={7} className="py-4 px-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-md border border-accent/60 bg-background p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Current PDF
                        </div>
                        <div
                          className="mt-1 break-all text-sm font-medium text-foreground"
                          title={p.file_path}
                        >
                          {getCurrentPdfFileName(p.file_path)}
                        </div>
                        <div className="mt-2">
                          <a
                            href={`/view/${p.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-primary/60 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                          >
                            <Eye className="h-3 w-3" /> View Current PDF
                          </a>
                        </div>
                      </div>
                      <div className="rounded-md border border-accent/60 bg-background p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Replace PDF
                        </div>
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={onReplaceFileInputChange}
                          className="mt-2 block w-full text-sm"
                        />
                        {replaceFile && (
                          <div className="mt-2 text-sm">
                            <div
                              className="font-medium break-all"
                              title={replaceFile.name}
                            >
                              {replaceFile.name}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              This will replace the current PDF when saved
                            </div>
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onReplacePdf(p.id)}
                            disabled={!replaceFile || replacing}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                          >
                            {replacing ? "Saving…" : "Save replacement"}
                          </button>
                          <button
                            type="button"
                            onClick={onCancelEditPdf}
                            disabled={replacing}
                            className="rounded-md border border-accent/60 px-3 py-1.5 text-xs font-medium text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-2 rounded-md border border-accent/60 bg-background p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                          Edit metadata
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-medium">Title</span>
                            <input
                              value={editMetaTitle}
                              onChange={(e) => onEditMetaTitleChange(e.target.value)}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium">Subtitle</span>
                            <input
                              value={editMetaSubtitle}
                              onChange={(e) => onEditMetaSubtitleChange(e.target.value)}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="block md:col-span-2">
                            <span className="text-xs font-medium">Description</span>
                            <input
                              value={editMetaDescription}
                              onChange={(e) => onEditMetaDescriptionChange(e.target.value)}
                              maxLength={500}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            />
                            <WordCountHint text={editMetaDescription} />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium">Audience</span>
                            <select
                              value={editMetaAudience}
                              onChange={(e) => onEditMetaAudienceChange(e.target.value)}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            >
                              <option value="">— none —</option>
                              {AUDIENCE_OPTIONS.map((o) => (
                                <option key={o} value={o}>{formatTypeLabel(o)}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium">Recommended pick slot</span>
                            <select
                              value={editMetaFeaturedSlot}
                              onChange={(e) => onEditMetaFeaturedSlotChange(e.target.value)}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            >
                              <option value="">— none —</option>
                              <option value="children">Best for Children</option>
                              <option value="family">Best for the Family Table</option>
                              <option value="quickest">Quickest Read</option>
                              <option value="deeper">Deeper Learning</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium">Content type</span>
                            <select
                              value={editMetaContentType}
                              onChange={(e) => onEditMetaContentTypeChange(e.target.value)}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            >
                              <option value="">— none —</option>
                              {CONTENT_TYPE_OPTIONS.map((o) => (
                                <option key={o} value={o}>{formatTypeLabel(o)}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium">Format</span>
                            <select
                              value={editMetaFormatType}
                              onChange={(e) => onEditMetaFormatTypeChange(e.target.value)}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            >
                              <option value="">— none —</option>
                              {FORMAT_TYPE_OPTIONS.map((o) => (
                                <option key={o} value={o}>{formatTypeLabel(o)}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium">Page count</span>
                            <input
                              type="number"
                              min={0}
                              value={editMetaPageCount}
                              onChange={(e) => onEditMetaPageCountChange(e.target.value)}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium">Highlight badge</span>
                            <select
                              value={editMetaBadge}
                              onChange={(e) => onEditMetaBadgeChange(e.target.value)}
                              className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                            >
                              <option value="">— none —</option>
                              {BADGE_OPTIONS.map((o) => (
                                <option key={o} value={o}>{formatTypeLabel(o)}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSaveMeta(p.id)}
                            disabled={savingMeta}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                          >
                            {savingMeta ? "Saving…" : "Save metadata"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
            {filteredPdfs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted-foreground">
                  {pdfs.length === 0 ? "No PDFs yet." : "No PDFs for this year."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

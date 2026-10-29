import { formatTypeLabel } from "@/lib/format-labels";
import { PARSHIYOS } from "@/lib/parshiyos";
import { AUDIENCE_OPTIONS, FORMAT_TYPE_OPTIONS } from "@/lib/pdf-constants";
import WordCountHint from "@/components/admin/WordCountHint";

export type CanonicalPub = {
  id: string;
  name: string;
  publisher: string | null;
  default_audience: string | null;
  default_format_type: string | null;
  default_description?: string | null;
  sort_order: number;
  active: boolean;
};

export type UploadResult = {
  id: string;
  title: string;
  parsha: string;
  jewishYear: number;
  published: boolean;
};

type UploadPdfFormProps = {
  // Default submit (Enter / primary button) = Upload & Publish.
  onSubmit: (e: React.FormEvent) => void;
  onSaveDraft: () => void;
  uploadParshaReady: boolean;
  parshaKey: string;
  onParshaChange: (value: string) => void;
  canonicalPubs: CanonicalPub[];
  titleFreeText: boolean;
  publicationId: string;
  onPublicationSelectValue: (value: string) => void;
  onChooseFromPublications: () => void;
  title: string;
  onTitleChange: (value: string) => void;
  uploadAudience: string;
  onUploadAudienceChange: (value: string) => void;
  uploadFormatType: string;
  onUploadFormatTypeChange: (value: string) => void;
  showUploadDetails: boolean;
  onToggleDetails: () => void;
  uploadDescription: string;
  onUploadDescriptionChange: (value: string) => void;
  onFileInputChange: (file: File | null) => void;
  busyAction: "publish" | "draft" | null;
  uploadResult: UploadResult | null;
  msg: { kind: "success" | "error"; text: string } | null;
};

export default function UploadPdfForm({
  onSubmit,
  onSaveDraft,
  uploadParshaReady,
  parshaKey,
  onParshaChange,
  canonicalPubs,
  titleFreeText,
  publicationId,
  onPublicationSelectValue,
  onChooseFromPublications,
  title,
  onTitleChange,
  uploadAudience,
  onUploadAudienceChange,
  uploadFormatType,
  onUploadFormatTypeChange,
  showUploadDetails,
  onToggleDetails,
  uploadDescription,
  onUploadDescriptionChange,
  onFileInputChange,
  busyAction,
  uploadResult,
  msg,
}: UploadPdfFormProps) {
  const busy = busyAction !== null;
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className="text-sm font-medium">Parshas</span>
        {!uploadParshaReady ? (
          <div className="mt-1 rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm text-muted-foreground">
            Loading current parsha…
          </div>
        ) : (
          <select
            required
            value={parshaKey}
            onChange={(e) => onParshaChange(e.target.value)}
            className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
          >
            {!parshaKey && (
              <option value="" disabled>
                Select a parsha
              </option>
            )}
            {PARSHIYOS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </label>
      <div className="block">
        <label className="block">
          <span className="text-sm font-medium">Publication</span>
          {canonicalPubs.length > 0 && !titleFreeText ? (
            <select
              required
              value={publicationId}
              onChange={(e) => onPublicationSelectValue(e.target.value)}
              className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
            >
              <option value="" disabled>
                Select a publication
              </option>
              {canonicalPubs
                .filter((p) => p.active)
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              <option value="__other__">Other (type a title)…</option>
            </select>
          ) : (
            <>
              <input
                required
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
              />
              {canonicalPubs.length > 0 && (
                <button
                  type="button"
                  onClick={onChooseFromPublications}
                  className="mt-1 text-xs font-semibold text-accent underline"
                >
                  Choose from publications instead
                </button>
              )}
            </>
          )}
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {[formatTypeLabel(uploadAudience), formatTypeLabel(uploadFormatType)]
              .filter(Boolean)
              .join(" · ") || "No defaults set"}
          </span>
          <button
            type="button"
            onClick={onToggleDetails}
            className="font-semibold text-accent underline"
          >
            {showUploadDetails ? "Hide details" : "Edit details"}
          </button>
        </div>
      </div>
      {showUploadDetails && (
        <>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium">Description</span>
            <input
              value={uploadDescription}
              onChange={(e) => onUploadDescriptionChange(e.target.value)}
              maxLength={500}
              placeholder="e.g. Short vorts drawn from the classic meforshim."
              className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
            />
            <WordCountHint text={uploadDescription} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Audience</span>
            <select
              value={uploadAudience}
              onChange={(e) => onUploadAudienceChange(e.target.value)}
              className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
            >
              <option value="">— none —</option>
              {AUDIENCE_OPTIONS.map((o) => (
                <option key={o} value={o}>{formatTypeLabel(o)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Format</span>
            <select
              value={uploadFormatType}
              onChange={(e) => onUploadFormatTypeChange(e.target.value)}
              className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
            >
              <option value="">— none —</option>
              {FORMAT_TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>{formatTypeLabel(o)}</option>
              ))}
            </select>
          </label>
        </>
      )}

      <label className="block md:col-span-2">
        <span className="text-sm font-medium">PDF file</span>
        <input
          id="pdf-file-input"
          required
          type="file"
          accept="application/pdf"
          onChange={(e) => onFileInputChange(e.target.files?.[0] ?? null)}
          className="mt-1 w-full"
        />
      </label>
      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50"
        >
          {busyAction === "publish" ? "Uploading & publishing…" : "Upload & Publish"}
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={busy}
          className="rounded-full border-2 border-primary px-6 py-2 text-primary disabled:opacity-50"
        >
          {busyAction === "draft" ? "Saving draft…" : "Save as Draft"}
        </button>
        {msg && (
          <span
            className={
              msg.kind === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
            role={msg.kind === "error" ? "alert" : "status"}
          >
            {msg.text}
          </span>
        )}
      </div>
      {uploadResult && (
        <div
          className="md:col-span-2 rounded-md border-2 border-accent/60 bg-background p-4"
          role="status"
        >
          <p className="text-sm font-semibold text-primary">
            {uploadResult.published
              ? "Published — visible to readers"
              : "Saved as draft — not visible to readers"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {uploadResult.title} · Parshas {uploadResult.parsha} · {uploadResult.jewishYear}
          </p>
          {uploadResult.published ? (
            <a
              href={`/view/${uploadResult.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-semibold text-accent underline"
            >
              Open PDF
            </a>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Publish it later from the PDF list below.
            </p>
          )}
        </div>
      )}
    </form>
  );
}

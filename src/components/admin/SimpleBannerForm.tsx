type SimpleBannerFormProps = {
  title: string;
  description: string;
  onSubmit: (e: React.FormEvent) => void;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  enableLabel: string;
  text: string;
  onTextChange: (value: string) => void;
  textLabel: string;
  textPlaceholder: string;
  linkUrl: string;
  onLinkUrlChange: (value: string) => void;
  linkLabel: string;
  onLinkLabelChange: (value: string) => void;
  linkLabelPlaceholder: string;
  linkHint: string;
  busy: boolean;
  saveButtonLabel: string;
};

export default function SimpleBannerForm({
  title,
  description,
  onSubmit,
  enabled,
  onEnabledChange,
  enableLabel,
  text,
  onTextChange,
  textLabel,
  textPlaceholder,
  linkUrl,
  onLinkUrlChange,
  linkLabel,
  onLinkLabelChange,
  linkLabelPlaceholder,
  linkHint,
  busy,
  saveButtonLabel,
}: SimpleBannerFormProps) {
  return (
    <>
      <h2 className="font-serif text-2xl font-semibold text-primary">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-medium">{enableLabel}</span>
        </label>

        <div>
          <label className="block text-sm font-medium mb-1">{textLabel}</label>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={textPlaceholder}
            className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Link URL (optional)</label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => onLinkUrlChange(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Link Label (optional)</label>
            <input
              type="text"
              value={linkLabel}
              onChange={(e) => onLinkLabelChange(e.target.value)}
              maxLength={120}
              placeholder={linkLabelPlaceholder}
              className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{linkHint}</p>

        <button
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {saveButtonLabel}
        </button>
      </form>
    </>
  );
}

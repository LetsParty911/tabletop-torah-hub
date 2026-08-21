export type WnpItem = { title: string; description: string; linkUrl: string; linkLabel: string };

type WhatsNewPopupFormProps = {
  wnpVersion: string;
  onSubmit: (e: React.FormEvent) => void;
  wnpEnabled: boolean;
  onWnpEnabledChange: (value: boolean) => void;
  wnpHeading: string;
  onWnpHeadingChange: (value: string) => void;
  wnpItems: WnpItem[];
  onUpdateItem: (idx: number, patch: Partial<WnpItem>) => void;
  onAddItem: () => void;
  onRemoveItem: (idx: number) => void;
  busy: boolean;
};

export default function WhatsNewPopupForm({
  wnpVersion,
  onSubmit,
  wnpEnabled,
  onWnpEnabledChange,
  wnpHeading,
  onWnpHeadingChange,
  wnpItems,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  busy,
}: WhatsNewPopupFormProps) {
  return (
    <>
      <h2 className="font-serif text-2xl font-semibold text-primary">
        What&rsquo;s New Popup
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        A centered modal shown on the homepage. Up to 4 items. Editing and saving auto-bumps the version so returning visitors see the update.
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Current version: <code className="font-mono">{wnpVersion}</code>
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={wnpEnabled}
            onChange={(e) => onWnpEnabledChange(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="font-medium">Enable What&rsquo;s New popup</span>
        </label>

        <div>
          <label className="block text-sm font-medium mb-1">Heading</label>
          <input
            type="text"
            value={wnpHeading}
            onChange={(e) => onWnpHeadingChange(e.target.value)}
            maxLength={200}
            placeholder="What's New"
            className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
          />
        </div>

        <div className="space-y-4">
          {wnpItems.map((item, idx) => (
            <div
              key={idx}
              className="rounded-md border-2 border-accent/40 bg-background/50 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-primary">Item {idx + 1}</span>
                {wnpItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(idx)}
                    className="text-xs text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                value={item.title}
                onChange={(e) => onUpdateItem(idx, { title: e.target.value })}
                maxLength={200}
                placeholder="Title (required)"
                className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm"
              />
              <textarea
                value={item.description}
                onChange={(e) => onUpdateItem(idx, { description: e.target.value })}
                rows={2}
                maxLength={500}
                placeholder="Description (optional)"
                className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="url"
                  value={item.linkUrl}
                  onChange={(e) => onUpdateItem(idx, { linkUrl: e.target.value })}
                  placeholder="Link URL (optional)"
                  className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={item.linkLabel}
                  onChange={(e) => onUpdateItem(idx, { linkLabel: e.target.value })}
                  maxLength={120}
                  placeholder="Link label (optional)"
                  className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          ))}
        </div>

        {wnpItems.length < 4 && (
          <button
            type="button"
            onClick={onAddItem}
            className="rounded-md border-2 border-accent/60 bg-background px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent/10"
          >
            + Add item ({wnpItems.length}/4)
          </button>
        )}

        <button
          disabled={busy}
          className="block rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Save popup
        </button>
      </form>
    </>
  );
}

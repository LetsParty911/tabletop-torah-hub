export type ChecklistSource = {
  id: string;
  title: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  publication_id?: string | null;
};

type ManageChecklistSourcesSectionProps = {
  sources: ChecklistSource[];
  newSourceTitle: string;
  onNewSourceTitleChange: (value: string) => void;
  onAddSource: (e: React.FormEvent) => void;
  busy: boolean;
  onSourceSortChange: (id: string, sortOrder: number) => void;
  onSourceTitleChange: (id: string, title: string) => void;
  onToggleSourceActive: (id: string, active: boolean) => void;
  onDeleteSource: (id: string, title: string) => void;
};

export default function ManageChecklistSourcesSection({
  sources,
  newSourceTitle,
  onNewSourceTitleChange,
  onAddSource,
  busy,
  onSourceSortChange,
  onSourceTitleChange,
  onToggleSourceActive,
  onDeleteSource,
}: ManageChecklistSourcesSectionProps) {
  return (
    <>
      <h2 className="font-serif text-2xl font-semibold text-primary">
        Manage Weekly Checklist Sources
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        The list below controls what appears in the Weekly Upload Checklist. Lower sort order
        shows first. Inactive sources are hidden but kept for history.
      </p>

      <form onSubmit={onAddSource} className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          value={newSourceTitle}
          onChange={(e) => onNewSourceTitleChange(e.target.value)}
          placeholder="New source title (e.g., Torah Wellsprings)"
          className="flex-1 rounded-md border-2 border-accent/60 bg-background px-3 py-2"
        />
        <button
          disabled={busy || !newSourceTitle.trim()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Add source
        </button>
      </form>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">

          <thead className="text-left border-b">
            <tr>
              <th className="py-2 pr-3 w-20">Order</th>
              <th className="py-2 pr-3">Title</th>
              <th className="py-2 pr-3 w-28">Active</th>
              <th className="py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    defaultValue={s.sort_order}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v) && v !== s.sort_order) {
                        onSourceSortChange(s.id, v);
                      }
                    }}
                    className="w-16 rounded border border-accent/60 bg-background px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    defaultValue={s.title}
                    placeholder="Edit title…"
                    title="Click to edit. Press Enter or click away to save."
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v.trim() && v.trim() !== s.title) {
                        onSourceTitleChange(s.id, v);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full rounded-md border-2 border-accent bg-background px-3 py-1.5 font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => onToggleSourceActive(s.id, !s.active)}
                    className={`px-2 py-1 rounded text-xs ${
                      s.active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {s.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => onDeleteSource(s.id, s.title)}
                    className="text-destructive underline text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  No checklist sources yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

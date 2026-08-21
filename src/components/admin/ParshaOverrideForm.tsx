import { PARSHIYOS } from "@/lib/parshiyos";

type ParshaOverrideFormProps = {
  onSubmit: (e: React.FormEvent) => void;
  override: string;
  onOverrideChange: (value: string) => void;
  busy: boolean;
};

export default function ParshaOverrideForm({
  onSubmit,
  override,
  onOverrideChange,
  busy,
}: ParshaOverrideFormProps) {
  return (
    <>
      <h2 className="font-serif text-2xl font-semibold text-primary">Manual Parshas Override</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Leave empty to use Hebcal's automatic Parshas. An override only applies to the current week's Shabbos — once that Shabbos passes, Hebcal automatically takes over again.
      </p>
      <form onSubmit={onSubmit} className="mt-4 flex gap-3">
        <input
          value={override}
          onChange={(e) => onOverrideChange(e.target.value)}
          list="parsha-list"
          placeholder="(empty = automatic)"
          className="flex-1 rounded-md border-2 border-accent/60 bg-background px-3 py-2"
        />
        <datalist id="parsha-list">
          {PARSHIYOS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <button
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
      </form>
    </>
  );
}

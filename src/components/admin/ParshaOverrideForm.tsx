import { PARSHIYOS } from "@/lib/parshiyos";
import { Button } from "@/components/ui/button";

type ParshaOverrideFormProps = {
  onSubmit: (e: React.FormEvent) => void;
  override: string;
  onOverrideChange: (value: string) => void;
  busy: boolean;
  staleOverride: string | null;
  explicitOverride: boolean;
  onExplicitOverrideChange: (value: boolean) => void;
  currentReadingLabel: string;
  currentReadingDate: string | null;
};

export default function ParshaOverrideForm({
  onSubmit,
  override,
  onOverrideChange,
  busy,
  staleOverride,
  explicitOverride,
  onExplicitOverrideChange,
  currentReadingLabel,
  currentReadingDate,
}: ParshaOverrideFormProps) {
  return (
    <>
      <h2 className="font-serif text-2xl font-semibold text-primary">Manual Parshas Override</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Leave empty to use Hebcal's automatic Parshas. An override only applies to the current week's Shabbos — once that Shabbos passes, Hebcal automatically takes over again.
      </p>
      {staleOverride && <p className="mt-3 text-sm text-muted-foreground">Archived override: {staleOverride} (inactive). Automatic reading is selected. Save with the field empty to clear the archived value.</p>}
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-3">
        <input
          aria-label="Manual parsha override"
          value={override}
          onChange={(e) => onOverrideChange(e.target.value)}
          list="parsha-list"
          placeholder="(empty = automatic)"
          className="min-w-0 flex-1 rounded-md border-2 border-accent/60 bg-background px-3 py-2"
        />
        <datalist id="parsha-list">
          {PARSHIYOS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <Button disabled={busy} type="submit">{staleOverride && !override.trim() ? "Clear archived override" : "Save"}</Button>
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={explicitOverride} disabled={busy || !override.trim()} onChange={e => onExplicitOverrideChange(e.target.checked)} className="mt-1" />
          I intentionally want this manual reading for {currentReadingDate ?? "the current week"} instead of {currentReadingLabel} if it differs from Hebcal (including special Yom Tov cases).
        </label>
      </form>
    </>
  );
}

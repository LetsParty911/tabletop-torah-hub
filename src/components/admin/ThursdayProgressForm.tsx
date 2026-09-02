const STEPS = [0, 25, 50, 75, 95, 100] as const;
type FillStep = (typeof STEPS)[number];

type ThursdayProgressFormProps = {
  fillStep: FillStep;
  onFillStepChange: (step: FillStep) => void;
  etaLocal: string; // value for <input type="datetime-local">, "" if unset
  onEtaLocalChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
};

export default function ThursdayProgressForm({
  fillStep,
  onFillStepChange,
  etaLocal,
  onEtaLocalChange,
  onSubmit,
  busy,
}: ThursdayProgressFormProps) {
  return (
    <>
      <h2 className="font-serif text-2xl font-semibold text-primary">
        Thursday Upload Progress
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Lets visitors see how much of this week&apos;s Divrei Torah has been uploaded.
        The ETA line hides itself automatically once it passes; the meter stays visible.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Progress</label>
          <div className="flex gap-2">
            {STEPS.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => onFillStepChange(step)}
                className={
                  "flex-1 rounded-md border-2 py-2 text-sm font-semibold transition-colors " +
                  (fillStep === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-accent/60 bg-background text-primary hover:bg-accent/10")
                }
              >
                {step}%
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Expected final upload (optional)
          </label>
          <input
            type="datetime-local"
            value={etaLocal}
            onChange={(e) => onEtaLocalChange(e.target.value)}
            className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
          />
        </div>

        <button
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Save Progress
        </button>
      </form>
    </>
  );
}

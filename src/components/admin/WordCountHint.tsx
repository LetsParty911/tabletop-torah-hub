/** Small live word-count hint shown under one-sentence description fields. */
export default function WordCountHint({
  text,
  min = 12,
  max = 22,
}: {
  text: string;
  min?: number;
  max?: number;
}) {
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  const overMax = words > max;
  return (
    <div className="mt-1 flex items-center justify-between text-xs">
      <span className="text-muted-foreground">
        One sentence, {min}–{max} words.
      </span>
      <span className={overMax ? "font-medium text-amber-600" : "text-muted-foreground"}>
        {words} word{words === 1 ? "" : "s"}
      </span>
    </div>
  );
}

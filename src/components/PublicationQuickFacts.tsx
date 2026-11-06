/** Brief, source-grounded reading cues shown before each publication's description. */
type PublicationQuickFactsProps = {
  audience?: string | null;
  format?: string | null;
  length?: string | null;
};

type QuickFact = { key: "audience" | "format" | "length"; text: string };

export function getPublicationQuickFacts({ audience, format, length }: PublicationQuickFactsProps): QuickFact[] {
  const facts: QuickFact[] = [];
  const who = audience?.trim();
  const kind = format?.trim();
  const size = length?.trim();
  if (who) facts.push({ key: "audience", text: /^for\s/i.test(who) ? who : `For ${who}` });
  if (kind) facts.push({ key: "format", text: kind });
  if (size) facts.push({ key: "length", text: size });
  return facts;
}

export function PublicationQuickFacts(props: PublicationQuickFactsProps) {
  const facts = getPublicationQuickFacts(props);
  if (facts.length === 0) return null;
  return (
    <ul aria-label="Selection at a glance" className="mt-2 flex flex-wrap gap-1.5">
      {facts.map((fact) => (
        <li key={fact.key} className="rounded-md border border-accent/30 bg-accent/5 px-2 py-1 text-xs font-medium leading-snug text-primary">
          {fact.text}
        </li>
      ))}
    </ul>
  );
}

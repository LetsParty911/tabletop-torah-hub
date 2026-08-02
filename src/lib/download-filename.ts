// Shared download filename builder.
// Format: TorahForTheTable.com_Parshas-{Parsha}_{PublicationName}.pdf
// Spaces become hyphens; characters illegal in filenames are stripped.

function sanitizeSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildDownloadFilename(
  parshaKey: string | null | undefined,
  publicationName: string | null | undefined,
): string {
  const parsha = sanitizeSegment(
    (parshaKey || "").replace(/^(parshas|parashat|parsha)\s+/i, ""),
  );
  // `publication` may be an internal slug; map it to the human-readable name.
  const display = publicationLabel(publicationName) || publicationName;
  const pub = sanitizeSegment(display || "Publication") || "Publication";
  const parts = ["TorahForTheTable.com"];
  if (parsha) parts.push(`Parshas-${parsha}`);
  parts.push(pub);
  return `${parts.join("_")}.pdf`;
}

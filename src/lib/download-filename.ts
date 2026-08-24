import { publicationLabel } from "@/lib/badges";

// Shared download filename builder.
// Format: Parshas-{Parsha}_{PublicationName}.pdf
// Spaces become hyphens; characters illegal in filenames are stripped.
//
// Deliberately does NOT prefix "TorahForTheTable.com_": on a phone's
// Downloads list, that alone ate ~39 characters before any distinguishing
// text appeared, so every file looked identical once the list truncated
// long names. The domain is already shown as the download source in every
// browser's UI, and every PDF carries the site's branding in its own
// header/footer, so repeating it in the filename added no real information
// - only pushed the useful part (parsha/publication) past the visible cutoff.

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
  const parts: string[] = [];
  if (parsha) parts.push(`Parshas-${parsha}`);
  parts.push(pub);
  return `${parts.join("_")}.pdf`;
}

import { formatReadingLabel } from "@/lib/parshiyos";

/**
 * Accessible names for PDF actions (pure; unit tested). Many series reuse the
 * same title every week, so the reading and year are appended when known and
 * not already part of the title — each action names its own PDF.
 */
export function pdfActionLabel(
  action: "open" | "download",
  title: string,
  parsha?: string | null,
  jewishYear?: number | null,
  visibleLabel?: string,
): string {
  const verb = action === "open"
    ? visibleLabel?.trim() ? `${visibleLabel.trim()} (opens PDF in a new tab)` : "Open PDF in a new tab"
    : "Download PDF";
  const reading = parsha?.trim() ? formatReadingLabel(parsha.trim()) : null;
  const readingName = reading?.replace(/^Parshas\s+/i, "") ?? "";
  const showReading = reading && !title.toLowerCase().includes(readingName.toLowerCase());
  const context = [showReading ? reading : null, jewishYear ? String(jewishYear) : null].filter(Boolean).join(" ");
  return context ? `${verb}: ${title}, ${context}` : `${verb}: ${title}`;
}

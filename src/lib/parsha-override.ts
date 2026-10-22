import { toParshaComparableKeys } from "./parsha-normalize";

/** This timestamp is reserved for explicit override saves, not general settings edits. */
export function isOverrideCurrent(updatedAt: string | null, readingDate: string | null): boolean {
  if (!updatedAt || !readingDate) return false;
  const updated = new Date(updatedAt);
  const reading = new Date(`${readingDate}T12:00:00Z`);
  if (!Number.isFinite(updated.getTime()) || !Number.isFinite(reading.getTime())) return false;
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(updated);
  reading.setUTCDate(reading.getUTCDate() - 6);
  return local >= reading.toISOString().slice(0, 10) && local <= readingDate;
}

/** Off-calendar/custom/Yom Tov overrides stay possible, but require a week-bound acknowledgement. */
export function validateParshaOverride(override: string | null, currentKey: string | null, readingDate: string | null, confirmedReadingDate?: string | null) {
  const value = override?.trim() || null;
  if (!value) return null;
  if (!currentKey || !readingDate) throw new Error("The current reading could not be verified. Try again before saving a manual override.");
  const matches = toParshaComparableKeys(value).includes(toParshaComparableKeys(currentKey)[0] ?? "");
  if (!matches && confirmedReadingDate !== readingDate) {
    throw new Error(`This differs from the current Hebcal reading (${currentKey}). Explicitly confirm the manual override for ${readingDate}.`);
  }
  return value;
}

export function editableParshaOverride(saved: { override: string | null; isActive: boolean }) {
  return saved.isActive ? saved.override ?? "" : "";
}
import { leadWithPublicationTitle } from "@/lib/publication-description";

export function viewDescription(title: string, copy: string | null | undefined, parsha: string | null, year: number | null): string {
  const context = [parsha, year].filter(Boolean).join(" ");
  const prefix = context ? `${title} — ${context}. ` : `${title}. `;
  const body = leadWithPublicationTitle(title, copy)?.replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—–.-]?\\s*`, "i"), "") ?? "Free printable Divrei Torah from Torah For The Table.";
  const text = prefix + body.charAt(0).toUpperCase() + body.slice(1);
  if (text.length <= 160) return text;
  const cut = text.slice(0, 159);
  const space = cut.lastIndexOf(" ");
  return `${(space > 100 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
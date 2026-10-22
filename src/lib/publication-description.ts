import { standardizeCopy } from "@/lib/standardize-copy";

/**
 * Begin public-facing descriptions and summaries with the displayed title.
 *
 * This changes presentation only, leaving editorial database fields,
 * publication names, PDFs and original author text unchanged.
 */
export function leadWithPublicationTitle(
  title: string | null | undefined,
  copy: string | null | undefined,
): string | null {
  const body = standardizeCopy(copy)?.trim();
  if (!body) return null;
  const name = title?.trim();
  if (!name) return body;

  // Do not prepend the name twice or alter a proper name's capitalization.
  const alreadyNamed =
    body.slice(0, name.length).toLocaleLowerCase() === name.toLocaleLowerCase() &&
    (body.length === name.length || /^[\s,.:;!?—–-]/.test(body.slice(name.length)));
  if (alreadyNamed) return name + body.slice(name.length);

  // Replace the impersonal subject and retain the existing descriptive verb.
  const genericSubject = body.match(
    /^(?:(?:this|the)\s+(?:publication|dvar torah|torah sheet|essay|article|piece|story|pdf|drasha|issue|sheet))\b/i,
  );
  if (genericSubject) return name + body.slice(genericSubject[0].length);

  // Retain the existing characterization rather than fabricating new claims.
  if (/^an?\s+publication\s+featuring\b/i.test(body)) {
    return name + body.replace(/^an?\s+publication\s+featuring\b/i, " features");
  }
  if (/^an?\s+collection\s+of\b/i.test(body)) {
    return name + " offers " + body[0].toLowerCase() + body.slice(1);
  }
  if (/^an?\s+/i.test(body)) {
    return name + " is " + body[0].toLowerCase() + body.slice(1);
  }
  if (/^(?:weekly|daily|short|brief|source-based|two pages of|three pages of)\b/i.test(body)) {
    return name + " features " + body[0].toLowerCase() + body.slice(1);
  }

  // For a sentence without a safely replaceable subject, use a readable
  // title-first separator instead of forcing potentially incorrect grammar.
  return name + " — " + body;
}

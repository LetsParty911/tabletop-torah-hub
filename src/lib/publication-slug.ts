export function publicationSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

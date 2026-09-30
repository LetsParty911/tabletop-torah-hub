// Shared PDF row shape and admin-editable option lists. Lives here (not in
// src/routes/admin.tsx) so admin components can import the single source of
// truth without depending on a route file.

export type PdfRow = {
  id: string;
  parsha_key: string;
  title: string;
  subtitle: string | null;
  file_path: string;
  published: boolean;
  jewish_year: number | null;
  created_at: string;
  summary_quick: string | null;
  content_type: string | null;
  primary_category?: string | null;
  publication?: string | null;
  publication_id?: string | null;

  tags?: string[] | null;
  description?: string | null;
  audience?: string | null;
  featured_slot?: string | null;
  format_type?: string | null;
  page_count?: number | null;
  badge?: string | null;
};

export const AUDIENCE_OPTIONS = ["Adults", "Families", "Children"] as const;
export const FORMAT_TYPE_OPTIONS = ["Short Vorts", "Stories", "Halacha", "Essays"] as const;
export const CONTENT_TYPE_OPTIONS = [
  "Questions & Answers",
  "Brief Insights",
  "Stories",
  "Parsha Essays",
  "Halacha",
  "In-Depth",
  "Mixed Collection",
] as const;
export const BADGE_OPTIONS = ["Recommended", "Quick Read", "Kids' Pick"] as const;

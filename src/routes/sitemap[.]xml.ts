import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { publicationSlug } from "@/lib/publication-slug";
import { readingPagePath } from "@/lib/reading-page";

const SITE_URL = "https://torahforthetable.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toLastmod(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // No <lastmod> for static pages: there is no page-specific timestamp
        // to derive it from, and a generation-time date would be misleading.
        // Admin, offline, api, and /view/<id>/download are intentionally excluded.
        const urls: Array<{ loc: string; lastmod: string | null; priority: string }> = [
          { loc: `${SITE_URL}/`, lastmod: null, priority: "1.0" },
          { loc: `${SITE_URL}/archive`, lastmod: null, priority: "0.8" },
          { loc: `${SITE_URL}/publications`, lastmod: null, priority: "0.7" },
          { loc: `${SITE_URL}/short-vorts`, lastmod: null, priority: "0.5" },
          { loc: `${SITE_URL}/resources`, lastmod: null, priority: "0.7" },
          { loc: `${SITE_URL}/about`, lastmod: null, priority: "0.5" },
          { loc: `${SITE_URL}/contact`, lastmod: null, priority: "0.5" },
          { loc: `${SITE_URL}/privacy`, lastmod: null, priority: "0.5" },
        ];

        try {
          const admin = getSupabaseAdmin();

          const pubs = await admin
            .from("publications")
            .select("id, name")
            .eq("active", true)
            .order("name", { ascending: true });
          if (!pubs.error) {
            const linked = await admin
              .from("pdfs")
              .select("publication_id")
              .eq("published", true)
              .not("publication_id", "is", null);
            const linkedIds = new Set(
              (linked.data ?? [])
                .map((row: any) => row.publication_id as string | null)
                .filter((id: any): id is string => Boolean(id)),
            );
            for (const pub of pubs.data ?? []) {
              if (!linkedIds.has(pub.id as string)) continue;
              urls.push({
                loc: `${SITE_URL}/publication/${publicationSlug(pub.name as string)}`,
                lastmod: null,
                priority: "0.7",
              });
            }
          } else {
            console.error("sitemap publications query error", pubs.error);
          }

          // Prefer updated_at > week_of > created_at. updated_at / week_of may
          // not exist in all environments; fall back progressively.
          type PdfRow = {
            id: string;
            parsha_key: string | null;
            jewish_year: number | null;
            created_at: string | null;
            week_of?: string | null;
            updated_at?: string | null;
          };
          let rows: PdfRow[] = [];
          const full = await admin
            .from("pdfs")
            .select("id, parsha_key, jewish_year, created_at, week_of, updated_at")
            .eq("published", true);
          if (full.error) {
            const noUpdated = await admin
              .from("pdfs")
              .select("id, parsha_key, jewish_year, created_at, week_of")
              .eq("published", true);
            if (noUpdated.error) {
              const base = await admin
                .from("pdfs")
                .select("id, parsha_key, jewish_year, created_at")
                .eq("published", true);
              if (base.error) {
                console.error("sitemap pdfs query error", base.error);
              } else {
                rows = (base.data ?? []) as unknown as PdfRow[];
              }
            } else {
              rows = (noUpdated.data ?? []) as unknown as PdfRow[];
            }
          } else {
            rows = (full.data ?? []) as unknown as PdfRow[];
          }

          const collectionPaths = new Set<string>();
          for (const row of rows) {
            const best =
              toLastmod(row.updated_at) ??
              toLastmod(row.week_of) ??
              toLastmod(row.created_at);
            urls.push({
              loc: `${SITE_URL}/view/${row.id}`,
              lastmod: best,
              priority: "0.6",
            });

            if (row.parsha_key && row.jewish_year) {
              collectionPaths.add(readingPagePath(row.parsha_key, row.jewish_year));
            }
          }

          for (const path of collectionPaths) {
            urls.push({
              loc: `${SITE_URL}${path}`,
              lastmod: null,
              priority: "0.8",
            });
          }
        } catch (e) {
          console.error("sitemap unexpected error", e);
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => {
    const lastmodTag = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : "";
    return `  <url>\n    <loc>${escapeXml(u.loc)}</loc>${lastmodTag}\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;
  })
  .join("\n")}
</urlset>
`;

        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=0, s-maxage=3600",
          },
        });
      },
    },
  },
});

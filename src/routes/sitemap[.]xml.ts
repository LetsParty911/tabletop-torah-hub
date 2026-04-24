import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

const SITE_URL = "https://torahforthetable.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toLastmod(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (isNaN(d.getTime())) return fallback;
  return d.toISOString().split("T")[0];
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const today = new Date().toISOString().split("T")[0];
        const urls: Array<{ loc: string; lastmod: string }> = [
          { loc: `${SITE_URL}/`, lastmod: today },
          { loc: `${SITE_URL}/archive`, lastmod: today },
          { loc: `${SITE_URL}/about`, lastmod: today },
          { loc: `${SITE_URL}/contact`, lastmod: today },
        ];

        try {
          const admin = getSupabaseAdmin();
          const { data: rows, error } = await admin
            .from("pdfs")
            .select("id, created_at, updated_at")
            .eq("published", true);
          if (error) {
            console.error("sitemap pdfs query error", error);
          } else {
            for (const r of rows ?? []) {
              const row = r as { id: string; created_at: string | null; updated_at: string | null };
              urls.push({
                loc: `${SITE_URL}/view/${row.id}`,
                lastmod: toLastmod(row.updated_at ?? row.created_at, today),
              });
            }
          }
        } catch (e) {
          console.error("sitemap pdfs unexpected error", e);
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});

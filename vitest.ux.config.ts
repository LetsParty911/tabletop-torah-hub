import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", include: [
    "src/lib/length-filter.test.ts", "src/lib/weekly-navigation.test.ts",
    "src/lib/sitemap-lastmod.test.ts",
    "src/lib/public-label-sizing.test.ts",
    "src/lib/publication-thumbnail-fit.test.ts",
    "src/lib/site-search-focus.test.ts",
    "src/lib/view-description.test.ts", "src/components/SmallPdfImage.test.tsx",
    "src/lib/table-chooser.starter.test.ts", "src/lib/original-editions.test.ts",
    "src/lib/hidden-gems.test.ts", "src/components/HomepageShare.test.tsx",
    "src/tests/admin-upload-form.test.tsx",
    "src/lib/verified-thumbnails.test.ts", "src/lib/pdf-display-title.test.ts",
    "src/pwa-register.test.ts", "src/components/PdfCoverThumbnail.test.tsx",
    "src/lib/open-pdf-clicks.test.ts", "src/lib/pdf-route-diagnostics.test.ts",
  ] },
});
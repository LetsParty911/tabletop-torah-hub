import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: [
    "src/lib/length-filter.test.ts", "src/lib/weekly-navigation.test.ts",
    "src/lib/view-description.test.ts", "src/components/SmallPdfImage.test.tsx",
    "src/lib/table-chooser.starter.test.ts", "src/lib/original-editions.test.ts",
    "src/lib/hidden-gems.test.ts", "src/components/HomepageShare.test.tsx",
    "src/tests/admin-upload-form.test.tsx",
  ] },
});
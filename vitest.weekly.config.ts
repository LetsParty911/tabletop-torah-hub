import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Plain isolated tests: do not transform server handlers into framework RPC stubs.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/lib/weekly-release.test.ts", "src/lib/parsha-override*.test.ts", "src/lib/collection-status.test.ts"],
  },
});
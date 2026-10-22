import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Exercise real server handlers without framework RPC/import transformations.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/lib/trusted-vpn*.test.ts"] },
});
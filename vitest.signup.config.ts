import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["src/components/*Signup*.test.tsx", "src/lib/sender.server.test.ts", "src/components/UpdateCountdown.test.tsx", "src/tests/homepage.smoke.test.tsx"],
  },
});

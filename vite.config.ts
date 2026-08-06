// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// __BUILD_ID__ rotates on every build so the service worker cache version
// changes automatically without hand-bumping it.
export default defineConfig({
  vite: {
    define: {
      __BUILD_ID__: JSON.stringify(
        process.env["CF_PAGES_COMMIT_SHA"] ||
          process.env["GIT_COMMIT_SHA"] ||
          Date.now().toString(36),
      ),
    },
  },
});

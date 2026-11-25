import { createFileRoute } from "@tanstack/react-router";
import { BUILD_ID } from "@/lib/site-freshness";

// Preserve the historical analytics marker and expose the current build ID.
// No database reads, credentials, or analytics side effects.
//
// Keep independent of Supabase so it remains read-only and cannot affect
// tracking counts or visitor notifications.
export const TRACKING_RELEASE_MARKER = "tftt-tracking-pr19-20261011";
export const TRACKING_RELEASE_ANCHOR = "25b04acccd222bc288fd76d39ac5447e80bdeec1";

export const Route = createFileRoute("/api/site-version")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({
            build_id: BUILD_ID,
            tracking_release: TRACKING_RELEASE_MARKER,
            tracking_change_anchor_commit: TRACKING_RELEASE_ANCHOR,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store, max-age=0",
              "X-Robots-Tag": "noindex",
            },
          },
        ),
    },
  },
});

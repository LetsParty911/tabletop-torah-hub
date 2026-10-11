import { createFileRoute } from "@tanstack/react-router";

// A non-sensitive release marker for verifying that the published website
// includes PR #19's analytics fixes. This is NOT a dynamically resolved SHA,
// authentication endpoint, analytics event, or uptime probe.
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

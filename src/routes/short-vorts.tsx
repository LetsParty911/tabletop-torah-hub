import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy link: retain old bookmarks without duplicating indexed content. */
export const Route = createFileRoute("/short-vorts")({
  beforeLoad: () => { throw redirect({ to: "/brief-insights", replace: true }); },
});

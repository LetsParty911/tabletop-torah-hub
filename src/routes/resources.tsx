import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy link: keep old bookmarks and search results working. */
export const Route = createFileRoute("/resources")({
  beforeLoad: () => { throw redirect({ to: "/originals", replace: true }); },
});

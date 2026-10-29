import { createFileRoute, redirect } from "@tanstack/react-router";

// The retired My Table feature has no public UI. Preserve this old URL only
// so existing bookmarks safely return to the homepage.
export const Route = createFileRoute("/my-table")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});

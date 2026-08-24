import { createFileRoute, redirect } from "@tanstack/react-router";

// Mission was merged into the About page. This route now exists solely to
// 301 old /mission links and bookmarks to their new home.
export const Route = createFileRoute("/mission")({
  loader: () => {
    throw redirect({ to: "/about", statusCode: 301 });
  },
});

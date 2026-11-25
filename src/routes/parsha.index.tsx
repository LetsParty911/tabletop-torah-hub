import { createFileRoute, redirect } from "@tanstack/react-router";

// The Parsha library has a canonical landing page. Keep the short parent
// URL working without redirecting or nesting individual Parsha pages.
export const Route = createFileRoute("/parsha/")({
  beforeLoad: () => {
    throw redirect({ to: "/divrei-torah-parsha", statusCode: 301, replace: true });
  },
});

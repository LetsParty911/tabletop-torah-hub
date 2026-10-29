import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired personalized email preferences. Do not process old emailed tokens;
// redirect old links to the homepage without exposing subscriber information.
export const Route = createFileRoute("/manage-table/$token")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});

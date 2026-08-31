import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/originals")({
  beforeLoad: () => {
    throw redirect({ to: "/resources", replace: true });
  },
});

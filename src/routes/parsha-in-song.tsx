import { createFileRoute, redirect } from "@tanstack/react-router";

// Paused: keep the route for a reversible return without advertising the series.
export const Route = createFileRoute("/parsha-in-song")({
  beforeLoad: () => { throw redirect({ to: "/" }); },
});

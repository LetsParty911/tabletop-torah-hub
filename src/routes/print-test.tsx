import { createFileRoute } from "@tanstack/react-router";
import { TorasAvigdorPrintTest } from "@/components/TorasAvigdorPrintTest";

export const Route = createFileRoute("/print-test")({
  head: () => ({
    meta: [
      { title: "Print Test — Toras Avigdor | Torah For The Table" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TorasAvigdorPrintTest,
});

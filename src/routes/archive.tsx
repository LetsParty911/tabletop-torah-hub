import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Download, Eye, Printer } from "lucide-react";
import { listArchive, type ArchiveYear, type ArchiveParsha, type ArchivePdf } from "@/integrations/supabase/api.functions";

export const Route = createFileRoute("/archive")({
  component: ArchivePage,
  loader: () => listArchive(),
  head: () => ({
    meta: [
      { title: "Archive — Torah for the Table" },
      {
        name: "description",
        content:
          "Browse past weeks' Divrei Torah by Jewish year and parsha — a growing archive for Shabbos and Yom Tov.",
      },
      { property: "og:title", content: "Archive — Torah for the Table" },
      {
        property: "og:description",
        content: "Past weeks' Divrei Torah, organized by Jewish year and parsha.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="parchment-frame max-w-md w-full">
        <div className="parchment-panel text-center">
          <h1 className="font-serif text-2xl text-primary">Archive unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground">{error.message}</p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/" className="text-primary underline">Go home</Link>
    </div>
  ),
});

function ArchivePage() {
  const { years } = Route.useLoaderData() as { years: ArchiveYear[] };
  const totalPdfs = years.reduce(
    (sum: number, y: ArchiveYear) =>
      sum + y.parshiyos.reduce((s: number, p: ArchiveParsha) => s + p.pdfs.length, 0),
    0,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-14 space-y-5 sm:space-y-8 md:space-y-10">
        {/* Header */}
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-[2rem] leading-[1.05] sm:text-5xl md:text-6xl font-bold tracking-tight text-primary">
              Archive
            </h1>
            <p className="mt-4 font-serif italic text-base sm:text-lg md:text-xl text-accent max-w-2xl mx-auto">
              Past weeks' Divrei Torah, organized by Jewish year and parsha.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3 sm:gap-4 text-accent">
              <span aria-hidden className="h-px w-8 sm:w-16 bg-accent/60" />
              <span className="font-sans text-[0.6rem] sm:text-xs uppercase tracking-[0.25em] sm:tracking-[0.3em]">
                {totalPdfs} {totalPdfs === 1 ? "Devar" : "Divrei"} Torah
              </span>
              <span aria-hidden className="h-px w-8 sm:w-16 bg-accent/60" />
            </div>
            <div className="mt-6">
              <Link
                to="/"
                className="text-sm font-medium text-accent hover:text-primary transition-colors"
              >
                ← Back to this week
              </Link>
            </div>
          </div>
        </section>

        {years.length === 0 ? (
          <section className="parchment-frame">
            <div className="parchment-panel text-center">
              <p className="text-muted-foreground">
                The archive is empty. Check back as new Divrei Torah are published.
              </p>
            </div>
          </section>
        ) : (
          years.map((y: ArchiveYear) => (
            <section key={y.year} className="parchment-frame">
              <div className="parchment-panel">
                <div className="flex items-baseline justify-between gap-4 border-b-2 border-accent/30 pb-4 mb-6">
                  <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-primary">
                    {y.year}
                  </h2>
                  <span className="font-sans text-xs sm:text-sm uppercase tracking-[0.2em] text-accent">
                    {y.parshiyos.length} {y.parshiyos.length === 1 ? "Parsha" : "Parshiyos"}
                  </span>
                </div>
                <div className="space-y-8">
                  {y.parshiyos.map((p: ArchiveParsha) => (
                    <div key={`${y.year}-${p.parshaKey}`}>
                      <h3 className="font-serif text-xl sm:text-2xl font-semibold text-primary mb-4">
                        Parshas {p.parshaKey}
                      </h3>
                      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        {p.pdfs.map((r: ArchivePdf) => (
                          <article
                            key={r.id}
                            className="rounded-2xl border-2 border-accent/40 bg-background/60 p-4 sm:p-5 hover:border-accent transition-colors flex flex-col"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-accent/15 text-primary shrink-0">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="font-serif text-base sm:text-lg font-semibold text-primary line-clamp-2 leading-snug">
                                  {r.title}
                                </h4>
                                {r.subtitle && (
                                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                    {r.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="mt-4 flex flex-col sm:flex-row gap-2.5 sm:gap-2">
                              <Link
                                to="/view/$id"
                                params={{ id: r.id }}
                                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-full border-2 border-primary/70 px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <Eye className="h-4 w-4" /> View
                              </Link>
                              <a
                                href={`/view/${r.id}/download`}
                                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                <Download className="h-4 w-4" /> Download
                              </a>
                              <a
                                href={`/view/${r.id}?print=1`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-full border-2 border-accent/70 px-3 py-2 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
                              >
                                <Printer className="h-4 w-4" /> Print
                              </a>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))
        )}

        <footer className="text-center text-sm text-muted-foreground py-4">
          © {new Date().getFullYear()} Torah for the Table
        </footer>
      </div>
    </div>
  );
}

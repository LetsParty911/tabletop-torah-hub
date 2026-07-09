import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { CategoryBadge } from "@/components/CategoryBadge";
import { listPublicationsMeta, type PublicationMeta } from "@/integrations/supabase/api.functions";
import { categoryLabel, tagLabel } from "@/lib/badges";

export const Route = createFileRoute("/publications")({
  component: PublicationsPage,
  loader: () => listPublicationsMeta(),
  head: () => {
    const title = "Meet the Publications | Torah for the Table";
    const description =
      "Get to know the weekly Divrei Torah publications gathered on Torah for the Table — their focus, style, and category.";
    const url = "https://torahforthetable.com/publications";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  errorComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/" className="text-primary underline">Go home</Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <Link to="/" className="text-primary underline">Go home</Link>
    </div>
  ),
});

function PublicationsPage() {
  const { publications } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8 md:px-8 md:py-14 space-y-6 sm:space-y-8">
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-3xl sm:text-4xl md:text-6xl font-bold text-primary">
              Meet the Publications
            </h1>
            <p className="mt-4 font-serif italic text-base sm:text-lg text-accent max-w-2xl mx-auto">
              A brief introduction to each of the weekly Divrei Torah gathered here.
            </p>
          </div>
        </section>

        <div className="gold-divider" aria-hidden><span className="gold-divider-dot" /></div>

        {publications.length === 0 ? (
          <section className="parchment-frame">
            <div className="parchment-panel text-center">
              <p className="text-muted-foreground">
                Publications will appear here as they are added.
              </p>
            </div>
          </section>
        ) : (
          <div className="grid gap-5 sm:gap-6 grid-cols-1">
            {publications.map((p) => {
              const catLabel = categoryLabel(p.primary_category);
              return (
                <section key={p.title} className="parchment-frame">
                  <div className="parchment-panel">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-accent/15 text-primary shrink-0">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-serif text-xl sm:text-2xl md:text-3xl font-semibold text-primary leading-snug">
                          {p.title}
                        </h2>
                        {(catLabel || p.tags.length > 0) && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {catLabel && (
                              <CategoryBadge label={catLabel} />
                            )}
                            {p.tags.map((t) => (
                              <CategoryBadge key={t} label={tagLabel(t)} />
                            ))}
                          </div>
                        )}
                        {p.summary && p.summary.trim().length > 0 && (
                          <>
                            <div className="mt-3 border-t border-accent/20" />
                            <p className="mt-3 font-sans text-sm sm:text-base text-muted-foreground leading-relaxed">
                              {p.summary}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <footer className="text-center text-sm text-muted-foreground py-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <span aria-hidden>·</span>
          <Link to="/archive" className="hover:text-primary transition-colors">Archive</Link>
          <span aria-hidden>·</span>
          <Link to="/about" className="hover:text-primary transition-colors">About</Link>
          <span aria-hidden>·</span>
          <Link to="/contact" className="hover:text-primary transition-colors">Contact</Link>
          <span aria-hidden>·</span>
          <span>© {new Date().getFullYear()} Torah for the Table</span>
        </footer>
      </div>
    </div>
  );
}

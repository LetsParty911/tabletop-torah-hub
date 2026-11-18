import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock3, Headphones, Play } from "lucide-react";
import type { AudioBook } from "@/lib/parsha-audio-book";
import { trackFp } from "@/lib/first-party-analytics";

/** Feature the published audio edition without changing the four PDF originals. */
export function FeaturedAudioBookCard({ book }: { book: AudioBook }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = "/api/parsha-audio-book/" + encodeURIComponent(book.id) + "?action=cover";

  return (
    <section
      aria-labelledby="featured-audio-book-title"
      className="relative overflow-hidden rounded-2xl border-2 border-accent/60 bg-card/90 shadow-sm"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-accent/70" />
      <div className="grid items-center gap-4 p-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-6 sm:p-6">
        <div className="mx-auto w-44 max-w-full shrink-0 overflow-hidden rounded-xl border border-accent/35 bg-primary/10 shadow-sm">
          {book.cover_path && !coverFailed ? (
            <img
              src={coverUrl}
              alt="Cover artwork for Parsha Audio Book — Parshas Vayetzei"
              loading="eager"
              onError={() => setCoverFailed(true)}
              className="aspect-[4/5] w-full object-cover"
            />
          ) : (
            <div role="img" aria-label="Parsha Audio Book" className="flex aspect-[4/5] items-center justify-center text-primary">
              <Headphones size={52} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3 text-center sm:text-left">
          <div className="flex justify-center sm:justify-start">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
              <Headphones size={15} aria-hidden="true" />
              New Audio Series
            </span>
          </div>
          <div>
            <h2 id="featured-audio-book-title" className="font-serif text-2xl font-bold leading-tight text-primary sm:text-3xl">
              Parsha Audio Book
            </h2>
            <p className="mt-1 font-serif text-lg font-semibold text-foreground">Parshas Vayetzei</p>
          </div>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground sm:mx-0 sm:text-base">
            Listen to the Parsha as a professionally narrated story, brought to life with explanations from Rashi. An engaging listening experience for children and adults.
          </p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:justify-start">
            <Clock3 size={15} aria-hidden="true" />
            14-minute narration
          </p>
          <Link
            to="/parsha-audio-book"
            onClick={() =>
              trackFp("recommendation_click", {
                publication_id: book.id,
                publication_title: book.title,
                parsha: book.parsha_key,
                metadata: { placement: "homepage_featured_audio_book", content_type: "audio_book" },
              })
            }
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
          >
            <Play size={17} aria-hidden="true" />
            Listen to Parshas Vayetzei
          </Link>
        </div>
      </div>
    </section>
  );
}

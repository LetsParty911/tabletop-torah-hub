import { useEffect, useRef, useState } from "react";
import { BookOpen, Download, LoaderCircle, Pause, Play } from "lucide-react";
import type { AudioBook } from "@/lib/parsha-audio-book";

export function ParshaAudioBookPlayer({ book }: { book: AudioBook }) {
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<"idle" | "preparing" | "retry">("idle");
  // A normal browser download has no reliable completion event. Offer a retry
  // after a short delay without claiming the file was actually saved.
  useEffect(() => {
    if (downloadState !== "preparing") return;
    const timeout = window.setTimeout(() => setDownloadState("retry"), 8000);
    return () => window.clearTimeout(timeout);
  }, [downloadState]);
  const playHref = "/api/parsha-audio-book/" + encodeURIComponent(book.id) + "?action=play";
  const coverHref = "/api/parsha-audio-book/" + encodeURIComponent(book.id) + "?action=cover";
  const downloadHref = "/api/parsha-audio-book/" + encodeURIComponent(book.id) + "?action=download";

  function toggle() {
    const audio = player.current;
    if (!audio) return;
    setError(null);
    if (!audio.paused) { audio.pause(); return; }
    // Play in the original user gesture; asynchronous fetch before play is
    // blocked by mobile browser media autoplay policies.
    void audio.play().catch(() => setError("Could not start the recording. Please retry."));
  }

  return (
    <article className="rounded-2xl border border-accent/40 bg-card/80 p-5 shadow-sm">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {book.cover_path
          ? <img src={coverHref} alt={"Cover artwork for " + book.title} className="h-48 w-48 shrink-0 rounded-xl border border-accent/40 object-cover shadow-sm" loading="lazy"/>
          : <div aria-hidden className="rounded-xl bg-primary/10 p-3 text-primary"><BookOpen size={28} /></div>}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-readable">Torah For The Table · Parsha Audio Book</p>
          <h2 className="mt-1 font-serif text-xl font-bold text-primary">{book.title}</h2>
          <p className="text-sm text-muted-foreground">Parshas {book.parsha_key === "vayetzei" ? "Vayetzei" : book.parsha_key} · {book.jewish_year}{book.parsha_key === "vayetzei" && book.jewish_year === 5787 ? " · 14 minutes" : ""}</p>
          {book.description && <p className="mt-2 text-sm leading-relaxed">{book.description}</p>}
        </div>
      </div>
      <audio ref={player} controls preload="none" src={playHref} className="mt-4 w-full"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onError={() => setError("Audio unavailable. Please try again.")} aria-label={"Listen to " + book.title} />
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={toggle}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground">
          {playing ? <Pause size={17} aria-hidden="true"/> : <Play size={17} aria-hidden="true"/>}
          {playing ? "Pause" : "Listen Now"}
        </button>
        <a
          href={downloadHref}
          onClick={(event) => {
            if (downloadState === "preparing") {
              event.preventDefault();
              return;
            }
            // Preserve the direct link so the browser performs a normal MP3
            // download and the server counts the request as before.
            setDownloadState("preparing");
          }}
          aria-disabled={downloadState === "preparing"}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-primary px-5 py-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {downloadState === "preparing" ? (
            <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <Download size={17} aria-hidden="true" />
          )}
          {downloadState === "preparing"
            ? "Preparing your download…"
            : downloadState === "retry"
              ? "Download MP3 again"
              : "Download MP3"}
        </a>
      </div>
      {downloadState !== "idle" && (
        <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-primary">
          {downloadState === "preparing"
            ? "Your MP3 download is being requested. Your browser may take several seconds to show it."
            : "If the download has not appeared, check your browser’s Downloads or tap Download MP3 again."}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">The audio may take a few seconds to begin.</p>
    </article>
  );
}

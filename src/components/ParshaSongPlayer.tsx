import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, Music2, Pause, Play } from "lucide-react";
import type { ParshaSong } from "@/lib/parsha-song";
import { songDownloadFilename } from "@/lib/parsha-song";

type Props = { song: ParshaSong; compact?: boolean };

export function ParshaSongPlayer({ song, compact = false }: Props) {
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  async function togglePlay() {
    const audio = player.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); } catch { setPlaying(false); }
  }

  return (
    <section aria-labelledby={"song-title-" + song.id} className="rounded-2xl border border-accent/45 bg-card/80 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="mx-auto h-44 w-44 shrink-0 overflow-hidden rounded-xl border border-accent/35 bg-primary/10 shadow-sm sm:mx-0 sm:h-40 sm:w-40">
          {coverFailed ? (
            <div role="img" aria-label="Album cover unavailable" className="flex h-full w-full items-center justify-center text-primary"><Music2 size={44} /></div>
          ) : (
            <img src={song.coverUrl} alt={"Album cover for " + song.title} loading={compact ? "lazy" : "eager"}
              onError={() => setCoverFailed(true)} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          {!compact && <p className="text-xs font-semibold uppercase tracking-widest text-accent-readable">Torah For The Table · Parsha in Song</p>}
          <h2 id={"song-title-" + song.id} className="font-serif text-xl font-bold text-primary sm:text-2xl">{song.title}</h2>
          <p className="text-sm text-muted-foreground">Parshas {song.parshaKey === "vayetzei" ? "Vayetzei" : song.parshaKey} {song.jewishYear}</p>
          {song.description && <p className="text-sm leading-relaxed text-foreground">{song.description}</p>}
          <audio ref={player} controls preload="none" src={song.audioUrl} aria-label={"Listen to " + song.title}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            className="w-full max-w-xl" />
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <button type="button" onClick={() => void togglePlay()}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? "Pause" : "Listen Online"}
            </button>
            <a href={song.audioUrl} download={songDownloadFilename(song.title, song.parshaKey, song.jewishYear)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-accent/10">
              <Download size={16} aria-hidden="true" /> Download MP3
            </a>
            {!compact && <Link to="/parsha-in-song" className="px-2 py-2 text-sm font-semibold text-primary underline">Previous Songs</Link>}
          </div>
        </div>
      </div>
    </section>
  );
}

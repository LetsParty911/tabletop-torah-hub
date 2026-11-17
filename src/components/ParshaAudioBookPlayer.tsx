import { useRef, useState } from "react";
import { BookOpen, Download, Pause, Play } from "lucide-react";
import type { AudioBook } from "@/lib/parsha-audio-book";

export function ParshaAudioBookPlayer({book}: {book: AudioBook}) {
  const audioRef=useRef<HTMLAudioElement>(null);
  const [playing,setPlaying]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [loaded,setLoaded]=useState(false);
  async function toggle() {
    const player=audioRef.current;
    if (!player || busy) return;
    if (playing) {player.pause();return;}
    setError(null);
    setBusy(true);
    try {
      if (!loaded) {
        const response=await fetch("/api/parsha-audio-book/"+encodeURIComponent(book.id)+"?action=play",{cache:"no-store"});
        if (!response.ok) throw new Error("Audio temporarily unavailable");
        const body=await response.json() as {url:string};
        player.src=body.url;
        setLoaded(true);
      }
      await player.play();
    } catch {setError("Unable to play the audiobook. Please try again.");}
    finally {setBusy(false);}
  }
  return (
    <article className="rounded-2xl border border-accent/40 bg-card/80 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div aria-hidden className="rounded-xl bg-primary/10 p-3 text-primary"><BookOpen size={28}/></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-readable">Torah For The Table · Parsha Audio Book</p>
          <h2 className="mt-1 font-serif text-xl font-bold text-primary">{book.title}</h2>
          <p className="text-sm text-muted-foreground">Parshas {book.parsha_key === "vayetzei" ? "Vayetzei" : book.parsha_key} · {book.jewish_year}{book.parsha_key === "vayetzei" && book.jewish_year === 5787 ? " · Approximately 14 minutes" : ""}</p>
          {book.description && <p className="mt-2 text-sm leading-relaxed">{book.description}</p>}
        </div>
      </div>
      <audio ref={audioRef} className="mt-4 w-full" controls={loaded} preload="none"
        onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}
        aria-label={"Listen to "+book.title}/>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={()=>void toggle()} disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-50">
          {playing?<Pause size={17}/>:<Play size={17}/>} {busy?"Loading…":playing?"Pause":"Listen Now"}
        </button>
        <a href={"/api/parsha-audio-book/"+encodeURIComponent(book.id)+"?action=download"}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-primary px-5 py-2 font-semibold text-primary">
          <Download size={17}/> Download MP3
        </a>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">The recording may take a moment to load. Play and download requests are counted separately.</p>
    </article>
  );
}

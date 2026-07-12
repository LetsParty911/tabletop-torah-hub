import { useEffect, useRef, useState } from "react";
import { Volume2, Pause } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const AUDIO_BASE =
  "https://kwdeyzumetmjcvtbqnzl.supabase.co/storage/v1/object/public/pdfs/";

type Props = {
  audioPath: string;
  resourceId?: string;
  resourceTitle?: string;
  publication?: string;
};

export function ListenToSummaryButton({ audioPath, resourceId, resourceTitle, publication }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio(AUDIO_BASE + audioPath);
    audioRef.current = audio;
    const onEnd = () => setPlaying(false);
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audioRef.current = null;
    };
  }, [audioPath]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch((e) => console.error("audio play failed", e));
    } else {
      a.pause();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Pause summary" : "Listen to summary"}
      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 hover:bg-accent/20 px-3 py-1 text-xs font-medium text-accent transition-colors self-start"
    >
      {playing ? (
        <Pause className="h-3.5 w-3.5" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      {playing ? "Pause" : "Listen to Summary"}
    </button>
  );
}

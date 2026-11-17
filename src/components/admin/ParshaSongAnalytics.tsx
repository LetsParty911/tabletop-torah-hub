import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { adminParshaSongAnalytics } from "@/integrations/supabase/parsha-songs.functions";

type Summary = Awaited<ReturnType<typeof adminParshaSongAnalytics>>[number];

export function ParshaSongAnalytics({ accessToken }: { accessToken: string }) {
  const [songs, setSongs] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await adminParshaSongAnalytics({ data: { accessToken } });
      setSongs(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load music analytics");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  const totalPlays = songs.reduce((sum, s) => sum + s.playsTotal, 0);
  const totalDownloads = songs.reduce((sum, s) => sum + s.downloadsTotal, 0);

  return (
    <section className="rounded-2xl border border-accent/45 bg-card p-4 sm:p-6" aria-labelledby="music-analytics-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="music-analytics-heading" className="flex items-center gap-2 font-serif text-xl font-bold text-primary">
          <BarChart3 size={20} aria-hidden="true" /> Music Analytics
        </h2>
        <button type="button" onClick={() => void refresh()} disabled={loading}
          className="inline-flex min-h-10 items-center gap-1 rounded-full border border-primary px-3 text-sm font-semibold text-primary disabled:opacity-50">
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Each play represents 10 seconds of listening in the site player. Each download represents a request made through the website’s MP3 download button. Your marked internal device and known bots are excluded. Counts begin when tracking is enabled; downloads are not confirmed completed transfers.</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">Loading music totals...</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-accent/40 bg-background p-4">
              <p className="text-sm text-muted-foreground">Total qualified plays</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{totalPlays.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-accent/40 bg-background p-4">
              <p className="text-sm text-muted-foreground">MP3 download requests</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{totalDownloads.toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto rounded-lg border border-accent/35">
            <table className="w-full min-w-[550px] text-left text-sm">
              <thead className="bg-primary/10 text-primary">
                <tr>
                  <th scope="col" className="p-3">Song</th>
                  <th scope="col" className="p-3 text-right">Plays</th>
                  <th scope="col" className="p-3 text-right">Plays 7d</th>
                  <th scope="col" className="p-3 text-right">Downloads</th>
                  <th scope="col" className="p-3 text-right">Downloads 7d</th>
                </tr>
              </thead>
              <tbody>
                {songs.map(song => (
                  <tr key={song.songId} className="border-t border-accent/30">
                    <th scope="row" className="p-3 font-medium text-foreground">
                      {song.title}
                      <span className="block font-normal text-muted-foreground">{song.parshaKey === "vayetzei" ? "Vayetzei" : song.parshaKey} {song.jewishYear}{!song.published ? " · Draft" : ""}</span>
                    </th>
                    <td className="p-3 text-right tabular-nums">{song.playsTotal.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums">{song.plays7d.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums">{song.downloadsTotal.toLocaleString()}</td>
                    <td className="p-3 text-right tabular-nums">{song.downloads7d.toLocaleString()}</td>
                  </tr>
                ))}
                {songs.length === 0 && <tr><td colSpan={5} className="p-5 text-center text-muted-foreground">No songs have been added yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

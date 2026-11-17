import { createFileRoute, Link } from "@tanstack/react-router";
import { listPublishedParshaSongs } from "@/integrations/supabase/parsha-songs.functions";
import { ParshaSongPlayer } from "@/components/ParshaSongPlayer";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/parsha-in-song")({
  component: ParshaInSongArchive,
  loader: () => listPublishedParshaSongs(),
  head: () => ({
    meta: [
      { title: "Parsha in Song — Torah For The Table" },
      { name: "description", content: "Listen to and download original weekly Parsha in Song recordings from Torah For The Table." },
      { property: "og:title", content: "Parsha in Song — Torah For The Table" },
    ],
    links: [{ rel: "canonical", href: "https://torahforthetable.com/parsha-in-song" }],
  }),
});

function ParshaInSongArchive() {
  const songs = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:py-12">
        <header className="parchment-frame">
          <div className="parchment-panel text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-readable">Torah For The Table</p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-primary sm:text-4xl">Parsha in Song</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Original songs retelling the weekly parsha. Listen online or save an MP3 to enjoy during the week.
            </p>
          </div>
        </header>
        {songs.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {songs.map((song) => <ParshaSongPlayer key={song.id} song={song} compact />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-accent/40 bg-card p-8 text-center">
            <p className="font-serif text-xl text-primary">The first Parsha in Song is being prepared.</p>
            <Link to="/" className="mt-4 inline-block text-sm font-semibold text-primary underline">Return to this week's Divrei Torah</Link>
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

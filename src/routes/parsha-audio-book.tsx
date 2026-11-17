import { createFileRoute, Link } from "@tanstack/react-router";
import { listPublishedAudioBooks } from "@/integrations/supabase/parsha-audio-books.functions";
import { ParshaAudioBookPlayer } from "@/components/ParshaAudioBookPlayer";
import { SiteFooter } from "@/components/SiteFooter";

export const Route=createFileRoute("/parsha-audio-book")({
 loader:()=>listPublishedAudioBooks(),
 component:AudioBookPage,
 head:()=>({meta:[
  {title:"Parsha Audio Book — Torah For The Table"},
  {name:"description",content:"Listen to professionally narrated Parsha stories, based on the Chumash and Rashi, from Torah For The Table."},
 ]}),
});
function AudioBookPage() {
  const books=Route.useLoaderData();
  return <div className="min-h-screen bg-background">
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-readable">Torah For The Table presents</p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-primary">Parsha Audio Book</h1>
        <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">The Parsha told as an engaging, professionally narrated story, with explanations drawn from Rashi.</p>
      </div>
      {books.length
        ? <div className="space-y-5">{books.map(book=><ParshaAudioBookPlayer key={book.id} book={book}/>)}</div>
        : <div className="rounded-xl border border-accent/40 bg-card p-6 text-center text-muted-foreground">
            The first audio book is being prepared for publication.
          </div>}
      <div className="text-center"><Link to="/" className="text-primary underline">Return to Torah For The Table</Link></div>
    </div>
    <SiteFooter/>
  </div>;
}

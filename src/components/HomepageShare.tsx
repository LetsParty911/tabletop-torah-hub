import { useRef, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homepageCopyUrl, homepageWhatsAppHref } from "@/lib/homepage-share-links";
import { trackFp } from "@/lib/first-party-analytics";

export function HomepageShare({ onWhatsApp }: { onWhatsApp: () => void }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const busy = useRef(false);
  async function copyLink() {
    if (busy.current) return;
    busy.current = true;
    setStatus("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(homepageCopyUrl);
      setStatus("copied");
      trackFp("share_click", { metadata: { placement: "homepage_veahavta", share_method: "copy_link" } });
    } catch {
      setStatus("failed");
    } finally {
      busy.current = false;
    }
  }
  return (
    <section id="share-with-a-friend" aria-labelledby="homepage-share-heading" className="scroll-mt-24 border-y border-accent/30 py-5 text-center">
      <h2 id="homepage-share-heading" className="font-serif text-2xl font-bold text-primary">Be a Friend. Tell a Friend.</h2>
      <p className="mt-2 text-sm font-semibold text-accent-readable">Help make another Shabbos table better!</p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">Share Torah For The Table with family and friends. Free Divrei Torah, fresh selections every Thursday.</p>
      <div className="mx-auto mt-4 flex max-w-lg flex-col justify-center gap-3 sm:flex-row">
        <Button asChild className="min-h-11"><a href={homepageWhatsAppHref} target="_blank" rel="noopener noreferrer" onClick={onWhatsApp}><Share2 aria-hidden="true" />Share on WhatsApp</a></Button>
        <Button variant="outline" className="min-h-11" onClick={copyLink} disabled={status === "copying"}><Copy aria-hidden="true" />{status === "copying" ? "Copying…" : "Copy Website Link"}</Button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm text-accent-readable">{status === "copied" ? "Link copied!" : status === "failed" ? "Couldn’t copy automatically. Select the link below and copy it." : ""}</p>
      {status === "failed" && (
        <div className="mx-auto mt-2 max-w-xl text-left">
          <label htmlFor="homepage-copy-fallback" className="text-xs text-muted-foreground">Website link</label>
          <input id="homepage-copy-fallback" readOnly value={homepageCopyUrl} onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
        </div>
      )}
    </section>
  );
}
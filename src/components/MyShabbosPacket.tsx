import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createShabbosPacket, PACKET_MAX_FILES, packetFilename, type PacketEntry } from "@/lib/shabbos-packet";

type Props = { entries: readonly PacketEntry[]; readingLabel: string; readingDate?: string | null };

export function MyShabbosPacket({ entries, readingLabel, readingDate }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [download, setDownload] = useState<{ url: string; pages: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const selected = entries.filter(entry => selectedIds.includes(entry.id));
  const estimate = selected.every(entry => entry.pageCount !== null)
    ? selected.reduce((sum, entry) => sum + (entry.pageCount ?? 0), 0) : null;

  function clearDownload() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setDownload(null);
  }

  useEffect(() => () => {
    controller.current?.abort();
    controller.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  function changeOpen(next: boolean) {
    if (!next) {
      controller.current?.abort();
      controller.current = null;
      setBusy(false);
      setError(null);
      setProgress(0);
      clearDownload();
    }
    setOpen(next);
  }

  function select(ids: string[]) {
    if (controller.current) return;
    clearDownload();
    setError(null);
    setSelectedIds(ids);
  }

  async function create() {
    if (controller.current || selected.length < 2 || selected.length > PACKET_MAX_FILES) return;
    clearDownload();
    setBusy(true);
    setError(null);
    setProgress(0);
    const active = new AbortController();
    controller.current = active;
    try {
      const result = await createShabbosPacket(selected, {
        signal: active.signal,
        onProgress: done => {
          if (controller.current === active) setProgress(done);
        },
      });
      if (active.signal.aborted || controller.current !== active) return;
      // A fresh buffer avoids platform-specific SharedArrayBuffer/Blob typing.
      const blobBytes = new Uint8Array(result.bytes.byteLength);
      blobBytes.set(result.bytes);
      const url = URL.createObjectURL(new Blob([blobBytes], { type: "application/pdf" }));
      urlRef.current = url;
      setDownload({ url, pages: result.pageCount });
    } catch (err) {
      if (!active.signal.aborted && controller.current === active) {
        setError(err instanceof Error ? err.message : "Could not prepare the packet. Please try again.");
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  if (entries.length < 2) return null;
  return (
    <div className="mt-3 text-center">
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild>
          <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Build My Shabbos Packet
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] w-[92vw] max-w-lg overflow-y-auto rounded-lg p-4 sm:p-6">
          <DialogTitle className="pr-8 font-serif text-xl text-primary">My Shabbos Packet</DialogTitle>
          <DialogDescription>
            Choose our original publications for {readingLabel}. Combine them into one PDF to save or print. No account needed.
          </DialogDescription>
          <fieldset disabled={busy} className="min-w-0 space-y-1">
            <legend className="sr-only">Choose publications</legend>
            {entries.map(entry => {
              const checked = selectedIds.includes(entry.id);
              return (
                <label key={entry.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-accent/30 p-2 text-left">
                  <input type="checkbox" checked={checked}
                    disabled={!checked && selected.length >= PACKET_MAX_FILES}
                    onChange={event => select(event.target.checked ? [...selectedIds, entry.id] : selectedIds.filter(id => id !== entry.id))}
                    className="h-5 w-5 shrink-0 accent-primary" />
                  <span className="min-w-0 flex-1 text-sm font-semibold text-primary">{entry.title}</span>
                  {entry.pageCount !== null && <span className="shrink-0 text-xs text-muted-foreground">{entry.pageCount}p</span>}
                </label>
              );
            })}
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span role="status">{selected.length} selected{selected.length > 0 && estimate !== null ? ` · about ${estimate} pages` : ""}</span>
            <div className="flex gap-3">
              {entries.length <= PACKET_MAX_FILES && <button disabled={busy} type="button" onClick={() => select(entries.map(e => e.id))} className="min-h-11 font-semibold text-primary underline">Select all</button>}
              <button disabled={busy || selected.length === 0} type="button" onClick={() => select([])} className="min-h-11 font-semibold text-primary underline disabled:opacity-50">Clear</button>
            </div>
          </div>
          {busy && <p role="status" className="text-sm text-muted-foreground">Preparing {progress} of {selected.length} PDFs…</p>}
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          {download ? (
            <div className="space-y-2">
              <p role="status" className="text-sm text-primary">Your packet is ready: {download.pages} pages.</p>
              <a href={download.url} download={packetFilename(readingLabel, readingDate)}
                className="flex min-h-11 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                Download packet
              </a>
            </div>
          ) : (
            <button type="button" onClick={() => void create()} disabled={busy || selected.length < 2}
              className="min-h-11 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {busy ? "Preparing packet…" : "Create packet"}
            </button>
          )}
          <p className="text-xs text-muted-foreground">Original PDF pages are kept in their existing order and size. The packet is prepared on your device; individual downloads remain available.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { PARSHIYOS } from "@/lib/parshiyos";
import { canonicalSongParsha, type AdminSong, MAX_SONG_COVER_BYTES, MAX_SONG_MP3_BYTES } from "@/lib/parsha-song";
import { adminListParshaSongs, adminSaveParshaSong } from "@/integrations/supabase/parsha-songs.functions";

type Props = { accessToken: string; defaultParsha: string | null; defaultYear: number | null };
const INITIAL_TITLE = "Wherever You Go";

function extensionFor(file: File, kind: "audio" | "cover"): "mp3" | "jpg" | "png" {
  const suffix = file.name.toLowerCase().split(".").pop();
  if (kind === "audio" && suffix === "mp3") return "mp3";
  if (kind === "cover" && (suffix === "jpg" || suffix === "jpeg")) return "jpg";
  if (kind === "cover" && suffix === "png") return "png";
  throw new Error(kind === "audio" ? "Choose an MP3 file" : "Choose a JPG or PNG image");
}
async function uploadSigned(file: File, kind: "audio" | "cover", token: string, parshaKey: string, jewishYear: number) {
  const max = kind === "audio" ? MAX_SONG_MP3_BYTES : MAX_SONG_COVER_BYTES;
  if (file.size === 0 || file.size > max) throw new Error(kind === "audio" ? "MP3 must be below 20 MB" : "Image must be below 5 MB");
  extensionFor(file, kind);
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("kind", kind);
  form.set("parshaKey", parshaKey);
  form.set("jewishYear", String(jewishYear));
  let response: Response;
  try {
    response = await fetch("/api/parsha-song-upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: form,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Unable to connect to the upload service. Check your internet connection and retry.");
  }
  const result = await response.json().catch(() => ({})) as { path?: string; error?: string };
  if (!response.ok || !result.path) {
    throw new Error(result.error || "Upload failed (HTTP " + response.status + ").");
  }
  return result.path;
}

export function ParshaSongAdmin({ accessToken, defaultParsha, defaultYear }: Props) {
  const [songs, setSongs] = useState<AdminSong[]>([]);
  const [parsha, setParsha] = useState("Vayetzei");
  const [year, setYear] = useState(5787);
  const [title, setTitle] = useState(INITIAL_TITLE);
  const [description, setDescription] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [selectionTouched, setSelectionTouched] = useState(false);

  useEffect(() => {
    if (selectionTouched) return;
    if (defaultParsha) setParsha(defaultParsha);
    if (defaultYear) setYear(defaultYear);
  }, [defaultParsha, defaultYear, selectionTouched]);

  async function refresh() {
    const data = await adminListParshaSongs({ data: { accessToken } });
    setSongs(data);
    return data;
  }
  useEffect(() => {
    let active = true;
    void adminListParshaSongs({ data: { accessToken } }).then(data => {
      if (active) { setSongs(data); setInitializing(false); }
    }).catch(err => {
      if (active) { setError(err instanceof Error ? err.message : "Unable to load songs"); setInitializing(false); }
    });
    return () => { active = false; };
  }, [accessToken]);

  function selectSong(row: AdminSong) {
    setSelectionTouched(true);
    const name = PARSHIYOS.find(x => canonicalSongParsha(x) === row.parsha_key) || row.parsha_key;
    setParsha(name); setYear(row.jewish_year); setTitle(row.title);
    setDescription(row.description || ""); setLyrics(row.lyrics || "");
    setAudioPath(row.audio_path); setCoverPath(row.cover_path);
    setAudioFile(null); setCoverFile(null); setPublished(row.published);
    setNotice(null); setError(null);
  }

  async function save(publish: boolean) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const normalized = canonicalSongParsha(parsha);
      let nextAudioPath = audioPath;
      let nextCoverPath = coverPath;
      if (audioFile) {
        setNotice("Uploading MP3...");
        nextAudioPath = await uploadSigned(audioFile, "audio", accessToken, normalized, year);
        setAudioPath(nextAudioPath);
      }
      if (coverFile) {
        setNotice("Uploading cover image...");
        nextCoverPath = await uploadSigned(coverFile, "cover", accessToken, normalized, year);
        setCoverPath(nextCoverPath);
      }
      setNotice("Saving song details...");
      const saved = await adminSaveParshaSong({ data: {
        accessToken, parshaKey: normalized, jewishYear: year, title: title.trim(),
        description, lyrics, published: publish, audioPath: nextAudioPath, coverPath: nextCoverPath,
      } });
      setAudioFile(null); setCoverFile(null); setPublished(saved.published);
      await refresh();
      setNotice(publish ? "Published — the song can now appear on its parsha week and in the archive." : "Saved as draft — not visible to readers.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Song save failed");
      setNotice(null);
    } finally { setBusy(false); }
  }

  return (
    <section className="parchment-frame">
      <div className="parchment-panel space-y-5">
        <header>
          <h2 className="font-serif text-2xl font-semibold text-primary">Parsha in Song</h2>
          <p className="mt-2 text-sm text-muted-foreground">Upload one MP3 and one square cover image for each parsha. Drafts never appear on the public website.</p>
        </header>
        {initializing ? <p>Loading songs...</p> : (
          <>
            <label className="block space-y-1 text-sm font-medium">
              <span>Edit a previously saved song</span>
              <select className="w-full rounded-md border border-accent/40 bg-background px-3 py-2"
                value={songs.find(s => s.parsha_key === canonicalSongParsha(parsha) && s.jewish_year === year)?.id ?? ""}
                onChange={event => { const row = songs.find(x => x.id === event.target.value); if (row) selectSong(row); }}>
                <option value="">New song / select a draft</option>
                {songs.map(row => <option value={row.id} key={row.id}>{row.jewish_year} · {row.parsha_key} · {row.title}{row.published ? " (published)" : " (draft)"}</option>)}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Parsha
                <select value={parsha} onChange={e => { setParsha(e.target.value); setSelectionTouched(true); setAudioPath(null); setCoverPath(null); setPublished(false); }}
                  className="mt-1 w-full rounded-md border border-accent/40 bg-background px-3 py-2">
                  {PARSHIYOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Jewish year
                <input type="number" min={5000} max={7000} value={year} onChange={e => { setYear(Number(e.target.value)); setSelectionTouched(true); setAudioPath(null); setCoverPath(null); setPublished(false); }}
                  className="mt-1 w-full rounded-md border border-accent/40 bg-background px-3 py-2" />
              </label>
            </div>
            <label className="block text-sm font-medium">Song title
              <input required value={title} onChange={e => setTitle(e.target.value)} maxLength={180}
                className="mt-1 w-full rounded-md border border-accent/40 bg-background px-3 py-2" />
            </label>
            <label className="block text-sm font-medium">Description (optional)
              <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={2}
                className="mt-1 w-full rounded-md border border-accent/40 bg-background px-3 py-2" />
            </label>
            <label className="block text-sm font-medium">MP3 recording (maximum 20 MB)
              <input type="file" accept=".mp3,audio/mpeg" onChange={e => setAudioFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full" />
              {audioPath && <span className="block text-xs text-muted-foreground">Existing MP3 saved. Select another file only to replace it.</span>}
            </label>
            <label className="block text-sm font-medium">Album cover JPG or PNG (maximum 5 MB)
              <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={e => setCoverFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full" />
              {coverPath && <span className="block text-xs text-muted-foreground">Existing cover saved. Select another file only to replace it.</span>}
            </label>
            <label className="block text-sm font-medium">Lyrics (optional)
              <textarea value={lyrics} onChange={e => setLyrics(e.target.value)} rows={4} maxLength={25000}
                className="mt-1 w-full rounded-md border border-accent/40 bg-background px-3 py-2" />
            </label>
            {published && <p className="text-sm font-semibold text-primary">Currently published. Save as Draft to unpublish.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => void save(false)} disabled={busy || !title.trim()}
                className="min-h-11 rounded-full border-2 border-primary px-5 py-2 font-semibold text-primary disabled:opacity-50">
                {busy ? "Working..." : "Save as Draft"}
              </button>
              <button type="button" onClick={() => void save(true)} disabled={busy || !title.trim() || !(audioPath || audioFile) || !(coverPath || coverFile)}
                className="min-h-11 rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? "Working..." : "Upload & Publish"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

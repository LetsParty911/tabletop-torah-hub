import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  adminListPdfs,
  adminUploadPdf,
  adminTogglePublished,
  adminDeletePdf,
  adminSetParshaOverride,
  adminListSubscribers,
  checkIsAdmin,
} from "@/integrations/supabase/api.functions";
import { getParshaOverride } from "@/integrations/supabase/api.functions";
import { PARSHIYOS } from "@/lib/parshiyos";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — Torah for the Table" }] }),
});

type PdfRow = {
  id: string;
  parsha_key: string;
  title: string;
  subtitle: string | null;
  file_path: string;
  published: boolean;
  created_at: string;
};

type Subscriber = { id: string; email: string; created_at: string };

function AdminPage() {
  const { session, loading, signInWithGitHub, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pdfs, setPdfs] = useState<PdfRow[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [override, setOverride] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Upload form
  const [parshaKey, setParshaKey] = useState(PARSHIYOS[0]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [published, setPublished] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    (async () => {
      if (!accessToken) {
        setIsAdmin(null);
        return;
      }
      const r = await checkIsAdmin({ data: { accessToken } });
      setIsAdmin(r.isAdmin);
    })();
  }, [accessToken]);

  const refresh = async () => {
    if (!accessToken || !isAdmin) return;
    const [p, s, o] = await Promise.all([
      adminListPdfs({ data: { accessToken } }),
      adminListSubscribers({ data: { accessToken } }),
      getParshaOverride(),
    ]);
    setPdfs(p.pdfs as PdfRow[]);
    setSubscribers(s.subscribers as Subscriber[]);
    setOverride(o.override ?? "");
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isAdmin]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !file) return;
    setBusy(true);
    setMsg(null);
    try {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const fileBase64 = btoa(bin);
      await adminUploadPdf({
        data: {
          accessToken,
          parshaKey,
          title,
          subtitle: subtitle || null,
          published,
          fileName: file.name,
          fileBase64,
        },
      });
      setTitle("");
      setSubtitle("");
      setFile(null);
      (document.getElementById("pdf-file-input") as HTMLInputElement | null)?.value &&
        ((document.getElementById("pdf-file-input") as HTMLInputElement).value = "");
      setMsg("Uploaded.");
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (id: string, next: boolean) => {
    if (!accessToken) return;
    await adminTogglePublished({ data: { accessToken, id, published: next } });
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!accessToken) return;
    if (!confirm("Delete this PDF? This cannot be undone.")) return;
    await adminDeletePdf({ data: { accessToken, id } });
    await refresh();
  };

  const handleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    try {
      await adminSetParshaOverride({
        data: { accessToken, override: override.trim() ? override.trim() : null },
      });
      setMsg("Override saved.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="parchment-frame max-w-md w-full">
          <div className="parchment-panel text-center">
            <h1 className="font-serif text-3xl font-bold text-primary">Admin Sign-in</h1>
            <p className="mt-3 text-muted-foreground">Sign in with GitHub to manage Torah PDFs.</p>
            <button
              onClick={signInWithGitHub}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign in with GitHub
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md">
          <h1 className="font-serif text-2xl font-bold text-primary">Not authorized</h1>
          <p className="mt-3 text-muted-foreground">
            Your account ({session.user.email}) is not an admin.
          </p>
          <button onClick={signOut} className="mt-6 underline text-primary">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-primary">Admin Dashboard</h1>
          <div className="text-sm text-muted-foreground flex items-center gap-3">
            <span>{session.user.email}</span>
            <button onClick={signOut} className="underline text-primary">
              Sign out
            </button>
          </div>
        </header>

        {msg && (
          <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-foreground">
            {msg}
          </div>
        )}

        {/* Parsha override */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">Manual Parsha Override</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Leave empty to use Hebcal's automatic parsha. Otherwise, set a parsha key (e.g., "Bereishis").
            </p>
            <form onSubmit={handleOverride} className="mt-4 flex gap-3">
              <input
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                list="parsha-list"
                placeholder="(empty = automatic)"
                className="flex-1 rounded-md border-2 border-accent/60 bg-background px-3 py-2"
              />
              <datalist id="parsha-list">
                {PARSHIYOS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <button
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                Save
              </button>
            </form>
          </div>
        </section>

        {/* Upload */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">Upload PDF</h2>
            <form onSubmit={handleUpload} className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Parsha</span>
                <select
                  value={parshaKey}
                  onChange={(e) => setParshaKey(e.target.value)}
                  className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                >
                  {PARSHIYOS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Title</span>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium">Subtitle (optional)</span>
                <input
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium">PDF file</span>
                <input
                  id="pdf-file-input"
                  required
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !title.trim()) {
                      const cleaned = f.name
                        .replace(/\.pdf$/i, "")
                        .replace(/_/g, " ")
                        .replace(/\s+/g, " ")
                        .trim();
                      setTitle(cleaned);
                    }
                  }}
                  className="mt-1 w-full"
                />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
                <span className="text-sm">Published</span>
              </label>
              <div className="md:col-span-2">
                <button
                  disabled={busy}
                  className="rounded-full bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50"
                >
                  {busy ? "Uploading…" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* PDFs list */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">All PDFs ({pdfs.length})</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b">
                  <tr>
                    <th className="py-2 pr-3">Parsha</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Published</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {pdfs.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2 pr-3">{p.parsha_key}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{p.title}</div>
                        {p.subtitle && <div className="text-muted-foreground text-xs">{p.subtitle}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => handleToggle(p.id, !p.published)}
                          className={`px-2 py-1 rounded text-xs ${p.published ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                        >
                          {p.published ? "Yes" : "No"}
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-destructive underline text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pdfs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        No PDFs yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Subscribers */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">
              Subscribers ({subscribers.length})
            </h2>
            <ul className="mt-4 space-y-1 text-sm max-h-80 overflow-auto">
              {subscribers.map((s) => (
                <li key={s.id} className="flex justify-between border-b py-1">
                  <span>{s.email}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
              {subscribers.length === 0 && (
                <li className="text-muted-foreground">No subscribers yet.</li>
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

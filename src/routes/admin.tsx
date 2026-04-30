import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  adminListPdfs,
  adminUploadPdf,
  adminReplacePdfFile,
  adminTogglePublished,
  adminDeletePdf,
  adminSetParshaOverride,
  adminListSubscribers,
  adminListWeeklySkips,
  adminAddWeeklySkip,
  adminRemoveWeeklySkip,
  checkIsAdmin,
  adminListChecklistSources,
  adminAddChecklistSource,
  adminUpdateChecklistSource,
  adminDeleteChecklistSource,
  adminListContactMessages,
  adminDeleteContactMessage,
  getAnnouncementBanner,
  adminSetAnnouncementBanner,
  adminGetWeeklyEmailPreview,
  adminSendWeeklyEmail,
  adminListWeeklyEmailSends,
  adminSendTestWelcomeEmail,
  adminResetSubscriber,
  adminResendPreflight,
  getLiveCurrentParsha,
} from "@/integrations/supabase/api.functions";
import { getParshaOverride } from "@/integrations/supabase/api.functions";
import { hebcalToParshaKey, PARSHIYOS } from "@/lib/parshiyos";

import { getCurrentJewishYear } from "@/lib/jewish-year";
import { CheckCircle2, Circle, MinusCircle, Eye, Download, Printer } from "lucide-react";

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
  jewish_year: number | null;
  created_at: string;
};

type Subscriber = { id: string; email: string; created_at: string };

type ContactMessageRow = {
  id: string;
  name: string | null;
  email: string;
  message: string;
  created_at: string;
};

const PARSHA_PREFIX_RE = /^(parshas|parashat|parsha)\s+/i;
const PARSHA_VARIANT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bachrei\b/g, "acharei"],
  [/\bmot\b/g, "mos"],
  [/\bshmini\b/g, "shemini"],
  [/\bsimchat\b/g, "simchas"],
  [/\bsukkot\b/g, "sukkos"],
  [/\bshavuot\b/g, "shavuos"],
  [/\bbechukotai\b/g, "bechukosai"],
  [/\bchukat\b/g, "chukas"],
  [/\bmatot\b/g, "matos"],
  [/\bvaetchanan\b/g, "vaeschanan"],
  [/\bvayelech\b/g, "vayeilech"],
  [/\bshlach\b/g, "shelach"],
  [/\btoldot\b/g, "toldos"],
  [/\bbereshit\b/g, "bereishis"],
  [/\bshemot\b/g, "shemos"],
  [/\bchayei\s+sara\b/g, "chayei sarah"],
  [/\bki\s+teitzei\b/g, "ki seitzei"],
  [/\bki\s+tavo\b/g, "ki savo"],
  [/\bhaazinu\b/g, "haazinu"],
];

const toParshaComparableKey = (value: string) => {
  let normalized = value
    .normalize("NFKD")
    .replace(PARSHA_PREFIX_RE, "")
    .replace(/[’'`]/g, "")
    .replace(/\s*-\s*/g, "-")
    .replace(/[^a-zA-Z\s-]/g, " ")
    .toLowerCase()
    .trim();

  for (const [pattern, replacement] of PARSHA_VARIANT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/[\s-]+/g, "");
};

const normalizeParshaSelection = (value: string | null | undefined) => {
  if (!value) return null;

  const cleaned = value.replace(PARSHA_PREFIX_RE, "").trim();
  const direct = PARSHIYOS.find((p) => p.toLowerCase() === cleaned.toLowerCase());
  if (direct) return direct;

  const hebcalNormalized = hebcalToParshaKey(cleaned);
  const exactHebcal = PARSHIYOS.find(
    (p) => p.toLowerCase() === hebcalNormalized.toLowerCase(),
  );
  if (exactHebcal) return exactHebcal;

  const targetKeys = [toParshaComparableKey(cleaned), toParshaComparableKey(hebcalNormalized)];
  return (
    PARSHIYOS.find((p) =>
      targetKeys.some((targetKey) => targetKey && toParshaComparableKey(p) === targetKey),
    ) ?? null
  );
};

const normalizeTitleKey = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function AdminPage() {
  const { session, loading, signInWithGitHub, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pdfs, setPdfs] = useState<PdfRow[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessageRow[]>([]);
  const [contactMessagesError, setContactMessagesError] = useState<string | null>(null);
  const [override, setOverride] = useState<string>("");
  const [annEnabled, setAnnEnabled] = useState(false);
  const [annText, setAnnText] = useState("");
  const [annLinkUrl, setAnnLinkUrl] = useState("");
  const [annLinkLabel, setAnnLinkLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Weekly email state
  type WeeklyPreview = Awaited<ReturnType<typeof adminGetWeeklyEmailPreview>>;
  type WeeklySend = {
    id: string;
    parsha_key: string;
    jewish_year: number;
    subject: string;
    sent_at: string;
    sent_count: number;
    provider: string | null;
    notes: string | null;
  };
  const [weekly, setWeekly] = useState<WeeklyPreview | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklySending, setWeeklySending] = useState(false);
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklySend[]>([]);

  // Checklist sources (admin-managed)
  type ChecklistSource = {
    id: string;
    title: string;
    active: boolean;
    sort_order: number;
    created_at: string;
  };
  const [sources, setSources] = useState<ChecklistSource[]>([]);
  const [newSourceTitle, setNewSourceTitle] = useState("");

  // Upload form
  const [parshaKey, setParshaKey] = useState<string>("");
  const [parshaUserTouched, setParshaUserTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [published, setPublished] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  // Inline "Replace PDF" editor state (per row)
  const [editingPdfId, setEditingPdfId] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);

  const accessToken = session?.access_token ?? null;
  // Admin checklist + upload form intentionally use the LIVE Hebcal parsha
  // (ignoring any display override in settings) so the checklist always
  // tracks the actual current week and rolls forward automatically when the
  // week changes — regardless of stale overrides left in the database.
  const [liveParshaKey, setLiveParshaKey] = useState<string | null>(null);
  const [liveParshaLabel, setLiveParshaLabel] = useState<string>("Loading…");
  const [liveParshaLoading, setLiveParshaLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getLiveCurrentParsha();
        if (cancelled) return;
        setLiveParshaKey(r.parshaKey);
        setLiveParshaLabel(r.displayLabel);
      } catch {
        // ignore — keep loading label
      } finally {
        if (!cancelled) setLiveParshaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const currentParshaKey = liveParshaKey;
  const currentParshaLabel = liveParshaLabel;
  const currentParshaLoading = liveParshaLoading;
  const resolvedCurrentParsha =
    normalizeParshaSelection(currentParshaKey) ??
    normalizeParshaSelection(currentParshaLabel);
  const uploadParshaReady = Boolean(resolvedCurrentParsha || parshaUserTouched || !currentParshaLoading);

  // Default the upload form parsha to the current (live) parsha unless the
  // admin has manually changed it.
  useEffect(() => {
    if (parshaUserTouched) return;
    if (!resolvedCurrentParsha) return;
    if (resolvedCurrentParsha !== parshaKey) {
      setParshaKey(resolvedCurrentParsha);
    }
  }, [resolvedCurrentParsha, parshaUserTouched, parshaKey]);

  // Skipped-this-week state, keyed by parsha + jewish_year, persisted in DB.
  const [jewishYear, setJewishYear] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // Resolve the current Jewish year once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const y = await getCurrentJewishYear();
        if (!cancelled) setJewishYear(y);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load skips for current parsha + year whenever they change.
  useEffect(() => {
    if (!accessToken || !currentParshaKey || jewishYear == null) {
      setSkipped(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await adminListWeeklySkips({
          data: { accessToken, parshaKey: currentParshaKey, jewishYear },
        });
        if (!cancelled) setSkipped(new Set(r.titleKeys.map((s) => s.toLowerCase())));
      } catch {
        if (!cancelled) setSkipped(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentParshaKey, jewishYear]);

  const toggleSkip = async (title: string) => {
    if (!accessToken || !currentParshaKey || jewishYear == null) return;
    const titleKey = title.toLowerCase();
    const prev = new Set(skipped);
    const next = new Set(skipped);
    const wasSkipped = next.has(titleKey);
    if (wasSkipped) next.delete(titleKey);
    else next.add(titleKey);
    setSkipped(next); // optimistic
    try {
      if (wasSkipped) {
        await adminRemoveWeeklySkip({
          data: { accessToken, parshaKey: currentParshaKey, titleKey, jewishYear },
        });
      } else {
        await adminAddWeeklySkip({
          data: { accessToken, parshaKey: currentParshaKey, titleKey, jewishYear },
        });
      }
    } catch {
      setSkipped(prev); // revert on failure
    }
  };

  const checklistParshaComparableKey = resolvedCurrentParsha
    ? toParshaComparableKey(resolvedCurrentParsha)
    : currentParshaKey
      ? toParshaComparableKey(currentParshaKey)
      : currentParshaLabel
        ? toParshaComparableKey(currentParshaLabel)
        : null;

  // Determine which expected titles are uploaded for the current parsha + Jewish year.
  const uploadedTitlesForCurrent = new Set(
    pdfs
      .filter(
        (p) =>
          checklistParshaComparableKey &&
          jewishYear != null &&
          p.jewish_year === jewishYear &&
          toParshaComparableKey(p.parsha_key) === checklistParshaComparableKey,
      )
      .map((p) => normalizeTitleKey(p.title)),
  );

  type ChecklistStatus = "uploaded" | "skipped" | "missing";
  const activeSourceTitles = sources.filter((s) => s.active).map((s) => s.title);
  const checklist: Array<{ title: string; status: ChecklistStatus }> = activeSourceTitles.map(
    (title) => {
      const key = normalizeTitleKey(title);
      if (uploadedTitlesForCurrent.has(key)) return { title, status: "uploaded" as const };
      if (skipped.has(key)) return { title, status: "skipped" as const };
      return { title, status: "missing" as const };
    },
  );
  const uploadedCount = checklist.filter((c) => c.status === "uploaded").length;
  const countableTotal = checklist.filter((c) => c.status !== "skipped").length;

  const useExpectedTitle = (title: string) => {
    setTitle(title);
    if (resolvedCurrentParsha) {
      setParshaKey(resolvedCurrentParsha);
      setParshaUserTouched(false);
    }
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };


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
    const [p, s, o, cs, cm, ann] = await Promise.all([
      adminListPdfs({ data: { accessToken } }),
      adminListSubscribers({ data: { accessToken } }),
      getParshaOverride(),
      adminListChecklistSources({ data: { accessToken } }),
      adminListContactMessages({ data: { accessToken } }).then(
        (r) => ({ ok: true as const, messages: r.messages as ContactMessageRow[] }),
        (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "unknown" }),
      ),
      getAnnouncementBanner(),
    ]);
    setPdfs(p.pdfs as PdfRow[]);
    setSubscribers(s.subscribers as Subscriber[]);
    setOverride(o.override ?? "");
    setSources(cs.sources as ChecklistSource[]);
    setAnnEnabled(ann.enabled);
    setAnnText(ann.text ?? "");
    setAnnLinkUrl(ann.linkUrl ?? "");
    setAnnLinkLabel(ann.linkLabel ?? "");
    if (cm.ok) {
      setContactMessages(cm.messages);
      setContactMessagesError(null);
    } else {
      setContactMessages([]);
      setContactMessagesError("Could not load contact messages.");
    }
    // Weekly email preview + history (don't block other admin loads on error)
    setWeeklyLoading(true);
    try {
      const [wp, wh] = await Promise.all([
        adminGetWeeklyEmailPreview({ data: { accessToken } }),
        adminListWeeklyEmailSends({ data: { accessToken } }),
      ]);
      setWeekly(wp);
      setWeeklyHistory(wh.sends as WeeklySend[]);
    } catch {
      // ignore — UI will show "Could not load"
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handleSendWeeklyEmail = async () => {
    if (!accessToken || !weekly?.ready) return;
    if (
      !confirm(
        `Send this week's email to ${weekly.activeSubscriberCount} active subscriber${weekly.activeSubscriberCount === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    setWeeklySending(true);
    setMsg(null);
    try {
      const r = await adminSendWeeklyEmail({ data: { accessToken } });
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error ?? "Send failed." });
      } else {
        const sent = (r as { sentCount?: number }).sentCount ?? 0;
        const failed = (r as { failedCount?: number }).failedCount ?? 0;
        const warning = (r as { warning?: string | null }).warning ?? null;
        setMsg({
          kind: "success",
          text: warning
            ? `Sent ${sent}. ${warning}`
            : `Weekly email sent to ${sent} subscriber${sent === 1 ? "" : "s"}.${failed ? ` ${failed} failed.` : ""}`,
        });
        try {
          (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
            "event",
            "weekly_email_send",
            {
              parsha_key: weekly.parshaKey,
              jewish_year: weekly.jewishYear,
              sent_count: sent,
            },
          );
        } catch { /* ignore */ }
      }
      await refresh();
    } catch (err) {
      setMsg({
        kind: "error",
        text: `Send failed: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    } finally {
      setWeeklySending(false);
    }
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
      const jewishYear = await getCurrentJewishYear();
      await adminUploadPdf({
        data: {
          accessToken,
          parshaKey,
          title,
          subtitle: subtitle || null,
          published,
          fileName: file.name,
          fileBase64,
          jewishYear,
        },
      });
      setTitle("");
      setSubtitle("");
      setFile(null);
      (document.getElementById("pdf-file-input") as HTMLInputElement | null)?.value &&
        ((document.getElementById("pdf-file-input") as HTMLInputElement).value = "");
      setMsg({ kind: "success", text: "Uploaded." });
      await refresh();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setMsg({ kind: "error", text: `Upload failed: ${detail}` });
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

  const getCurrentPdfFileName = (filePath: string | null | undefined): string => {
    if (!filePath) return "(no file)";
    const last = filePath.split("/").pop() || filePath;
    // Strip leading "<timestamp>_" prefix added at upload time
    return last.replace(/^\d{10,}_/, "");
  };

  const startEditPdf = (id: string) => {
    setEditingPdfId(id);
    setReplaceFile(null);
  };

  const cancelEditPdf = () => {
    setEditingPdfId(null);
    setReplaceFile(null);
  };

  const handleReplacePdf = async (id: string) => {
    if (!accessToken || !replaceFile) return;
    setReplacing(true);
    setMsg(null);
    try {
      const buf = await replaceFile.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const fileBase64 = btoa(bin);
      await adminReplacePdfFile({
        data: { accessToken, id, fileName: replaceFile.name, fileBase64 },
      });
      setMsg({ kind: "success", text: "PDF replaced." });
      cancelEditPdf();
      await refresh();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setMsg({ kind: "error", text: `Replace failed: ${detail}` });
    } finally {
      setReplacing(false);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !newSourceTitle.trim()) return;
    const nextOrder = sources.length
      ? Math.max(...sources.map((s) => s.sort_order)) + 10
      : 10;
    setBusy(true);
    try {
      await adminAddChecklistSource({
        data: { accessToken, title: newSourceTitle.trim(), sortOrder: nextOrder },
      });
      setNewSourceTitle("");
      await refresh();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Could not add source" });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSourceActive = async (id: string, active: boolean) => {
    if (!accessToken) return;
    await adminUpdateChecklistSource({ data: { accessToken, id, active } });
    await refresh();
  };

  const handleSourceSortChange = async (id: string, sortOrder: number) => {
    if (!accessToken) return;
    await adminUpdateChecklistSource({ data: { accessToken, id, sortOrder } });
    await refresh();
  };

  const handleSourceTitleChange = async (id: string, title: string) => {
    if (!accessToken) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setMsg({ kind: "error", text: "Title cannot be empty." });
      await refresh();
      return;
    }
    try {
      await adminUpdateChecklistSource({ data: { accessToken, id, title: trimmed } });
      await refresh();
    } catch (err) {
      setMsg({
        kind: "error",
        text: `Rename failed: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  };

  const handleDeleteSource = async (id: string, title: string) => {
    if (!accessToken) return;
    if (!confirm(`Delete checklist source "${title}"? Use Inactive instead to keep history.`)) return;
    await adminDeleteChecklistSource({ data: { accessToken, id } });
    await refresh();
  };

  const handleDeleteContactMessage = async (id: string) => {
    if (!accessToken) return;
    if (!confirm("Delete this contact message?")) return;
    try {
      await adminDeleteContactMessage({ data: { accessToken, id } });
      await refresh();
    } catch (err) {
      setMsg({
        kind: "error",
        text: `Could not delete message: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminSetAnnouncementBanner({
        data: {
          accessToken,
          enabled: annEnabled,
          text: annText.trim() ? annText.trim() : null,
          linkUrl: annLinkUrl.trim() ? annLinkUrl.trim() : null,
          linkLabel: annLinkLabel.trim() ? annLinkLabel.trim() : null,
        },
      });
      setMsg({ kind: "success", text: "Announcement banner saved." });
    } catch (err) {
      setMsg({
        kind: "error",
        text: `Save failed: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    try {
      await adminSetParshaOverride({
        data: { accessToken, override: override.trim() ? override.trim() : null },
      });
      setMsg({ kind: "success", text: "Override saved." });
    } finally {
      setBusy(false);
    }
  };

  // While auth is hydrating, or while we're still resolving an OAuth
  // callback in the URL, show a loader instead of flashing the sign-in screen.
  const hasAuthCallbackInUrl =
    typeof window !== "undefined" &&
    (window.location.hash.includes("access_token=") ||
      window.location.search.includes("code="));

  if (loading || hasAuthCallbackInUrl) {
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

  // Session exists but admin status is still being verified — keep the
  // loader up rather than briefly showing the dashboard to a non-admin.
  if (isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Verifying access…</div>;
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
          <div
            className={
              msg.kind === "error"
                ? "rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
                : "rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-foreground"
            }
            role={msg.kind === "error" ? "alert" : "status"}
          >
            {msg.text}
          </div>
        )}

        {/* Weekly Email */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">
              Weekly Email
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Send this week's Divrei Torah collection to active subscribers.
              Manual send only — nothing goes out automatically.
            </p>

            {weeklyLoading && !weekly && (
              <p className="mt-4 text-muted-foreground">Loading…</p>
            )}

            {weekly && (
              <>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-md border border-accent/40 bg-background/50 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Current week</div>
                    <div className="font-medium text-foreground">{weekly.parshaLabel ?? "—"}</div>
                  </div>
                  <div className="rounded-md border border-accent/40 bg-background/50 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Jewish year</div>
                    <div className="font-medium text-foreground">{weekly.jewishYear ?? "—"}</div>
                  </div>
                  <div className="rounded-md border border-accent/40 bg-background/50 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Published PDFs</div>
                    <div className="font-medium text-foreground">{weekly.resources.length}</div>
                  </div>
                  <div className="rounded-md border border-accent/40 bg-background/50 px-3 py-2">
                    <div className="text-xs text-muted-foreground">Active subscribers</div>
                    <div className="font-medium text-foreground">{weekly.activeSubscriberCount}</div>
                  </div>
                </div>

                {!weekly.emailConfigured && (
                  <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    Email not configured yet. Add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM_ADDRESS</code> as project secrets.
                  </div>
                )}

                {weekly.alreadySent && (
                  <div className="mt-4 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground">
                    Already sent on {new Date(weekly.alreadySent.sentAt).toLocaleString()} to {weekly.alreadySent.sentCount} subscriber{weekly.alreadySent.sentCount === 1 ? "" : "s"}.
                  </div>
                )}

                <div className="mt-5 rounded-md border-2 border-accent/50 bg-background/40 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Subject</div>
                  <div className="font-medium text-foreground mt-1">{weekly.subject || "—"}</div>
                  <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Intro</div>
                  <p className="text-sm text-foreground mt-1">{weekly.intro}</p>
                  <div className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                    Items ({weekly.resources.length})
                  </div>
                  {weekly.resources.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">No published PDFs for this week yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {weekly.resources.map((r) => (
                        <li key={r.id} className="text-sm">
                          <div className="font-medium text-foreground">{r.title}</div>
                          {r.subtitle && (
                            <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-0.5">View · Download</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 text-xs text-muted-foreground">Footer: Homepage · Archive · Unsubscribe</div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSendWeeklyEmail}
                    disabled={weeklySending || !weekly.ready || Boolean(weekly.alreadySent)}
                    className="rounded-full bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50"
                  >
                    {weeklySending
                      ? "Sending…"
                      : weekly.alreadySent
                        ? "Already Sent"
                        : "Send This Week's Email"}
                  </button>
                  {!weekly.ready && !weekly.alreadySent && weekly.reason && (
                    <span className="text-sm text-muted-foreground">{weekly.reason}</span>
                  )}
                </div>

                {weeklyHistory.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-foreground">Recent sends</h3>
                    <ul className="mt-2 divide-y divide-accent/30 text-sm">
                      {weeklyHistory.slice(0, 8).map((h) => (
                        <li key={h.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{h.subject}</div>
                            <div className="text-xs text-muted-foreground">
                              {h.parsha_key} · {h.jewish_year} · sent to {h.sent_count}
                              {h.notes ? ` · ${h.notes}` : ""}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">
                            {new Date(h.sent_at).toLocaleString()}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Parsha override */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">Manual Parsha Override</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Leave empty to use Hebcal's automatic parsha. An override only applies to the current week's Shabbos — once that Shabbos passes, Hebcal automatically takes over again.
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

        {/* Announcement Banner */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">
              Announcement Banner
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              A slim banner at the top of the homepage. When disabled, nothing renders.
            </p>
            <form onSubmit={handleSaveAnnouncement} className="mt-4 space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={annEnabled}
                  onChange={(e) => setAnnEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="font-medium">Enable banner</span>
              </label>

              <div>
                <label className="block text-sm font-medium mb-1">Banner Text</label>
                <textarea
                  value={annText}
                  onChange={(e) => setAnnText(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="e.g., Wishing all our readers a Gut Shabbos."
                  className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Link URL (optional)</label>
                  <input
                    type="url"
                    value={annLinkUrl}
                    onChange={(e) => setAnnLinkUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Link Label (optional)</label>
                  <input
                    type="text"
                    value={annLinkLabel}
                    onChange={(e) => setAnnLinkLabel(e.target.value)}
                    maxLength={120}
                    placeholder="Read more"
                    className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Link only appears on the homepage when both URL and Label are filled in.
              </p>

              <button
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                Save banner
              </button>
            </form>
          </div>
        </section>


        <section className="parchment-frame">
          <div className="parchment-panel">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-serif text-2xl font-semibold text-primary">
                  Weekly Upload Checklist
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Tracking <span className="font-medium text-foreground">{currentParshaLabel}</span>
                  {currentParshaKey ? ` (${currentParshaKey})` : ""}
                </p>
              </div>
              <div className="text-sm font-medium text-primary">
                {uploadedCount} uploaded
                <span className="text-muted-foreground font-normal">
                  {" "}· {checklist.length - countableTotal} skipped ·{" "}
                  {countableTotal - uploadedCount} remaining
                </span>
              </div>
            </div>

            <ul className="mt-4 divide-y divide-accent/30">
              {checklist.map((item) => (
                <li key={item.title} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.status === "uploaded" && (
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    )}
                    {item.status === "missing" && (
                      <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    {item.status === "skipped" && (
                      <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium truncate">{item.title}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                        item.status === "uploaded"
                          ? "bg-primary/10 text-primary"
                          : item.status === "skipped"
                            ? "bg-muted text-muted-foreground"
                            : "bg-accent/20 text-foreground"
                      }`}
                    >
                      {item.status === "uploaded"
                        ? "Uploaded"
                        : item.status === "skipped"
                          ? "Skipped"
                          : "Missing"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "missing" && (
                      <button
                        type="button"
                        onClick={() => useExpectedTitle(item.title)}
                        className="text-xs underline text-primary"
                      >
                        Use this title
                      </button>
                    )}
                    {item.status !== "uploaded" && (
                      <button
                        type="button"
                        onClick={() => toggleSkip(item.title)}
                        className="text-xs rounded border border-accent/60 px-2 py-1 hover:bg-accent/10"
                      >
                        {item.status === "skipped" ? "Unskip" : "Skip this week"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Manage Weekly Checklist Sources */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">
              Manage Weekly Checklist Sources
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              The list below controls what appears in the Weekly Upload Checklist. Lower sort order
              shows first. Inactive sources are hidden but kept for history.
            </p>

            <form onSubmit={handleAddSource} className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                value={newSourceTitle}
                onChange={(e) => setNewSourceTitle(e.target.value)}
                placeholder="New source title (e.g., Torah Wellsprings)"
                className="flex-1 rounded-md border-2 border-accent/60 bg-background px-3 py-2"
              />
              <button
                disabled={busy || !newSourceTitle.trim()}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                Add source
              </button>
            </form>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b">
                  <tr>
                    <th className="py-2 pr-3 w-20">Order</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3 w-28">Active</th>
                    <th className="py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.id} className="border-b">
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          defaultValue={s.sort_order}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isNaN(v) && v !== s.sort_order) {
                              handleSourceSortChange(s.id, v);
                            }
                          }}
                          className="w-16 rounded border border-accent/60 bg-background px-2 py-1"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          defaultValue={s.title}
                          placeholder="Edit title…"
                          title="Click to edit. Press Enter or click away to save."
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v.trim() && v.trim() !== s.title) {
                              handleSourceTitleChange(s.id, v);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="w-full rounded-md border-2 border-accent bg-background px-3 py-1.5 font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => handleToggleSourceActive(s.id, !s.active)}
                          className={`px-2 py-1 rounded text-xs ${
                            s.active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {s.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDeleteSource(s.id, s.title)}
                          className="text-destructive underline text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sources.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        No checklist sources yet. Add one above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="upload-section" className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">Upload PDF</h2>
            <form onSubmit={handleUpload} className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Parsha</span>
                {!uploadParshaReady ? (
                  <div className="mt-1 rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm text-muted-foreground">
                    Loading current parsha…
                  </div>
                ) : (
                  <select
                    required
                    value={parshaKey}
                    onChange={(e) => {
                      setParshaKey(e.target.value);
                      setParshaUserTouched(true);
                    }}
                    className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                  >
                    {!parshaKey && (
                      <option value="" disabled>
                        Select a parsha
                      </option>
                    )}
                    {PARSHIYOS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
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
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <button
                  disabled={busy}
                  className="rounded-full bg-primary px-6 py-2 text-primary-foreground disabled:opacity-50"
                >
                  {busy ? "Uploading…" : "Upload"}
                </button>
                {msg && (
                  <span
                    className={
                      msg.kind === "error"
                        ? "text-sm text-destructive"
                        : "text-sm text-muted-foreground"
                    }
                    role={msg.kind === "error" ? "alert" : "status"}
                  >
                    {msg.text}
                  </span>
                )}
              </div>
            </form>
          </div>
        </section>

        {/* PDFs list */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            {(() => {
              const availableYears = Array.from(
                new Set(pdfs.map((p) => p.jewish_year).filter((y): y is number => !!y)),
              ).sort((a, b) => b - a);
              const filteredPdfs =
                yearFilter === "all"
                  ? pdfs
                  : pdfs.filter((p) => String(p.jewish_year ?? "") === yearFilter);
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-serif text-2xl font-semibold text-primary">
                      All PDFs ({filteredPdfs.length}
                      {yearFilter !== "all" ? ` of ${pdfs.length}` : ""})
                    </h2>
                    {availableYears.length > 0 && (
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Jewish Year:</span>
                        <select
                          value={yearFilter}
                          onChange={(e) => setYearFilter(e.target.value)}
                          className="border rounded px-2 py-1 bg-background"
                        >
                          <option value="all">All years</option>
                          {availableYears.map((y) => (
                            <option key={y} value={String(y)}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left border-b">
                        <tr>
                          <th className="py-2 pr-3">Parsha</th>
                          <th className="py-2 pr-3">Year</th>
                          <th className="py-2 pr-3">Title</th>
                          <th className="py-2 pr-3">Published</th>
                          <th className="py-2 pr-3">Created</th>
                          <th className="py-2 pr-3">Actions</th>
                          <th className="py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPdfs.map((p) => (
                          <React.Fragment key={p.id}>
                          <tr className="border-b">
                            <td className="py-2 pr-3">{p.parsha_key}</td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {p.jewish_year ?? "—"}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="font-medium">{p.title}</div>
                              {p.subtitle && (
                                <div className="text-muted-foreground text-xs">{p.subtitle}</div>
                              )}
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
                            <td className="py-2 pr-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <a
                                  href={`/view/${p.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full border border-primary/60 px-2 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                                >
                                  <Eye className="h-3 w-3" /> View
                                </a>
                                <a
                                  href={`/view/${p.id}/download`}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                                >
                                  <Download className="h-3 w-3" /> Download
                                </a>
                                <a
                                  href={`/view/${p.id}/pdf`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full border border-accent/70 px-2 py-1 text-xs font-medium text-accent hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                  <Printer className="h-3 w-3" /> Print PDF
                                </a>
                              </div>
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() =>
                                    editingPdfId === p.id ? cancelEditPdf() : startEditPdf(p.id)
                                  }
                                  className="text-primary underline text-xs"
                                >
                                  {editingPdfId === p.id ? "Close" : "Edit"}
                                </button>
                                <button
                                  onClick={() => handleDelete(p.id)}
                                  className="text-destructive underline text-xs"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                          {editingPdfId === p.id && (
                            <tr key={`${p.id}-edit`} className="border-b bg-muted/30">
                              <td colSpan={7} className="py-4 px-3">
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="rounded-md border border-accent/60 bg-background p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      Current PDF
                                    </div>
                                    <div
                                      className="mt-1 break-all text-sm font-medium text-foreground"
                                      title={p.file_path}
                                    >
                                      {getCurrentPdfFileName(p.file_path)}
                                    </div>
                                    <div className="mt-2">
                                      <a
                                        href={`/view/${p.id}/pdf`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 rounded-md border border-primary/60 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                                      >
                                        <Eye className="h-3 w-3" /> View Current PDF
                                      </a>
                                    </div>
                                  </div>
                                  <div className="rounded-md border border-accent/60 bg-background p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      Replace PDF
                                    </div>
                                    <input
                                      type="file"
                                      accept="application/pdf"
                                      onChange={(e) =>
                                        setReplaceFile(e.target.files?.[0] ?? null)
                                      }
                                      className="mt-2 block w-full text-sm"
                                    />
                                    {replaceFile && (
                                      <div className="mt-2 text-sm">
                                        <div
                                          className="font-medium break-all"
                                          title={replaceFile.name}
                                        >
                                          {replaceFile.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          This will replace the current PDF when saved
                                        </div>
                                      </div>
                                    )}
                                    <div className="mt-3 flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleReplacePdf(p.id)}
                                        disabled={!replaceFile || replacing}
                                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                                      >
                                        {replacing ? "Saving…" : "Save replacement"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditPdf}
                                        disabled={replacing}
                                        className="rounded-md border border-accent/60 px-3 py-1.5 text-xs font-medium text-foreground"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        ))}
                        {filteredPdfs.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-muted-foreground">
                              {pdfs.length === 0 ? "No PDFs yet." : "No PDFs for this year."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        </section>

        {/* Subscribers */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">
              Subscribers ({subscribers.length})
            </h2>

            {/* Welcome email test tool */}
            <div className="mt-4 rounded-md border border-border bg-background/60 p-3">
              <div className="text-sm font-medium mb-2">Welcome email test</div>
              <WelcomeEmailTester accessToken={accessToken} onResetDone={refresh} />
            </div>

            <ul className="mt-4 space-y-1 text-sm max-h-80 overflow-auto">
              {subscribers.map((s) => (
                <li key={s.id} className="flex justify-between border-b py-1 gap-2">
                  <span className="truncate">{s.email}</span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
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

        {/* Contact Messages */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">
              Contact Messages ({contactMessages.length})
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Messages submitted from the public Contact page.
            </p>
            {contactMessagesError ? (
              <p className="mt-4 text-sm text-destructive">{contactMessagesError}</p>
            ) : contactMessages.length === 0 ? (
              <p className="mt-4 text-muted-foreground">No contact messages yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {contactMessages.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-md border border-border/60 bg-background/40 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <div className="space-x-2">
                        <span className="font-medium text-foreground">
                          {m.name && m.name.trim().length > 0 ? m.name : "—"}
                        </span>
                        <a
                          href={`mailto:${m.email}`}
                          className="text-primary underline underline-offset-2"
                        >
                          {m.email}
                        </a>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                      {m.message}
                    </p>
                    <div className="mt-3 text-right">
                      <button
                        onClick={() => handleDeleteContactMessage(m.id)}
                        className="text-destructive underline text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function WelcomeEmailTester({
  accessToken,
  onResetDone,
}: {
  accessToken: string | null;
  onResetDone: () => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"send" | "reset" | "preflight" | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const preflight = async () => {
    if (!accessToken) return;
    setBusy("preflight");
    setStatus("Checking Resend config…");
    try {
      const r = (await adminResendPreflight({ data: { accessToken } })) as {
        ok: boolean;
        step: string;
        message: string;
        fromDisplay?: string;
        fromDomain?: string;
        status?: string | number;
        verified?: boolean;
        sandbox?: boolean;
        missing?: string[];
        availableDomains?: Array<{ name: string; status: string }>;
        errorSnippet?: string;
      };
      const icon = r.ok ? "✓" : r.sandbox ? "⚠" : "✗";
      const from = r.fromDisplay ? ` — From: ${r.fromDisplay}` : "";
      const avail =
        r.availableDomains && r.availableDomains.length > 0
          ? ` Available on account: ${r.availableDomains
              .map((d) => `${d.name} (${d.status})`)
              .join(", ")}.`
          : "";
      setStatus(`${icon} ${r.message}${from}${avail}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!accessToken || !email.trim()) return;
    setBusy("send");
    setStatus(null);
    try {
      const r = await adminSendTestWelcomeEmail({
        data: { accessToken, email: email.trim() },
      });
      const res = (r as { result?: unknown }).result as
        | { attempted: boolean; ok?: boolean; status?: number; reason?: string; missing?: string[]; errorSnippet?: string }
        | undefined;
      if (!res) setStatus("Sent (no details).");
      else if (!res.attempted)
        setStatus(`Skipped — email not configured. Missing: ${(res.missing ?? []).join(", ")}`);
      else if (res.ok) setStatus(`Sent ✓ (Resend status ${res.status})`);
      else setStatus(`Failed (status ${res.status}): ${res.errorSnippet ?? ""}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!accessToken || !email.trim()) return;
    if (!confirm(`Delete subscriber row for ${email.trim()}? They can re-subscribe to re-test the welcome flow.`)) return;
    setBusy("reset");
    setStatus(null);
    try {
      const r = await adminResetSubscriber({
        data: { accessToken, email: email.trim() },
      });
      setStatus(`Deleted ${(r as { deleted: number }).deleted} row(s). Now re-subscribe from the public site to test.`);
      await onResetDone();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-w-[200px] rounded border border-input bg-background px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy !== null || !email.trim()}
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
        >
          {busy === "send" ? "Sending…" : "Send test welcome"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy !== null || !email.trim()}
          className="rounded border border-destructive px-3 py-1 text-sm text-destructive disabled:opacity-50"
        >
          {busy === "reset" ? "Resetting…" : "Reset subscriber row"}
        </button>
        <button
          type="button"
          onClick={preflight}
          disabled={busy !== null}
          className="rounded border border-input px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy === "preflight" ? "Checking…" : "Preflight Resend config"}
        </button>
      </div>
      {status && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{status}</div>}
      <div className="text-xs text-muted-foreground">
        "Preflight Resend config" verifies RESEND_API_KEY works and checks whether the domain in EMAIL_FROM_ADDRESS is verified in Resend — no email is sent.
        "Send test welcome" calls the same welcome email path used by new subscriptions (without creating a row).
        "Reset subscriber row" deletes that email from the subscribers table so the next signup is treated as brand-new.
      </div>
    </div>
  );
}

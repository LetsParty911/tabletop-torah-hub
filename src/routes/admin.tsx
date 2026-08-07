import { createFileRoute } from "@tanstack/react-router";
import { DownloadAnalytics } from "@/components/DownloadAnalytics";
import { UnifiedDashboard } from "@/components/UnifiedDashboard";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  adminListPdfs,
  adminUploadPdf,
  adminUploadPdfThumb,
  listCanonicalPublications,
  adminReplacePdfFile,
  adminTogglePublished,
  adminBulkPublish,
  adminDeletePdf,
  adminSetParshaOverride,
  adminListSubscribers,
  adminDeleteSubscribers,
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
  getWhatsNewBanner,
  adminSetWhatsNewBanner,
  getWhatsNewPopup,
  adminSetWhatsNewPopup,
  adminGetWeeklyEmailPreview,
  adminSendWeeklyEmail,
  adminListWeeklyEmailSends,
  adminSendTestWelcomeEmail,
  adminResetSubscriber,
  adminResendPreflight,
  getLiveCurrentParsha,
  adminGenerateSummary,
  adminListPdfsMissingAudio,
  adminGenerateAudio,
  adminGeneratePublicationMeta,
  adminListPdfsMissingDescription,
  adminUpdatePdfMeta,
} from "@/integrations/supabase/api.functions";
import { getParshaOverride } from "@/integrations/supabase/api.functions";
import { hebcalToParshaKey, PARSHIYOS } from "@/lib/parshiyos";
import {
  publicationForTitle,
} from "@/lib/badges";

import { getCurrentJewishYear } from "@/lib/jewish-year";
import { CheckCircle2, Circle, MinusCircle, Eye, Download, Loader2, AlertCircle } from "lucide-react";

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
  summary_quick: string | null;
  content_type: string | null;
  primary_category?: string | null;
  publication?: string | null;
  tags?: string[] | null;
  description?: string | null;
  audience?: string | null;
  featured_slot?: string | null;
  format_type?: string | null;
  page_count?: number | null;
  badge?: string | null;
};

import { formatTypeLabel } from "@/lib/format-labels";

const AUDIENCE_OPTIONS = ["Adults", "Families", "Children"] as const;
const FORMAT_TYPE_OPTIONS = ["Short Vorts", "Stories", "Halacha", "Essays"] as const;
const CONTENT_TYPE_OPTIONS = [
  "Questions & Answers",
  "Brief Insights",
  "Stories",
  "Parsha Essays",
  "Halacha",
  "In-Depth",
  "Mixed Collection",
] as const;
const BADGE_OPTIONS = ["Recommended", "Quick Read", "Kids' Pick"] as const;

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

const countWords = (text: string) => {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
};

const WordCountHint = ({
  text,
  min = 12,
  max = 22,
}: {
  text: string;
  min?: number;
  max?: number;
}) => {
  const words = countWords(text);
  const overMax = words > max;
  return (
    <div className="mt-1 flex items-center justify-between text-xs">
      <span className="text-muted-foreground">
        One sentence, {min}–{max} words.
      </span>
      <span className={overMax ? "font-medium text-amber-600" : "text-muted-foreground"}>
        {words} word{words === 1 ? "" : "s"}
      </span>
    </div>
  );
};

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
  const { session, loading, signInWithGoogle, signOut } = useAuth();
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
  const [wnEnabled, setWnEnabled] = useState(false);
  const [wnText, setWnText] = useState("");
  const [wnLinkUrl, setWnLinkUrl] = useState("");
  const [wnLinkLabel, setWnLinkLabel] = useState("");
  // What's New Popup
  type WnpItem = { title: string; description: string; linkUrl: string; linkLabel: string };
  const emptyItem = (): WnpItem => ({ title: "", description: "", linkUrl: "", linkLabel: "" });
  const [wnpEnabled, setWnpEnabled] = useState(false);
  const [wnpHeading, setWnpHeading] = useState("What's New");
  const [wnpItems, setWnpItems] = useState<WnpItem[]>([emptyItem()]);
  const [wnpVersion, setWnpVersion] = useState<string>("0");
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
  const [published, setPublished] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPublication, setUploadPublication] = useState<string>("");
  // Canonical publications (publications table). Empty before the migration runs,
  // in which case the Title field falls back to free text.
  type CanonicalPub = {
    id: string;
    name: string;
    publisher: string | null;
    default_audience: string | null;
    default_format_type: string | null;
    default_description?: string | null;
    sort_order: number;
    active: boolean;
  };
  const [canonicalPubs, setCanonicalPubs] = useState<CanonicalPub[]>([]);
  const [publicationId, setPublicationId] = useState<string>("");
  const [titleFreeText, setTitleFreeText] = useState(false);
  const [uploadPublicationTouched, setUploadPublicationTouched] = useState(false);
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadAudience, setUploadAudience] = useState<string>("");
  const [uploadFeaturedSlot, setUploadFeaturedSlot] = useState<string>("");
  const [uploadFormatType, setUploadFormatType] = useState<string>("");
  const [uploadPageCount, setUploadPageCount] = useState<string>("");
  const [uploadBadge, setUploadBadge] = useState<string>("");
  // Reveals the audience / format / description overrides beneath the publication picker.
  const [showUploadDetails, setShowUploadDetails] = useState(false);

  // Inline metadata editor state (per row) — publication / title / subtitle
  const [editMetaTitle, setEditMetaTitle] = useState("");
  const [editMetaSubtitle, setEditMetaSubtitle] = useState("");
  const [editMetaPublication, setEditMetaPublication] = useState<string>("");
  const [editMetaDescription, setEditMetaDescription] = useState("");
  const [editMetaAudience, setEditMetaAudience] = useState<string>("");
  const [editMetaFeaturedSlot, setEditMetaFeaturedSlot] = useState<string>("");
  const [editMetaFormatType, setEditMetaFormatType] = useState<string>("");
  const [editMetaContentType, setEditMetaContentType] = useState<string>("");
  const [editMetaPageCount, setEditMetaPageCount] = useState<string>("");
  const [editMetaBadge, setEditMetaBadge] = useState<string>("");
  const [savingMeta, setSavingMeta] = useState(false);

  // Inline "Replace PDF" editor state (per row)
  const [editingPdfId, setEditingPdfId] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);

  // Summary generation state (per row)
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null);
  const [summaryModal, setSummaryModal] = useState<
    | { kind: "success"; title: string; summary: string; contentType: string | null }
    | { kind: "error"; title: string; error: string }
    | null
  >(null);

  const handleGenerateSummary = async (row: PdfRow) => {
    if (!accessToken || generatingSummaryId) return;
    setGeneratingSummaryId(row.id);
    try {
      // Run summary + publication metadata in parallel.
      const [r, meta] = await Promise.all([
        adminGenerateSummary({ data: { accessToken, id: row.id } }),
        adminGeneratePublicationMeta({ data: { accessToken, id: row.id } }).catch((e) => ({
          ok: false as const,
          id: row.id,
          error: e instanceof Error ? e.message : "meta failed",
        })),
      ]);
      // Merge results into the row.
      setPdfs((prev) =>
        prev.map((p) => {
          if (p.id !== row.id) return p;
          const next = { ...p };
          if (r.ok) {
            next.summary_quick = r.summary_quick;
            next.content_type = r.content_type;
          }
          if (meta.ok) {
            if (meta.description) next.description = meta.description;
            if (meta.audience) (next as any).audience = meta.audience;
            if (meta.format_type) (next as any).format_type = meta.format_type;
            if (meta.page_count != null) (next as any).page_count = meta.page_count;
          }
          return next;
        }),
      );
      // If this row is currently in edit mode, pre-fill any empty fields
      // so the admin can review before saving.
      if (editingPdfId === row.id && meta.ok) {
        if (meta.description) setEditMetaDescription((prev) => prev || meta.description || "");
        if (meta.audience) setEditMetaAudience((prev) => prev || meta.audience || "");
        if (meta.format_type) setEditMetaFormatType((prev) => prev || meta.format_type || "");
        if (meta.page_count != null)
          setEditMetaPageCount((prev) => prev || String(meta.page_count));
      }
      if (r.ok) {
        setSummaryModal({
          kind: "success",
          title: row.title,
          summary: r.summary_quick ?? "(no summary returned)",
          contentType: r.content_type,
        });
      } else {
        setSummaryModal({ kind: "error", title: row.title, error: r.error });
      }
    } catch {
      setSummaryModal({
        kind: "error",
        title: row.title,
        error: "Something went wrong generating this summary. Please try again.",
      });
    } finally {
      setGeneratingSummaryId(null);
    }
  };

  // Bulk description generation state
  const [descBulk, setDescBulk] = useState<
    | { status: "idle" }
    | { status: "running"; current: number; total: number; currentTitle: string }
    | {
        status: "done";
        total: number;
        successes: number;
        failures: Array<{ id: string; title: string; error: string }>;
      }
  >({ status: "idle" });

  const handleGenerateAllDescriptions = async () => {
    if (!accessToken) return;
    if (descBulk.status === "running") return;
    let list: Array<{ id: string; title: string }> = [];
    try {
      const r = await adminListPdfsMissingDescription({ data: { accessToken } });
      list = r.rows;
    } catch (e) {
      setDescBulk({
        status: "done",
        total: 0,
        successes: 0,
        failures: [
          {
            id: "",
            title: "(list)",
            error: e instanceof Error ? e.message : "Failed to load list",
          },
        ],
      });
      return;
    }
    if (list.length === 0) {
      setDescBulk({ status: "done", total: 0, successes: 0, failures: [] });
      return;
    }
    const failures: Array<{ id: string; title: string; error: string }> = [];
    let successes = 0;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      setDescBulk({
        status: "running",
        current: i + 1,
        total: list.length,
        currentTitle: row.title,
      });
      try {
        const r = await adminGeneratePublicationMeta({ data: { accessToken, id: row.id } });
        if (r.ok) successes++;
        else failures.push({ id: row.id, title: row.title, error: r.error });
      } catch (e) {
        failures.push({
          id: row.id,
          title: row.title,
          error: e instanceof Error ? e.message : "Request failed",
        });
      }
    }
    setDescBulk({ status: "done", total: list.length, successes, failures });
    await refresh();
  };


  // Bulk audio generation state
  const [audioBulk, setAudioBulk] = useState<
    | { status: "idle" }
    | { status: "running"; current: number; total: number; currentTitle: string }
    | {
        status: "done";
        total: number;
        successes: number;
        failures: Array<{ id: string; title: string; error: string }>;
      }
  >({ status: "idle" });

  const handleGenerateAllAudio = async () => {
    if (!accessToken) return;
    if (audioBulk.status === "running") return;
    let list: Array<{ id: string; title: string }> = [];
    try {
      const r = await adminListPdfsMissingAudio({ data: { accessToken } });
      list = r.rows;
    } catch (e) {
      setAudioBulk({
        status: "done",
        total: 0,
        successes: 0,
        failures: [
          {
            id: "",
            title: "(list)",
            error: e instanceof Error ? e.message : "Failed to load list",
          },
        ],
      });
      return;
    }
    if (list.length === 0) {
      setAudioBulk({ status: "done", total: 0, successes: 0, failures: [] });
      return;
    }
    const failures: Array<{ id: string; title: string; error: string }> = [];
    let successes = 0;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      setAudioBulk({
        status: "running",
        current: i + 1,
        total: list.length,
        currentTitle: row.title,
      });
      try {
        const r = await adminGenerateAudio({ data: { accessToken, id: row.id } });
        if (r.ok) successes++;
        else failures.push({ id: row.id, title: row.title, error: r.error });
      } catch (e) {
        failures.push({
          id: row.id,
          title: row.title,
          error: e instanceof Error ? e.message : "Request failed",
        });
      }
    }
    setAudioBulk({ status: "done", total: list.length, successes, failures });
  };

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

  // Auto-suggest publication from the title unless the admin has touched the field.
  useEffect(() => {
    if (uploadPublicationTouched) return;
    const suggested = publicationForTitle(title) ?? "";
    setUploadPublication(suggested);
  }, [title, uploadPublicationTouched]);

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
        if (!cancelled) setSkipped(new Set(r.titleKeys.map((s: string) => s.toLowerCase())));
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

  // Unpublished (draft) PDFs for the CURRENT parsha + year — targets for "Publish All".
  const unpublishedForCurrent = pdfs.filter(
    (p) =>
      !p.published &&
      checklistParshaComparableKey &&
      jewishYear != null &&
      p.jewish_year === jewishYear &&
      toParshaComparableKey(p.parsha_key) === checklistParshaComparableKey,
  );

  const [publishingWeek, setPublishingWeek] = useState(false);
  type PublishResult = { id: string; title: string; status: "pending" | "ok" | "error"; error?: string };
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);
  const publishAllForWeek = async () => {
    if (!accessToken) return;
    if (unpublishedForCurrent.length === 0) {
      alert("No unpublished PDFs for this parsha.");
      return;
    }
    const targets = unpublishedForCurrent.map((p) => ({ id: p.id, title: p.title }));
    const titles = targets.map((p) => `• ${p.title}`).join("\n");
    const msg = `Publish ${targets.length} PDF${targets.length === 1 ? "" : "s"} for ${currentParshaLabel}?\n\n${titles}\n\nThis will make them live on the homepage.`;
    if (!confirm(msg)) return;
    setPublishingWeek(true);
    setPublishResults(targets.map((t) => ({ ...t, status: "pending" as const })));
    for (const t of targets) {
      try {
        await adminTogglePublished({ data: { accessToken, id: t.id, published: true } });
        setPublishResults((prev) =>
          (prev ?? []).map((r) => (r.id === t.id ? { ...r, status: "ok" as const } : r)),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown error";
        setPublishResults((prev) =>
          (prev ?? []).map((r) =>
            r.id === t.id ? { ...r, status: "error" as const, error: message } : r,
          ),
        );
      }
    }
    try {
      await refresh();
    } catch {
      /* ignore refresh errors; results already shown */
    }
    setPublishingWeek(false);
  };

  const PublishProgress = () => {
    if (!publishResults) return null;
    const total = publishResults.length;
    const done = publishResults.filter((r) => r.status !== "pending").length;
    const okCount = publishResults.filter((r) => r.status === "ok").length;
    const errCount = publishResults.filter((r) => r.status === "error").length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return (
      <div className="mt-4 w-full rounded-lg border border-accent/40 bg-background/60 p-4">
        <div className="flex items-center justify-between gap-3 text-sm font-medium">
          <span>
            {publishingWeek ? "Publishing…" : "Publish complete"} — {done}/{total}
          </span>
          <span className="text-muted-foreground font-normal">
            {okCount} published{errCount > 0 ? ` · ${errCount} failed` : ""}
          </span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-accent/20"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="mt-3 space-y-1.5">
          {publishResults.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-sm">
              {r.status === "pending" && (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
              {r.status === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              {r.status === "error" && (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <span className="min-w-0 flex-1">
                <span className={r.status === "error" ? "text-destructive" : ""}>{r.title}</span>
                {r.status === "error" && r.error && (
                  <span className="block text-xs text-destructive/80">{r.error}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {!publishingWeek && (
          <button
            type="button"
            onClick={() => setPublishResults(null)}
            className="mt-3 text-xs font-semibold text-muted-foreground underline hover:text-foreground"
          >
            Dismiss
          </button>
        )}
      </div>
    );
  };


  // Select a canonical publication by id: fills the title and the canonical defaults.
  const selectPublicationId = (id: string) => {
    setPublicationId(id);
    const pub = canonicalPubs.find((p) => p.id === id);
    if (!pub) return;
    setTitle(pub.name);
    setUploadAudience(pub.default_audience ?? "");
    setUploadFormatType(pub.default_format_type ?? "");
    setUploadDescription((pub as { default_description?: string | null }).default_description ?? "");
    setShowUploadDetails(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await listCanonicalPublications();
        setCanonicalPubs((r?.publications ?? []) as CanonicalPub[]);
      } catch {
        setCanonicalPubs([]);
      }
    })();
  }, []);

  const useExpectedTitle = (title: string) => {
    setTitle(title);
    const match = canonicalPubs.find(
      (p) => p.name.trim().toLowerCase() === title.trim().toLowerCase(),
    );
    if (match) {
      selectPublicationId(match.id);
      setTitleFreeText(false);
    } else {
      setPublicationId("");
      setTitleFreeText(true);
    }
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
    const [p, s, o, cs, cm, ann, wn, wnp] = await Promise.all([
      adminListPdfs({ data: { accessToken } }),
      adminListSubscribers({ data: { accessToken } }),
      getParshaOverride(),
      adminListChecklistSources({ data: { accessToken } }),
      adminListContactMessages({ data: { accessToken } }).then(
        (r) => ({ ok: true as const, messages: r.messages as ContactMessageRow[] }),
        (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "unknown" }),
      ),
      getAnnouncementBanner(),
      getWhatsNewBanner(),
      getWhatsNewPopup(),
    ]);
    setPdfs(p.pdfs as PdfRow[]);
    setSubscribers(s.subscribers as Subscriber[]);
    setOverride(o.override ?? "");
    setSources(cs.sources as ChecklistSource[]);
    setAnnEnabled(ann.enabled);
    setAnnText(ann.text ?? "");
    setAnnLinkUrl(ann.linkUrl ?? "");
    setAnnLinkLabel(ann.linkLabel ?? "");
    setWnEnabled(wn.enabled);
    setWnText(wn.text ?? "");
    setWnLinkUrl(wn.linkUrl ?? "");
    setWnLinkLabel(wn.linkLabel ?? "");
    setWnpEnabled(wnp.enabled);
    setWnpHeading(wnp.heading || "What's New");
    setWnpItems(
      wnp.items.length > 0
        ? wnp.items.map((i) => ({
            title: i.title,
            description: i.description ?? "",
            linkUrl: i.linkUrl ?? "",
            linkLabel: i.linkLabel ?? "",
          }))
        : [emptyItem()],
    );
    setWnpVersion(wnp.version);
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
      const jewishYear = await getCurrentJewishYear();

      // UI-side duplicate guard: same parsha + jewish year + source/placement (title).
      const incomingTitleKey = normalizeTitleKey(title);
      const incomingParshaKey = toParshaComparableKey(parshaKey);
      const dup = pdfs.find(
        (p) =>
          p.jewish_year === jewishYear &&
          toParshaComparableKey(p.parsha_key) === incomingParshaKey &&
          normalizeTitleKey(p.title) === incomingTitleKey,
      );
      if (dup) {
        setMsg({
          kind: "error",
          text: "A file is already uploaded for this placement. Delete the existing one first if you want to replace it.",
        });
        setBusy(false);
        return;
      }

      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const fileBase64 = btoa(bin);
      const uploaded = await adminUploadPdf({
        data: {
          accessToken,
          parshaKey,
          title,
          subtitle: null,
          published,
          fileName: file.name,
          fileBase64,
          jewishYear,
          publicationId: publicationId || null,
          primaryCategory: null,
          publication: (uploadPublication || null) as any,
          tags: null,
          description: uploadDescription.trim() ? uploadDescription.trim() : null,
          audience: (uploadAudience || null) as any,
          featuredSlot: null,
          formatType: (uploadFormatType || null) as any,
          // page_count is derived from the PDF server-side.
          pageCount: null,
          badge: null,
        },
      });
      // Best-effort first-page preview; a failure must not fail the upload.
      if (uploaded?.id) {
        try {
          const { renderFirstPageThumbBase64 } = await import("@/lib/pdf-thumb");
          const pngBase64 = await renderFirstPageThumbBase64(file);
          if (pngBase64) {
            await adminUploadPdfThumb({ data: { accessToken, id: uploaded.id, pngBase64 } });
          }
        } catch (e) {
          console.error("thumbnail generation failed", e);
        }
      }
      setTitle("");
      setPublicationId("");
      setTitleFreeText(false);
      setSubtitle("");
      setFile(null);
      setUploadPublication("");
      setUploadPublicationTouched(false);
      setUploadDescription("");
      setUploadAudience("");
      setUploadFeaturedSlot("");
      setUploadFormatType("");
      setUploadPageCount("");
      setUploadBadge("");
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
    const row = pdfs.find((p) => p.id === id);
    setEditMetaTitle(row?.title ?? "");
    setEditMetaSubtitle(row?.subtitle ?? "");
    setEditMetaPublication((row?.publication as string) ?? "");
    setEditMetaDescription((row?.description as string) ?? "");
    setEditMetaAudience((row?.audience as string) ?? "");
    setEditMetaFeaturedSlot((row?.featured_slot as string) ?? "");
    setEditMetaFormatType((row?.format_type as string) ?? "");
    setEditMetaContentType((row?.content_type as string) ?? "");
    setEditMetaPageCount(row?.page_count != null ? String(row.page_count) : "");
    setEditMetaBadge((row?.badge as string) ?? "");
  };

  const cancelEditPdf = () => {
    setEditingPdfId(null);
    setReplaceFile(null);
  };

  const handleSaveMeta = async (id: string) => {
    if (!accessToken) return;
    setSavingMeta(true);
    setMsg(null);
    try {
      await adminUpdatePdfMeta({
        data: {
          accessToken,
          id,
          title: editMetaTitle,
          subtitle: editMetaSubtitle || null,
          primaryCategory: null,
          publication: (editMetaPublication || null) as any,
          tags: null,
          description: editMetaDescription.trim() ? editMetaDescription.trim() : null,
          audience: (editMetaAudience || null) as any,
          featuredSlot: (editMetaFeaturedSlot || null) as any,
          formatType: (editMetaFormatType || null) as any,
          contentType: (editMetaContentType || null) as any,
          pageCount: editMetaPageCount.trim() ? Number(editMetaPageCount) : null,
          badge: (editMetaBadge || null) as any,
        },
      });
      setMsg({ kind: "success", text: "Metadata saved." });
      await refresh();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setMsg({ kind: "error", text: `Save failed: ${detail}` });
    } finally {
      setSavingMeta(false);
    }
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
      // Regenerate the preview so the card never shows the previous sheet.
      try {
        const { renderFirstPageThumbBase64 } = await import("@/lib/pdf-thumb");
        const pngBase64 = await renderFirstPageThumbBase64(replaceFile);
        if (pngBase64) {
          await adminUploadPdfThumb({ data: { accessToken, id, pngBase64 } });
        }
      } catch (e) {
        console.error("thumbnail regeneration failed", e);
      }
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

  const handleSaveWhatsNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminSetWhatsNewBanner({
        data: {
          accessToken,
          enabled: wnEnabled,
          text: wnText.trim() ? wnText.trim() : null,
          linkUrl: wnLinkUrl.trim() ? wnLinkUrl.trim() : null,
          linkLabel: wnLinkLabel.trim() ? wnLinkLabel.trim() : null,
        },
      });
      setMsg({ kind: "success", text: "What's New banner saved." });
    } catch (err) {
      setMsg({
        kind: "error",
        text: `Save failed: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const updateWnpItem = (idx: number, patch: Partial<WnpItem>) => {
    setWnpItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addWnpItem = () => {
    setWnpItems((items) => (items.length >= 4 ? items : [...items, emptyItem()]));
  };
  const removeWnpItem = (idx: number) => {
    setWnpItems((items) => (items.length <= 1 ? items : items.filter((_, i) => i !== idx)));
  };

  const handleSaveWhatsNewPopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setMsg(null);
    try {
      const cleanedItems = wnpItems
        .map((i) => ({
          title: i.title.trim(),
          description: i.description.trim() || null,
          linkUrl: i.linkUrl.trim() || null,
          linkLabel: i.linkLabel.trim() || null,
        }))
        .filter((i) => i.title.length > 0);
      if (cleanedItems.length === 0 && wnpEnabled) {
        setMsg({ kind: "error", text: "Add at least one item with a title, or disable the popup." });
        setBusy(false);
        return;
      }
      const res = await adminSetWhatsNewPopup({
        data: {
          accessToken,
          enabled: wnpEnabled,
          heading: wnpHeading.trim() || "What's New",
          items: cleanedItems,
        },
      });
      setWnpVersion(res.version);
      setMsg({ kind: "success", text: `What's New popup saved (version ${res.version}).` });
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
            <p className="mt-3 text-muted-foreground">Sign in with Google to manage Torah PDFs.</p>
            <button
              onClick={signInWithGoogle}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign in with Google
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
            <h2 className="font-serif text-2xl font-semibold text-primary">Manual Parshas Override</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Leave empty to use Hebcal's automatic Parshas. An override only applies to the current week's Shabbos — once that Shabbos passes, Hebcal automatically takes over again.
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

        {/* What's New Banner */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">
              What&rsquo;s New Banner
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              A compact pill badge that sits above the announcement bar on the homepage. Independent of the Announcement Banner.
            </p>
            <form onSubmit={handleSaveWhatsNew} className="mt-4 space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={wnEnabled}
                  onChange={(e) => setWnEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="font-medium">Enable What&rsquo;s New badge</span>
              </label>

              <div>
                <label className="block text-sm font-medium mb-1">Badge Text</label>
                <textarea
                  value={wnText}
                  onChange={(e) => setWnText(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="e.g., New publication added: Peninei Mechkerei Eretz"
                  className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Link URL (optional)</label>
                  <input
                    type="url"
                    value={wnLinkUrl}
                    onChange={(e) => setWnLinkUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Link Label (optional)</label>
                  <input
                    type="text"
                    value={wnLinkLabel}
                    onChange={(e) => setWnLinkLabel(e.target.value)}
                    maxLength={120}
                    placeholder="See it"
                    className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Link only appears when both URL and Label are filled in.
              </p>

              <button
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                Save What&rsquo;s New
              </button>
            </form>
          </div>
        </section>

        {/* What's New Popup */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <h2 className="font-serif text-2xl font-semibold text-primary">
              What&rsquo;s New Popup
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              A centered modal shown on the homepage. Up to 4 items. Editing and saving auto-bumps the version so returning visitors see the update.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Current version: <code className="font-mono">{wnpVersion}</code>
            </p>
            <form onSubmit={handleSaveWhatsNewPopup} className="mt-4 space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={wnpEnabled}
                  onChange={(e) => setWnpEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="font-medium">Enable What&rsquo;s New popup</span>
              </label>

              <div>
                <label className="block text-sm font-medium mb-1">Heading</label>
                <input
                  type="text"
                  value={wnpHeading}
                  onChange={(e) => setWnpHeading(e.target.value)}
                  maxLength={200}
                  placeholder="What's New"
                  className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                />
              </div>

              <div className="space-y-4">
                {wnpItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border-2 border-accent/40 bg-background/50 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary">Item {idx + 1}</span>
                      {wnpItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeWnpItem(idx)}
                          className="text-xs text-red-700 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => updateWnpItem(idx, { title: e.target.value })}
                      maxLength={200}
                      placeholder="Title (required)"
                      className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm"
                    />
                    <textarea
                      value={item.description}
                      onChange={(e) => updateWnpItem(idx, { description: e.target.value })}
                      rows={2}
                      maxLength={500}
                      placeholder="Description (optional)"
                      className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="url"
                        value={item.linkUrl}
                        onChange={(e) => updateWnpItem(idx, { linkUrl: e.target.value })}
                        placeholder="Link URL (optional)"
                        className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={item.linkLabel}
                        onChange={(e) => updateWnpItem(idx, { linkLabel: e.target.value })}
                        maxLength={120}
                        placeholder="Link label (optional)"
                        className="w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {wnpItems.length < 4 && (
                <button
                  type="button"
                  onClick={addWnpItem}
                  className="rounded-md border-2 border-accent/60 bg-background px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent/10"
                >
                  + Add item ({wnpItems.length}/4)
                </button>
              )}

              <button
                disabled={busy}
                className="block rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                Save popup
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
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm font-medium text-primary">
                  {uploadedCount} uploaded
                  <span className="text-muted-foreground font-normal">
                    {" "}· {checklist.length - countableTotal} skipped ·{" "}
                    {countableTotal - uploadedCount} remaining
                  </span>
                </div>
                <button
                  type="button"
                  onClick={publishAllForWeek}
                  disabled={publishingWeek || unpublishedForCurrent.length === 0}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title={unpublishedForCurrent.length === 0 ? "No draft PDFs for this parsha" : `Publish ${unpublishedForCurrent.length} draft PDF${unpublishedForCurrent.length === 1 ? "" : "s"} for this week`}
                >
                  {publishingWeek
                    ? "Publishing…"
                    : `Publish All for This Week${unpublishedForCurrent.length > 0 ? ` (${unpublishedForCurrent.length})` : ""}`}
                </button>
              </div>
            </div>

            <PublishProgress />


            <ul className="mt-4 divide-y divide-accent/30">
              {checklist.map((item) => (
                <li
                  key={item.title}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 basis-full sm:basis-auto">
                    {item.status === "uploaded" && (
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    )}
                    {item.status === "missing" && (
                      <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    {item.status === "skipped" && (
                      <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium break-words min-w-0 flex-1">{item.title}</span>
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
                  <div className="flex items-center gap-2 shrink-0 ml-8 sm:ml-0">
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
              <table className="w-full min-w-[520px] text-sm">

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
                <span className="text-sm font-medium">Parshas</span>
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
              <div className="block">
                <label className="block">
                  <span className="text-sm font-medium">Publication</span>
                  {canonicalPubs.length > 0 && !titleFreeText ? (
                    <select
                      required
                      value={publicationId}
                      onChange={(e) => selectPublicationId(e.target.value)}
                      className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                    >
                      <option value="" disabled>
                        Select a publication
                      </option>
                      {canonicalPubs
                        .filter((p) => p.active)
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <>
                      <input
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                      />
                      {canonicalPubs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTitleFreeText(false);
                            setTitle("");
                          }}
                          className="mt-1 text-xs font-semibold text-accent underline"
                        >
                          Choose from publications instead
                        </button>
                      )}
                    </>
                  )}
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {[formatTypeLabel(uploadAudience), formatTypeLabel(uploadFormatType)]
                      .filter(Boolean)
                      .join(" · ") || "No defaults set"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowUploadDetails((v) => !v)}
                    className="font-semibold text-accent underline"
                  >
                    {showUploadDetails ? "Hide details" : "Edit details"}
                  </button>
                </div>
              </div>
              {showUploadDetails && (
                <>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium">Description</span>
                    <input
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      maxLength={500}
                      placeholder="e.g. Short vorts drawn from the classic meforshim."
                      className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                    />
                    <WordCountHint text={uploadDescription} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Audience</span>
                    <select
                      value={uploadAudience}
                      onChange={(e) => setUploadAudience(e.target.value)}
                      className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                    >
                      <option value="">— none —</option>
                      {AUDIENCE_OPTIONS.map((o) => (
                        <option key={o} value={o}>{formatTypeLabel(o)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Format</span>
                    <select
                      value={uploadFormatType}
                      onChange={(e) => setUploadFormatType(e.target.value)}
                      className="mt-1 w-full rounded-md border-2 border-accent/60 bg-background px-3 py-2"
                    >
                      <option value="">— none —</option>
                      {FORMAT_TYPE_OPTIONS.map((o) => (
                        <option key={o} value={o}>{formatTypeLabel(o)}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

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

            <div className="mt-6 border-t border-accent/30 pt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={publishAllForWeek}
                disabled={publishingWeek || unpublishedForCurrent.length === 0}
                className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  unpublishedForCurrent.length === 0
                    ? "No draft PDFs for this parsha"
                    : `Publish ${unpublishedForCurrent.length} draft PDF${unpublishedForCurrent.length === 1 ? "" : "s"} for this week`
                }
              >
                {publishingWeek
                  ? "Publishing…"
                  : `Publish All for This Week${unpublishedForCurrent.length > 0 ? ` (${unpublishedForCurrent.length})` : ""}`}
              </button>
              <span className="text-sm text-muted-foreground">
                {unpublishedForCurrent.length === 0
                  ? `No unpublished PDFs for ${currentParshaLabel}.`
                  : `${unpublishedForCurrent.length} draft PDF${unpublishedForCurrent.length === 1 ? "" : "s"} for ${currentParshaLabel} waiting to go live.`}
              </span>
            </div>
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
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
                    <button
                      type="button"
                      onClick={handleGenerateAllAudio}
                      disabled={audioBulk.status === "running"}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      🔊{" "}
                      {audioBulk.status === "running"
                        ? `Generating audio: ${audioBulk.current} of ${audioBulk.total}...`
                        : "Generate All Audio"}
                    </button>
                    {audioBulk.status === "running" && (
                      <span className="text-xs text-muted-foreground truncate max-w-[60ch]">
                        {audioBulk.currentTitle}
                      </span>
                    )}
                    {audioBulk.status === "done" && (
                      <div className="text-sm">
                        {audioBulk.total === 0 ? (
                          <span className="text-muted-foreground">
                            No PDFs need audio generation.
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <div>
                              Done: <strong>{audioBulk.successes}</strong> succeeded,{" "}
                              <strong>{audioBulk.failures.length}</strong> failed (of{" "}
                              {audioBulk.total}).
                            </div>
                            {audioBulk.failures.length > 0 && (
                              <ul className="list-disc pl-5 text-xs text-destructive space-y-0.5">
                                {audioBulk.failures.map((f, i) => (
                                  <li key={`${f.id}-${i}`}>
                                    <span className="font-medium">{f.title}:</span> {f.error}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
                    <button
                      type="button"
                      onClick={handleGenerateAllDescriptions}
                      disabled={descBulk.status === "running"}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      📝{" "}
                      {descBulk.status === "running"
                        ? `Generating descriptions: ${descBulk.current} of ${descBulk.total}...`
                        : "Generate All Descriptions"}
                    </button>
                    {descBulk.status === "running" && (
                      <span className="text-xs text-muted-foreground truncate max-w-[60ch]">
                        {descBulk.currentTitle}
                      </span>
                    )}
                    {descBulk.status === "done" && (
                      <div className="text-sm">
                        {descBulk.total === 0 ? (
                          <span className="text-muted-foreground">
                            All PDFs already have descriptions.
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <div>
                              Done: <strong>{descBulk.successes}</strong> succeeded,{" "}
                              <strong>{descBulk.failures.length}</strong> failed (of{" "}
                              {descBulk.total}).
                            </div>
                            {descBulk.failures.length > 0 && (
                              <ul className="list-disc pl-5 text-xs text-destructive space-y-0.5">
                                {descBulk.failures.map((f, i) => (
                                  <li key={`${f.id}-${i}`}>
                                    <span className="font-medium">{f.title}:</span> {f.error}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left border-b">
                        <tr>
                          <th className="py-2 pr-3">Parshas</th>
                          <th className="py-2 pr-3">Year</th>
                          <th className="py-2 pr-3">Title</th>
                          <th className="py-2 pr-3">Published</th>
                          <th className="py-2 pr-3">Created</th>
                          <th className="py-2 pr-3">Actions</th>
                          <th className="py-2 text-right">Edit</th>
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
                              <a
                                href={`/view/${p.id}/download`}
                                className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                <Download className="h-3 w-3" /> Download
                              </a>
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() =>
                                    editingPdfId === p.id ? cancelEditPdf() : startEditPdf(p.id)
                                  }
                                  className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                                >
                                  {editingPdfId === p.id ? "Close" : "Edit / Replace"}
                                </button>
                                {/* Summary generation temporarily discontinued */}
                                <button
                                  onClick={() => handleDelete(p.id)}
                                  className="inline-flex items-center gap-1 rounded-full border border-destructive/70 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
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
                                  <div className="md:col-span-2 rounded-md border border-accent/60 bg-background p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                      Edit metadata
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <label className="block">
                                        <span className="text-xs font-medium">Title</span>
                                        <input
                                          value={editMetaTitle}
                                          onChange={(e) => setEditMetaTitle(e.target.value)}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        />
                                      </label>
                                      <label className="block">
                                        <span className="text-xs font-medium">Subtitle</span>
                                        <input
                                          value={editMetaSubtitle}
                                          onChange={(e) => setEditMetaSubtitle(e.target.value)}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        />
                                      </label>
                                      <label className="block md:col-span-2">
                                        <span className="text-xs font-medium">Description</span>
                                        <input
                                          value={editMetaDescription}
                                          onChange={(e) => setEditMetaDescription(e.target.value)}
                                          maxLength={500}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        />
                                        <WordCountHint text={editMetaDescription} />
                                      </label>
                                      <label className="block">
                                        <span className="text-xs font-medium">Audience</span>
                                        <select
                                          value={editMetaAudience}
                                          onChange={(e) => setEditMetaAudience(e.target.value)}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        >
                                          <option value="">— none —</option>
                                          {AUDIENCE_OPTIONS.map((o) => (
                                            <option key={o} value={o}>{formatTypeLabel(o)}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="block">
                                        <span className="text-xs font-medium">Recommended pick slot</span>
                                        <select
                                          value={editMetaFeaturedSlot}
                                          onChange={(e) => setEditMetaFeaturedSlot(e.target.value)}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        >
                                          <option value="">— none —</option>
                  <option value="children">Best for Children</option>
                  <option value="family">Best for the Family Table</option>
                  <option value="quickest">Quickest Read</option>
                  <option value="deeper">Deeper Learning</option>
                                        </select>
                                      </label>
                                      <label className="block">
                                        <span className="text-xs font-medium">Content type</span>
                                        <select
                                          value={editMetaContentType}
                                          onChange={(e) => setEditMetaContentType(e.target.value)}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        >
                                          <option value="">— none —</option>
                                          {CONTENT_TYPE_OPTIONS.map((o) => (
                                            <option key={o} value={o}>{formatTypeLabel(o)}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="block">
                                        <span className="text-xs font-medium">Format</span>
                                        <select
                                          value={editMetaFormatType}
                                          onChange={(e) => setEditMetaFormatType(e.target.value)}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        >
                                          <option value="">— none —</option>
                                          {FORMAT_TYPE_OPTIONS.map((o) => (
                                            <option key={o} value={o}>{formatTypeLabel(o)}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="block">
                                        <span className="text-xs font-medium">Page count</span>
                                        <input
                                          type="number"
                                          min={0}
                                          value={editMetaPageCount}
                                          onChange={(e) => setEditMetaPageCount(e.target.value)}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        />
                                      </label>
                                      <label className="block">
                                        <span className="text-xs font-medium">Highlight badge</span>
                                        <select
                                          value={editMetaBadge}
                                          onChange={(e) => setEditMetaBadge(e.target.value)}
                                          className="mt-1 w-full rounded-md border border-accent/60 bg-background px-2 py-1 text-sm"
                                        >
                                          <option value="">— none —</option>
                                          {BADGE_OPTIONS.map((o) => (
                                            <option key={o} value={o}>{formatTypeLabel(o)}</option>
                                          ))}
                                        </select>
                                      </label>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveMeta(p.id)}
                                        disabled={savingMeta}
                                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                                      >
                                        {savingMeta ? "Saving…" : "Save metadata"}
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

        {/* Unified analytics overview */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <UnifiedDashboard accessToken={accessToken ?? ""} />
          </div>
        </section>

        {/* Download analytics */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <DownloadAnalytics accessToken={accessToken ?? ""} />
          </div>
        </section>

        {/* Subscribers */}
        <section className="parchment-frame">
          <div className="parchment-panel">
            <SubscribersManager
              accessToken={accessToken}
              subscribers={subscribers}
              onChanged={refresh}
            />

            {/* Welcome email test tool */}
            <div className="mt-6 rounded-md border border-border bg-background/60 p-3">
              <div className="text-sm font-medium mb-2">Welcome email test</div>
              <WelcomeEmailTester accessToken={accessToken} onResetDone={refresh} />
            </div>
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
      {summaryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSummaryModal(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">{summaryModal.title}</h3>
            {summaryModal.kind === "success" ? (
              <>
                <div className="mt-2 text-sm text-muted-foreground">
                  Content Type: <span className="font-medium text-foreground">{summaryModal.contentType ?? "—"}</span>
                </div>
                <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
                  {summaryModal.summary}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive whitespace-pre-wrap">
                {summaryModal.error}
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSummaryModal(null)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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

type SubscribersManagerProps = {
  accessToken: string | null;
  subscribers: Subscriber[];
  onChanged: () => Promise<void> | void;
};

function formatSignupDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function SubscribersManager({ accessToken, subscribers, onChanged }: SubscribersManagerProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter((s) => s.email.toLowerCase().includes(q));
  }, [subscribers, query]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const s of filtered) next.delete(s.id);
      } else {
        for (const s of filtered) next.add(s.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runDelete = async (ids: string[], emails: string[]) => {
    if (ids.length === 0) return;
    if (!accessToken) return;
    const preview = emails.slice(0, 10).join("\n");
    const more = emails.length > 10 ? `\n…and ${emails.length - 10} more` : "";
    const msg =
      ids.length === 1
        ? `Delete this subscriber?\n\n${preview}\n\nThis cannot be undone.`
        : `Delete ${ids.length} subscribers?\n\n${preview}${more}\n\nThis cannot be undone.`;
    if (!confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteSubscribers({ data: { accessToken, ids } });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = () => {
    const ids = Array.from(selected);
    const emailById = new Map(subscribers.map((s) => [s.id, s.email]));
    const emails = ids.map((id) => emailById.get(id) ?? id);
    runDelete(ids, emails);
  };

  const deleteOne = (row: Subscriber) => runDelete([row.id], [row.email]);

  const downloadCsv = () => {
    const escape = (v: string) => {
      if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const header = "email,signup_date\n";
    const body = subscribers
      .map((s) => `${escape(s.email)},${escape(formatSignupDate(s.created_at))}`)
      .join("\n");
    const csv = header + body + (body ? "\n" : "");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl font-semibold text-primary">
          Subscribers ({subscribers.length})
        </h2>
        <div className="text-xs text-muted-foreground">
          {selected.size > 0 ? `${selected.size} selected` : `Showing ${filtered.length} of ${subscribers.length}`}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search by email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[220px] rounded border border-input bg-background px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={downloadCsv}
          disabled={subscribers.length === 0}
          className="rounded border border-input px-3 py-1 text-sm disabled:opacity-50"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={busy || selected.size === 0}
          className="rounded border border-destructive px-3 py-1 text-sm text-destructive disabled:opacity-50"
        >
          {busy ? "Deleting…" : `Delete selected${selected.size ? ` (${selected.size})` : ""}`}
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-destructive">{error}</div>}

      <div className="mt-3 max-h-96 overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2 text-left">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Signup date</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-border/60">
                <td className="px-2 py-2 align-middle">
                  <input
                    type="checkbox"
                    aria-label={`Select ${s.email}`}
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                  />
                </td>
                <td className="px-2 py-2 align-middle break-all">{s.email}</td>
                <td className="px-2 py-2 align-middle whitespace-nowrap text-muted-foreground">
                  {formatSignupDate(s.created_at)}
                </td>
                <td className="px-2 py-2 align-middle text-right">
                  <button
                    type="button"
                    onClick={() => deleteOne(s)}
                    disabled={busy}
                    className="rounded border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                  {subscribers.length === 0 ? "No subscribers yet." : "No matches for that search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { fetchHebcalShabbatData, resolveReadingFromHebcal } from "@/lib/hebcal";
import { getCurrentJewishYear } from "@/lib/jewish-year";
import { toParshaComparableKey } from "@/lib/parsha-normalize";

const SITE_URL = "https://torahforthetable.com";

async function requireAdmin(accessToken: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const cloudUrl = process.env.SUPABASE_URL;
  const cloudKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!cloudUrl || !cloudKey) throw new Error("Server misconfigured");

  const cloud = createClient(cloudUrl, cloudKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await cloud.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Not authenticated");

  const email = (data.user.email ?? "").toLowerCase();
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allow.includes(email)) throw new Error("Forbidden");
  return data.user.id;
}

type WeeklyResource = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  audience: string | null;
  formatType: string | null;
  contentType: string | null;
  primaryCategory: string | null;
  tags: string[];
  pageCount: number | null;
  featuredSlot: string | null;
  sortOrder: number;
};

type PreferenceRow = {
  subscriber_id: string;
  wants_children: boolean;
  wants_family_story: boolean;
  wants_quick_vort: boolean;
  wants_questions: boolean;
  wants_halacha: boolean;
  wants_deeper: boolean;
  max_pages: number | null;
};

type Recipient = {
  id: string;
  email: string;
  unsubscribe_token: string;
};

function normalize(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function titleKey(s: string | null | undefined) {
  return normalize(s)
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9]+/g, "");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isOverrideCurrent(updatedAt: string | null, shabbosDate: string | null) {
  if (!updatedAt || !shabbosDate) return false;
  const shabbos = new Date(`${shabbosDate}T00:00:00Z`);
  const start = new Date(shabbos.getTime() - 6 * 24 * 60 * 60 * 1000);
  const end = new Date(shabbos.getTime() + 24 * 60 * 60 * 1000 - 1);
  const updated = new Date(updatedAt);
  return updated >= start && updated <= end;
}

async function resolveCurrentWeek() {
  const admin = getSupabaseAdmin();
  let rawKey: string | null = null;
  let shabbosDate: string | null = null;

  try {
    const resolved = resolveReadingFromHebcal(await fetchHebcalShabbatData());
    rawKey = resolved.parshaKey;
    shabbosDate = resolved.readingDate;
  } catch {
    // settings override below can still rescue the current week
  }

  try {
    const { data } = await admin
      .from("settings")
      .select("parsha_override, updated_at")
      .eq("id", 1)
      .maybeSingle();
    const override = (data?.parsha_override as string | null) ?? null;
    const updatedAt = (data?.updated_at as string | null) ?? null;
    if (override && isOverrideCurrent(updatedAt, shabbosDate)) rawKey = override;
  } catch {
    // keep Hebcal value
  }

  const jewishYear = await getCurrentJewishYear();
  if (!rawKey) return { parshaKey: null, parshaLabel: null, jewishYear };

  const yomTov = new Set([
    "Rosh Hashanah",
    "Yom Kippur",
    "Sukkos",
    "Shemini Atzeres",
    "Simchas Torah",
    "Pesach",
    "Shavuos",
  ]);
  const parshaLabel = rawKey.startsWith("Parshas") || yomTov.has(rawKey)
    ? rawKey
    : `Parshas ${rawKey}`;
  return { parshaKey: rawKey, parshaLabel, jewishYear };
}

async function loadResources(parshaKey: string, jewishYear: number): Promise<WeeklyResource[]> {
  const admin = getSupabaseAdmin();
  const target = toParshaComparableKey(parshaKey);

  const [{ data: rows, error }, { data: sources }, { data: pubs }] = await Promise.all([
    admin
      .from("pdfs")
      .select(
        "id, title, subtitle, description, audience, format_type, content_type, primary_category, tags, page_count, featured_slot, parsha_key, jewish_year, publication_id, created_at",
      )
      .eq("published", true)
      .eq("jewish_year", jewishYear)
      .order("created_at", { ascending: false }),
    admin.from("checklist_sources").select("title, sort_order"),
    admin.from("publications").select("id, name, sort_order"),
  ]);
  if (error) throw new Error(`Could not load weekly PDFs: ${error.message}`);

  const sourceOrder = new Map<string, number>();
  for (const s of sources ?? []) {
    const key = titleKey(s.title as string | null);
    if (key && typeof s.sort_order === "number") sourceOrder.set(key, s.sort_order);
  }

  const publicationById = new Map<string, { name: string; sortOrder: number | null }>();
  for (const p of pubs ?? []) {
    publicationById.set(p.id as string, {
      name: p.name as string,
      sortOrder: typeof p.sort_order === "number" ? p.sort_order : null,
    });
  }

  const matched = (rows ?? []).filter(
    (r: any) => toParshaComparableKey(r.parsha_key as string) === target,
  );

  return matched
    .map((r: any) => {
      const canonical = r.publication_id
        ? publicationById.get(r.publication_id as string)
        : undefined;
      const displayTitle = canonical?.name || (r.title as string);
      const order = sourceOrder.get(titleKey(displayTitle)) ?? canonical?.sortOrder ?? 999999;
      return {
        id: r.id as string,
        title: displayTitle,
        subtitle: (r.subtitle as string | null) ?? null,
        description: (r.description as string | null) ?? null,
        audience: (r.audience as string | null) ?? null,
        formatType: (r.format_type as string | null) ?? null,
        contentType: (r.content_type as string | null) ?? null,
        primaryCategory: (r.primary_category as string | null) ?? null,
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        pageCount: typeof r.page_count === "number" ? r.page_count : null,
        featuredSlot: (r.featured_slot as string | null) ?? null,
        sortOrder: order,
      } satisfies WeeklyResource;
    })
    .sort(
      (a: WeeklyResource, b: WeeklyResource) =>
        a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
    );
}

// The display label may be a special-week override (e.g. "Shabbos Shuva
// Parshas Haazinu and Yom Kippur") that is not a stored parsha_key. Resolve
// the collection the site actually displays: the live key when it has
// published PDFs, otherwise the most recent published collection.
async function resolveDisplayedCollectionKey(
  rawKey: string | null,
  jewishYear: number,
): Promise<{ parshaKey: string | null; jewishYear: number }> {
  const admin = getSupabaseAdmin();
  const { data: rows } = await admin
    .from("pdfs")
    .select("parsha_key, jewish_year, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });
  const all = (rows ?? []) as any[];
  if (all.length === 0) return { parshaKey: rawKey, jewishYear };

  if (rawKey) {
    const target = toParshaComparableKey(rawKey);
    const matched = all.filter(
      (r) => toParshaComparableKey(r.parsha_key as string) === target,
    );
    if (matched.length > 0) {
      let latestYear: number | null = null;
      for (const r of matched) {
        const y = typeof r.jewish_year === "number" ? r.jewish_year : null;
        if (y != null && (latestYear == null || y > latestYear)) latestYear = y;
      }
      const head = matched.find((r) => r.jewish_year === latestYear) ?? matched[0];
      return {
        parshaKey: (head.parsha_key as string) ?? rawKey,
        jewishYear: latestYear ?? jewishYear,
      };
    }
  }

  const head = all[0];
  return {
    parshaKey: (head.parsha_key as string) ?? rawKey,
    jewishYear: (head.jewish_year as number | null) ?? jewishYear,
  };
}

function searchableText(r: WeeklyResource) {
  return [r.title, r.subtitle, r.description, r.contentType, r.primaryCategory, ...r.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pickFirst(
  resources: WeeklyResource[],
  predicate: (r: WeeklyResource) => boolean,
  sort?: (a: WeeklyResource, b: WeeklyResource) => number,
) {
  const list = resources.filter(predicate);
  if (sort) list.sort(sort);
  return list[0] ?? null;
}

function defaultCuratedPicks(resources: WeeklyResource[]) {
  const selected: WeeklyResource[] = [];
  const add = (r: WeeklyResource | null) => {
    if (r && !selected.some((x) => x.id === r.id)) selected.push(r);
  };

  add(pickFirst(resources, (r) => normalize(r.featuredSlot) === "children" || normalize(r.audience) === "children"));
  add(pickFirst(resources, (r) => normalize(r.featuredSlot) === "family" || (normalize(r.audience) === "families" && normalize(r.formatType) === "stories")));
  add(
    pickFirst(
      resources,
      (r) => normalize(r.featuredSlot) === "quickest" || normalize(r.formatType) === "short vorts" || r.pageCount === 1,
      (a, b) => (a.pageCount ?? 999) - (b.pageCount ?? 999) || a.sortOrder - b.sortOrder,
    ),
  );
  add(pickFirst(resources, (r) => normalize(r.featuredSlot) === "deeper" || normalize(r.primaryCategory) === "in_depth" || (normalize(r.audience) === "adults" && (r.pageCount ?? 0) >= 5)));

  if (selected.length === 0) return resources.slice(0, 4);
  return selected.slice(0, 4);
}

function personalizeResources(resources: WeeklyResource[], pref: PreferenceRow) {
  const maxPages = typeof pref.max_pages === "number" ? pref.max_pages : null;
  const eligible = maxPages === null
    ? resources
    : resources.filter((r) => r.pageCount === null || r.pageCount <= maxPages);
  const pool = eligible.length > 0 ? eligible : resources;

  const categoryPrefs = [
    pref.wants_children,
    pref.wants_family_story,
    pref.wants_quick_vort,
    pref.wants_questions,
    pref.wants_halacha,
    pref.wants_deeper,
  ].some(Boolean);

  if (!categoryPrefs) {
    return {
      resources: eligible.length > 0 ? eligible : defaultCuratedPicks(resources),
      fallback: eligible.length === 0 && maxPages !== null,
    };
  }

  const selected: WeeklyResource[] = [];
  const add = (r: WeeklyResource | null) => {
    if (r && !selected.some((x) => x.id === r.id)) selected.push(r);
  };

  if (pref.wants_children) {
    add(pickFirst(pool, (r) => normalize(r.featuredSlot) === "children" || normalize(r.audience) === "children"));
  }
  if (pref.wants_family_story) {
    add(pickFirst(pool, (r) => normalize(r.featuredSlot) === "family" || (normalize(r.audience) === "families" && normalize(r.formatType) === "stories")));
  }
  if (pref.wants_quick_vort) {
    add(
      pickFirst(
        pool,
        (r) => normalize(r.featuredSlot) === "quickest" || normalize(r.formatType) === "short vorts" || r.pageCount === 1,
        (a, b) => (a.pageCount ?? 999) - (b.pageCount ?? 999) || a.sortOrder - b.sortOrder,
      ),
    );
  }
  if (pref.wants_questions) {
    add(pickFirst(pool, (r) => /questions?|q\s*&\s*a|q&a/.test(searchableText(r))));
  }
  if (pref.wants_halacha) {
    add(pickFirst(pool, (r) => /halach(a|ah|ic|os)|halacha/.test(searchableText(r))));
  }
  if (pref.wants_deeper) {
    add(pickFirst(pool, (r) => normalize(r.featuredSlot) === "deeper" || normalize(r.primaryCategory) === "in_depth" || (normalize(r.audience) === "adults" && (r.pageCount ?? 0) >= 5)));
  }

  if (selected.length > 0) return { resources: selected, fallback: false };
  return { resources: defaultCuratedPicks(pool), fallback: true };
}

function resourceMeta(r: WeeklyResource) {
  return [
    r.audience,
    r.formatType,
    r.pageCount !== null ? `${r.pageCount} ${r.pageCount === 1 ? "page" : "pages"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function emailHtml(params: {
  parshaLabel: string;
  intro: string;
  resources: WeeklyResource[];
  manageUrl: string;
  unsubscribeUrl: string;
}) {
  const items = params.resources
    .map((r) => {
      const view = `${SITE_URL}/view/${r.id}`;
      const download = `${SITE_URL}/view/${r.id}/download`;
      const meta = resourceMeta(r);
      return `<li style="margin:0 0 20px 0;">
        <div style="font-weight:700;color:#17365d;font-size:16px;">${escapeHtml(r.title)}</div>
        ${meta ? `<div style="color:#6b6358;font-size:12px;margin-top:2px;">${escapeHtml(meta)}</div>` : ""}
        ${r.description ? `<div style="color:#3a2f22;font-size:13px;margin-top:5px;line-height:1.45;">${escapeHtml(r.description)}</div>` : ""}
        <div style="margin-top:7px;font-size:14px;">
          <a href="${view}" style="color:#5a3a1f;text-decoration:underline;margin-right:14px;">View</a>
          <a href="${download}" style="color:#5a3a1f;text-decoration:underline;">Download</a>
        </div>
      </li>`;
    })
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:Georgia,'Times New Roman',serif;color:#2c2418;line-height:1.55;">
    <h1 style="font-size:22px;margin:0 0 6px 0;color:#17365d;">${escapeHtml(params.parshaLabel)}</h1>
    <p style="margin:0 0 20px 0;font-size:15px;color:#3a2f22;">${escapeHtml(params.intro)}</p>
    <ul style="list-style:none;padding:0;margin:0 0 28px 0;">${items}</ul>
    <p style="font-size:13px;color:#6b6358;margin:0 0 18px 0;">
      <a href="${params.manageUrl}" style="color:#5a3a1f;text-decoration:underline;">Manage My Table preferences</a>
    </p>
    <hr style="border:none;border-top:1px solid #e5dfd2;margin:24px 0;" />
    <p style="font-size:13px;color:#6b6358;margin:0;">
      <a href="${SITE_URL}/" style="color:#5a3a1f;text-decoration:underline;margin-right:12px;">Homepage</a>
      <a href="${SITE_URL}/archive" style="color:#5a3a1f;text-decoration:underline;margin-right:12px;">Archive</a>
      <a href="${params.unsubscribeUrl}" style="color:#6b6358;text-decoration:underline;">Unsubscribe</a>
    </p>
  </div></body></html>`;
}

function emailText(params: {
  parshaLabel: string;
  intro: string;
  resources: WeeklyResource[];
  manageUrl: string;
  unsubscribeUrl: string;
}) {
  const lines = [params.parshaLabel, "", params.intro, ""];
  for (const r of params.resources) {
    lines.push(r.title);
    const meta = resourceMeta(r);
    if (meta) lines.push(meta);
    if (r.description) lines.push(r.description);
    lines.push(`View: ${SITE_URL}/view/${r.id}`);
    lines.push(`Download: ${SITE_URL}/view/${r.id}/download`);
    lines.push("");
  }
  lines.push(`Manage My Table: ${params.manageUrl}`);
  lines.push("---");
  lines.push(`Homepage: ${SITE_URL}/`);
  lines.push(`Archive: ${SITE_URL}/archive`);
  lines.push(`Unsubscribe: ${params.unsubscribeUrl}`);
  return lines.join("\n");
}

export const adminSendPersonalizedWeeklyEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string().min(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const userId = await requireAdmin(data.accessToken);
    const admin = getSupabaseAdmin();
    const { parshaKey, parshaLabel, jewishYear } = await resolveCurrentWeek();
    if (!parshaKey || !parshaLabel || !jewishYear) {
      return { ok: false as const, error: "Could not determine the current week." };
    }

    // Display label may be a special-week override; the collection loaded and
    // claimed must be the one the site actually displays.
    const collection = await resolveDisplayedCollectionKey(parshaKey, jewishYear);
    if (!collection.parshaKey) {
      return { ok: false as const, error: "Could not determine the current collection." };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const rawFromAddress = process.env.EMAIL_FROM_ADDRESS;
    const fromAddress = rawFromAddress?.trim().toLowerCase();
    if (!apiKey || !fromAddress) {
      return { ok: false as const, error: "Email is not configured." };
    }

    const resources = await loadResources(collection.parshaKey, collection.jewishYear);
    if (resources.length === 0) {
      return { ok: false as const, error: "No published PDFs for this week yet." };
    }

    const subject = `This Week's Divrei Torah for Shabbos — ${parshaLabel}`;

    const { data: claim, error: claimErr } = await admin
      .from("weekly_email_sends")
      .insert({
        parsha_key: collection.parshaKey,
        jewish_year: collection.jewishYear,
        subject,
        sent_count: 0,
        created_by: userId,
        provider: "resend",
        notes: "Personalized My Table send",
      })
      .select("id")
      .single();

    if (claimErr) {
      if (/duplicate key|unique constraint/i.test(claimErr.message)) {
        return { ok: false as const, error: "This week's email has already been sent." };
      }
      return { ok: false as const, error: `Could not start send: ${claimErr.message}` };
    }
    const claimId = claim.id as string;

    const { data: subRows, error: subErr } = await admin
      .from("subscribers")
      .select("id, email, unsubscribe_token")
      .eq("active", true);
    if (subErr) {
      await admin.from("weekly_email_sends").delete().eq("id", claimId);
      return { ok: false as const, error: `Could not load subscribers: ${subErr.message}` };
    }

    const recipients = (subRows ?? []).filter(
      (r: any) => typeof r.id === "string" && typeof r.email === "string" && typeof r.unsubscribe_token === "string",
    ) as Recipient[];
    if (recipients.length === 0) {
      await admin.from("weekly_email_sends").delete().eq("id", claimId);
      return { ok: false as const, error: "No active subscribers." };
    }

    const { data: prefRows } = await admin
      .from("subscriber_preferences")
      .select("subscriber_id, wants_children, wants_family_story, wants_quick_vort, wants_questions, wants_halacha, wants_deeper, max_pages")
      .in("subscriber_id", recipients.map((r) => r.id));
    const prefMap = new Map<string, PreferenceRow>(
      ((prefRows ?? []) as PreferenceRow[]).map((p) => [p.subscriber_id, p]),
    );

    let personalizedCount = 0;
    let fallbackCount = 0;
    let standardCount = 0;
    let sentCount = 0;
    let firstMessageId: string | null = null;
    const failures: string[] = [];

    const payloadFor = (r: Recipient) => {
      const pref = prefMap.get(r.id);
      let selected = resources;
      let intro = "This week's Divrei Torah are now available to view or download.";

      if (pref) {
        personalizedCount += 1;
        const result = personalizeResources(resources, pref);
        selected = result.resources;
        if (result.fallback) {
          fallbackCount += 1;
          intro = "We did not find an exact match for every saved preference this week, so we included the closest curated selections.";
        } else {
          intro = "Here are this week's selections chosen from your saved My Table preferences.";
        }
      } else {
        standardCount += 1;
      }

      const unsubscribeUrl = `${SITE_URL}/unsubscribe/${r.unsubscribe_token}`;
      const manageUrl = `${SITE_URL}/manage-table/${r.unsubscribe_token}`;
      return {
        from: `Torah For The Table <${fromAddress}>`,
        to: r.email,
        subject,
        html: emailHtml({ parshaLabel, intro, resources: selected, manageUrl, unsubscribeUrl }),
        text: emailText({ parshaLabel, intro, resources: selected, manageUrl, unsubscribeUrl }),
        headers: {
          "List-Unsubscribe": `<${SITE_URL}/api/unsubscribe/${r.unsubscribe_token}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    };

    const BATCH_SIZE = 100;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const chunk = recipients.slice(i, i + BATCH_SIZE);
      const payloads = chunk.map(payloadFor);
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payloads),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          for (const r of chunk) failures.push(`${r.email}: ${res.status} ${errText.slice(0, 100)}`);
          continue;
        }
        const json = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
        const results = json?.data ?? [];
        for (let j = 0; j < chunk.length; j++) {
          const id = results[j]?.id;
          if (id) {
            sentCount += 1;
            if (!firstMessageId) firstMessageId = id;
          } else {
            failures.push(`${chunk[j].email}: batch item failed`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "batch send failed";
        for (const r of chunk) failures.push(`${r.email}: ${msg}`);
      }
    }

    if (sentCount === 0) {
      await admin.from("weekly_email_sends").delete().eq("id", claimId);
      return { ok: false as const, error: "No emails were sent. The send was released so you can retry." };
    }

    const notes = [
      `Personalized: ${personalizedCount}`,
      `standard: ${standardCount}`,
      fallbackCount ? `preference fallbacks: ${fallbackCount}` : null,
      failures.length ? `failed: ${failures.length}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    await admin
      .from("weekly_email_sends")
      .update({ sent_count: sentCount, provider_message_id: firstMessageId, notes })
      .eq("id", claimId);

    return {
      ok: true as const,
      sentCount,
      failedCount: failures.length,
      personalizedCount,
      standardCount,
      fallbackCount,
    };
  });

// Server-only helper for reading the GA4 Data API.
// Signs a service-account JWT (Worker-safe via `jose`), exchanges it for an
// access token, then calls analyticsdata.googleapis.com runReport.

import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

type ServiceAccount = { client_email: string; private_key: string };

let cachedToken: { token: string; expiresAt: number } | null = null;

function readConfig(): { sa: ServiceAccount; propertyId: string } | null {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!raw || !propertyId) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { sa: parsed, propertyId: propertyId.replace(/^properties\//, "") };
  } catch {
    return null;
  }
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

type ReportRow = { dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> };

async function runReport(
  propertyId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<ReportRow[]> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`GA4 report failed [${res.status}]: ${await res.text()}`);
  }
  const json = (await res.json()) as { rows?: ReportRow[] };
  return json.rows ?? [];
}

export type Ga4Totals = {
  users: number;
  sessions: number;
  views: number;
  pdfDownloads: number;
  newsletterSignups: number;
  popupShown: number;
};

export type Ga4Summary = {
  configured: true;
  totals: Ga4Totals;
  previousTotals: Ga4Totals;
  daily: Array<{ date: string; sessions: number; users: number; views: number }>;
  topEvents: Array<{ name: string; count: number }>;
};

export type Ga4Result = Ga4Summary | { configured: false; error: string };

const emptyTotals = (): Ga4Totals => ({
  users: 0,
  sessions: 0,
  views: 0,
  pdfDownloads: 0,
  newsletterSignups: 0,
  popupShown: 0,
});

const num = (v?: string) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function fetchWindow(
  propertyId: string,
  token: string,
  startDate: string,
  endDate: string,
): Promise<{ totals: Ga4Totals; events: Array<{ name: string; count: number }> }> {
  const dateRanges = [{ startDate, endDate }];

  const [totalsRows, eventRows] = await Promise.all([
    runReport(propertyId, token, {
      dateRanges,
      metrics: [
        { name: "totalUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
      ],
    }),
    runReport(propertyId, token, {
      dateRanges,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 50,
    }),
  ]);

  const totals = emptyTotals();
  const t = totalsRows[0]?.metricValues ?? [];
  totals.users = num(t[0]?.value);
  totals.sessions = num(t[1]?.value);
  totals.views = num(t[2]?.value);

  const events = eventRows.map((r) => ({
    name: r.dimensionValues?.[0]?.value ?? "(unknown)",
    count: num(r.metricValues?.[0]?.value),
  }));
  const byName = new Map(events.map((e) => [e.name, e.count]));
  totals.pdfDownloads = byName.get("pdf_download") ?? 0;
  totals.newsletterSignups = byName.get("newsletter_signup") ?? 0;
  totals.popupShown = byName.get("email_popup_shown") ?? 0;

  return { totals, events };
}

export async function getGa4Summary(startDate: string, endDate: string): Promise<Ga4Result> {
  const cfg = readConfig();
  if (!cfg) {
    return {
      configured: false,
      error: "GA4 is not connected. Add GA4_SERVICE_ACCOUNT_JSON and GA4_PROPERTY_ID.",
    };
  }
  try {
    const token = await getAccessToken(cfg.sa);

    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const spanDays =
      Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const prevEnd = new Date(start.getTime() - 86_400_000);
    const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * 86_400_000);

    const [current, previous, dailyRows] = await Promise.all([
      fetchWindow(cfg.propertyId, token, startDate, endDate),
      fetchWindow(cfg.propertyId, token, isoDay(prevStart), isoDay(prevEnd)),
      runReport(cfg.propertyId, token, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 400,
      }),
    ]);

    const daily = dailyRows.map((r) => {
      const raw = r.dimensionValues?.[0]?.value ?? "";
      const date =
        raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
      return {
        date,
        sessions: num(r.metricValues?.[0]?.value),
        users: num(r.metricValues?.[1]?.value),
        views: num(r.metricValues?.[2]?.value),
      };
    });

    return {
      configured: true,
      totals: current.totals,
      previousTotals: previous.totals,
      daily,
      topEvents: current.events.slice(0, 12),
    };
  } catch (e) {
    console.error("getGa4Summary failed", e);
    return {
      configured: false,
      error: e instanceof Error ? e.message : "GA4 request failed",
    };
  }
}

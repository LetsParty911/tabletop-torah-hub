/** Detect Supabase's billing restriction without retrying a request that cannot succeed. */
export function isSupabaseQuotaRestricted(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object") {
    const detail = error as Record<string, unknown>;
    if (Number(detail.status ?? detail.statusCode) === 402) return true;
    const message = [detail.code, detail.message, detail.details, detail.hint]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    return /exceed_egress_quota|service for this project is restricted|payment required|\b402\b/i.test(message);
  }
  return /exceed_egress_quota|service for this project is restricted|payment required|\b402\b/i.test(String(error));
}

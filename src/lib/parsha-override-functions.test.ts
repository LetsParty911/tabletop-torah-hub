import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  authorized: true,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (x: unknown) => x;
    const chain = {
      inputValidator: (fn: typeof validate) => { validate = fn; return chain; },
      handler: (fn: (args: {data: unknown}) => unknown) => (args?: {data: unknown}) => fn({ data: validate(args?.data) }),
    };
    return chain;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("https://example.test") }));
vi.mock("@/integrations/supabase/ext.server", () => ({
  getSupabaseAdmin: () => ({ from: () => {
    const query = {
      select: () => query,
      update: (patch: Record<string, unknown>) => { state.writes.push(patch); Object.assign(state.settings, patch); return query; },
      eq: () => query,
      maybeSingle: async () => ({data: {...state.settings}, error: null}),
      then: (resolve: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return query;
  }}),
  getSupabaseForUser: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({createClient: () => ({auth: {getUser: async () => ({data: {user: state.authorized ? {id:"test-owner",email:"owner@example.test"} : null},error: null})}})}));
vi.mock("@/lib/hebcal", () => ({
  fetchHebcalShabbatData: async () => ({}),
  resolveReadingFromHebcal: () => ({parshaKey:"Lech-Lecha", readingDate:"2026-10-24"}),
}));
vi.mock("@/lib/pdf-edge-cache", () => ({purgePdfEdgeCache: vi.fn(),warmPdfEdgeCache: vi.fn()}));
vi.mock("@/lib/rate-limit.server", () => ({ checkRateLimit: vi.fn() }));
import { adminSetAnnouncementBanner, adminSetThursdayProgress, adminSetParshaOverride, getParshaOverride } from "@/integrations/supabase/api.functions";
import { adminSetProgressVisibility } from "@/integrations/supabase/progress-visibility.functions";

const accessToken = "mock-token-not-a-real-credential";
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.test");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "mock-publishable");
  vi.stubEnv("ADMIN_EMAILS", "owner@example.test");
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-22T22:00:00-04:00"));
  state.settings = {parsha_override:"Noach",updated_at:"2026-10-15T20:00:00-04:00"};
  state.writes=[]; state.authorized=true;
});
afterEach(() => {vi.useRealTimers();vi.unstubAllEnvs();});
describe("actual admin handlers with isolated in-memory settings", () => {
  it("unrelated announcement save cannot reactivate stale Noach", async () => {
    await adminSetAnnouncementBanner({data:{accessToken,enabled:true,text:"notice",linkUrl:null,linkLabel:null}});
    expect(state.writes[0]).not.toHaveProperty("updated_at");
    expect(await getParshaOverride()).toEqual({override:"Noach",isActive:false});
  });
  it("unrelated progress save cannot reactivate stale Noach", async () => {
    await adminSetThursdayProgress({data:{accessToken,fillStep:100,eta:null}});
    expect(state.writes[0]).not.toHaveProperty("updated_at");
    expect(await getParshaOverride()).toEqual({override:"Noach",isActive:false});
  });
  it("progress visibility save cannot reactivate stale Noach", async () => {
    await adminSetProgressVisibility({data:{accessToken,visible:true}});
    expect(state.writes[0]).not.toHaveProperty("updated_at");
    expect(await getParshaOverride()).toEqual({override:"Noach",isActive:false});
  });
  it("server rejects accidental off-calendar override before any write", async () => {
    await expect(adminSetParshaOverride({data:{accessToken,override:"Noach"}})).rejects.toThrow(/Explicitly confirm/);
    expect(state.writes).toHaveLength(0);
  });
  it("explicit week-bound override renews timestamp and remains supported", async () => {
    await adminSetParshaOverride({data:{accessToken,override:"Noach",confirmedReadingDate:"2026-10-24"}});
    expect(state.writes).toEqual([{parsha_override:"Noach",updated_at:"2026-10-23T02:00:00.000Z"}]);
    expect(await getParshaOverride()).toEqual({override:"Noach",isActive:true});
  });
  it("clearing saves only the explicit override fields", async () => {
    await adminSetParshaOverride({data:{accessToken,override:null}});
    expect(state.writes[0]).toEqual({parsha_override:null,updated_at:"2026-10-23T02:00:00.000Z"});
  });
  it("preserves admin authentication before override changes", async () => {
    state.authorized=false;
    await expect(adminSetParshaOverride({data:{accessToken,override:null}})).rejects.toThrow("Not authenticated");
    expect(state.writes).toHaveLength(0);
  });
});

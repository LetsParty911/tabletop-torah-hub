import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ vpn: vi.fn(), geo: vi.fn(), maintenance: vi.fn(), endpoint: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
  createStart: (config: () => unknown) => config(),
}));
vi.mock("@/integrations/supabase/auth-attacher", () => ({ attachSupabaseAuth: {} }));
vi.mock("@/lib/vpn-block.server", () => ({ checkVpnBlock: mocks.vpn }));
vi.mock("@/lib/geo-block.server", () => ({ checkGeoBlock: mocks.geo }));
vi.mock("@/lib/maintenance-traffic.server", () => ({ recordMaintenanceVisitFromMiddleware: mocks.maintenance }));
import { startInstance } from "../start";

type Result = { response: Response };
type Handler = (input: { request: Request; next: () => Promise<Result> }) => Promise<Result>;
async function run(request: Request) {
  const handlers = (startInstance as unknown as { requestMiddleware: Handler[] }).requestMiddleware;
  const dispatch = async (index: number): Promise<Result> => {
    const handler = handlers[index];
    return handler ? handler({ request, next: () => dispatch(index + 1) }) : mocks.endpoint();
  };
  return (await dispatch(0)).response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.vpn.mockResolvedValue(null);
  mocks.geo.mockResolvedValue(null);
  mocks.maintenance.mockResolvedValue(undefined);
  mocks.endpoint.mockResolvedValue({ response: new Response("allowed") });
});

describe("real Start registration and short circuit", () => {
  const paths = ["/", "/admin", "/admin-analytics", "/api/trusted-vpn-browser", "/api/public/analytics", "/_serverFn/action", "/view/id/pdf", "/view/id/download", "/view/id/print", "/missing", "/r", "/s", "/j", "/assets/app.js", "/robots.txt"];
  it.each(paths.flatMap((path) => ["GET", "HEAD", "POST"].map((method) => [path, method])))("blocks %s %s before any other middleware", async (path, method) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const response = await run(new Request(`https://torahforthetable.org${path}`, {
        method, headers: { "cf-ipcountry": "CN", cookie: "tftt_internal=valid; tftt_trusted_vpn=valid", authorization: "Bearer admin" },
      }));
      expect(response.status).toBe(403); // before even the .org redirect
      expect(response.headers.get("location")).toBeNull();
      expect(mocks.vpn).not.toHaveBeenCalled();
      expect(mocks.geo).not.toHaveBeenCalled();
      expect(mocks.maintenance).not.toHaveBeenCalled();
      expect(mocks.endpoint).not.toHaveBeenCalled(); // no auth/DB/analytics endpoint
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it("preserves downstream gates and processing for an allowed country", async () => {
    expect((await run(new Request("https://torahforthetable.com/", { headers: { "cf-ipcountry": "US" } }))).status).toBe(200);
    expect(mocks.vpn).toHaveBeenCalledOnce();
    expect(mocks.geo).toHaveBeenCalledOnce();
    expect(mocks.endpoint).toHaveBeenCalledOnce();
    expect(mocks.maintenance).toHaveBeenCalledOnce();
    mocks.geo.mockResolvedValue(new Response("city denied", { status: 403 }));
    expect((await run(new Request("https://torahforthetable.com/", { headers: { "cf-ipcountry": "US" } }))).status).toBe(403);
  });
});
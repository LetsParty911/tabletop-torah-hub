import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMaintenanceCacheForTests,
  maintenanceGate,
  readMaintenanceEnabled,
  rememberMaintenanceValue,
} from "./maintenance.server";

beforeEach(() => __resetMaintenanceCacheForTests());

describe("persistent maintenance mode", () => {
  it("ON: public pages and direct PDF view/download get the 503 maintenance response", async () => {
    for (const path of ["/", "/archive", "/view/abc/pdf", "/view/abc/download"]) {
      __resetMaintenanceCacheForTests();
      const res = await maintenanceGate(path, async () => true);
      expect(res?.status).toBe(503);
      expect(res?.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("OFF: public pages and PDFs pass through", async () => {
    expect(await maintenanceGate("/", async () => false)).toBeNull();
    expect(await maintenanceGate("/view/abc/download", async () => false)).toBeNull();
  });

  it("admin paths bypass maintenance without reading the setting", async () => {
    const reader = vi.fn(async () => true);
    for (const path of ["/admin", "/admin/x", "/admin-analytics"]) {
      expect(await maintenanceGate(path, reader)).toBeNull();
    }
    expect(reader).not.toHaveBeenCalled();
  });

  it("missing row fails closed (ON)", async () => {
    expect(await readMaintenanceEnabled(async () => null)).toBe(true);
  });

  it("read error with no prior value fails closed (ON)", async () => {
    expect(await readMaintenanceEnabled(async () => { throw new Error("down"); })).toBe(true);
  });

  it("read error after a successful read keeps the last known value", async () => {
    expect(await readMaintenanceEnabled(async () => false, 0)).toBe(false);
    expect(await readMaintenanceEnabled(async () => { throw new Error("down"); }, 60_000)).toBe(false);
  });

  it("caches briefly, and an admin change applies immediately", async () => {
    const reader = vi.fn(async () => true);
    await readMaintenanceEnabled(reader, 0);
    await readMaintenanceEnabled(reader, 5_000);
    expect(reader).toHaveBeenCalledTimes(1);
    rememberMaintenanceValue(false, 6_000);
    expect(await readMaintenanceEnabled(reader, 7_000)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { editableParshaOverride, isOverrideCurrent, validateParshaOverride } from "./parsha-override";

const date = "2026-10-24";
describe("stale override and conscious current-week saves", () => {
  it("loads a stale Noach override as automatic rather than editable Noach", () => {
    expect(editableParshaOverride({override: "Noach", isActive: false})).toBe("");
    expect(isOverrideCurrent("2026-10-15T20:00:00-04:00", date)).toBe(false);
  });
  it("rejects accidental re-save of Noach while Hebcal says Lech Lecha", () => {
    expect(() => validateParshaOverride("Noach", "Lech-Lecha", date)).toThrow();
  });
  it("allows automatic clear even when Hebcal is unavailable", () => {
    expect(validateParshaOverride(null, null, null)).toBeNull();
    expect(validateParshaOverride("  ", null, null)).toBeNull();
  });
  it("allows current canonical reading without off-calendar confirmation", () => {
    expect(validateParshaOverride("Parshas Lech Lecha", "Lech-Lecha", date)).toBe("Parshas Lech Lecha");
  });
  it("preserves intentional manual override with exact current-week acknowledgement", () => {
    expect(validateParshaOverride("Noach", "Lech-Lecha", date, date)).toBe("Noach");
    expect(() => validateParshaOverride("Noach", "Lech-Lecha", date, "2026-10-17")).toThrow();
  });
  it("preserves Yom Tov and combined custom overrides", () => {
    expect(validateParshaOverride("Sukkos", "Sukkos", "2026-09-26")).toBe("Sukkos");
    expect(validateParshaOverride("Shabbos Shuva Parshas Haazinu and Yom Kippur", "Haazinu", "2026-09-19")).toContain("Yom Kippur");
    expect(validateParshaOverride("Special Yom Tov reading", "Sukkos", "2026-09-26", "2026-09-26")).toBe("Special Yom Tov reading");
  });
  it("never accepts off-calendar saves when current reading cannot be verified", () => {
    expect(() => validateParshaOverride("Noach", null, null, date)).toThrow();
  });
  it("expires explicit overrides at subsequent weekly rollover", () => {
    expect(isOverrideCurrent("2026-10-22T21:46:00-04:00", date)).toBe(true);
    expect(isOverrideCurrent("2026-10-22T21:46:00-04:00", "2026-10-31")).toBe(false);
    expect(editableParshaOverride({override: "Lech-Lecha", isActive: true})).toBe("Lech-Lecha");
  });
});

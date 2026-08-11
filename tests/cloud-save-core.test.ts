import { describe, expect, it } from "vitest";
import { ApiError, isSaveRegression, isoWeekKeyUtc, normalizeUsername, parseSavePayload, sanitizeCosmeticIds, sanitizePortrait, summarizeState, utcDayKey } from "../src/cloud-save-core";

describe("cloud save validation", () => {
  it("derives a stable leaderboard summary from game state", () => {
    expect(summarizeState({ playerClass: "warrior", level: 12, prestige: 2, stats: { kills: 345, uniques: 4 } })).toEqual({
      playerClass: "warrior",
      level: 12,
      prestige: 2,
      totalKills: 345,
      uniqueCount: 4,
      powerScore: 2_012_000_345,
      portrait: {},
    });
  });

  it("never trusts a client-provided score", () => {
    const payload = parseSavePayload({ expectedRevision: 0, saveVersion: "v60-alpha", score: 999_999_999, state: { level: 3, prestige: 0, stats: { kills: 8 } } });
    expect(payload.summary.powerScore).toBe(3_000_008);
  });

  it("rejects missing state and invalid revisions", () => {
    expect(() => parseSavePayload({ expectedRevision: 0 })).toThrow(ApiError);
    expect(() => parseSavePayload({ expectedRevision: -1, saveVersion: "v60-alpha", state: {} })).toThrowError(/sürümü/i);
  });

  it("normalizes Turkish usernames and blocks reserved automatic names", () => {
    expect(normalizeUsername("  Kızıl   Şövalye ")).toEqual({ username: "Kızıl Şövalye", key: "kızıl şövalye" });
    expect(() => normalizeUsername("Maceracı12345678")).toThrowError(/kullanılamaz/i);
    expect(() => normalizeUsername("ab")).toThrowError(/3-16/i);
  });

  it("normalizes username casing to one unique key", () => {
    expect(normalizeUsername("Lenny").key).toBe(normalizeUsername("LENNY").key);
  });

  it("blocks accidental progress rollback but allows prestige level resets", () => {
    const current = { playerClass: "mage" as const, level: 20, prestige: 2, totalKills: 400, uniqueCount: 3 };
    expect(isSaveRegression(current, { ...current, level: 19 })).toBe(true);
    expect(isSaveRegression(current, { ...current, totalKills: 399 })).toBe(true);
    expect(isSaveRegression(current, { ...current, playerClass: "warrior" })).toBe(true);
    expect(isSaveRegression({ playerClass: "mage", level: 1, prestige: 0, totalKills: 0, uniqueCount: 0 }, { playerClass: "warrior", level: 1, prestige: 0, totalKills: 0, uniqueCount: 0 })).toBe(false);
    expect(isSaveRegression(current, { playerClass: "warrior", level: 1, prestige: 3, totalKills: 400, uniqueCount: 3 })).toBe(false);
  });

  it("keeps only bounded character portrait fields", () => {
    expect(sanitizePortrait({ gender: "female", hairId: "female.hair.1", extra: "hidden" })).toEqual({ gender: "female", hairId: "female.hair.1" });
  });

  it("deduplicates bounded cosmetic entitlements from saves", () => {
    expect(sanitizeCosmeticIds(["female.hat.witch-hat", "female.hat.witch-hat", "bad/id", 42])).toEqual(["female.hat.witch-hat"]);
    expect(parseSavePayload({ expectedRevision: 0, saveVersion: "v61-alpha", state: { ownedCosmetics: ["unisex.back.cape-blue"] } }).cosmeticIds).toEqual(["unisex.back.cape-blue"]);
  });

  it("uses stable UTC ISO weeks across year boundaries", () => {
    expect(isoWeekKeyUtc(new Date("2026-12-31T23:59:59Z"))).toBe("2026-W53");
    expect(isoWeekKeyUtc(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKeyUtc(new Date("2027-01-04T00:00:00Z"))).toBe("2027-W01");
    expect(utcDayKey(new Date("2027-01-04T23:59:59Z"))).toBe("2027-01-04");
  });
});

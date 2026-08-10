export const MAX_SAVE_BYTES = 200_000;

export type SaveSummary = {
  playerClass: "mage" | "warrior" | "ranger";
  level: number;
  prestige: number;
  totalKills: number;
  uniqueCount: number;
  powerScore: number;
  portrait: Record<string, string | null>;
};

export type SavePayload = {
  expectedRevision: number;
  saveVersion: string;
  state: Record<string, unknown>;
  serializedState: string;
  summary: SaveSummary;
};

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function summarizeState(state: Record<string, unknown>): SaveSummary {
  const stats = isRecord(state.stats) ? state.stats : {};
  const playerClass = ["mage", "warrior", "ranger"].includes(String(state.playerClass))
    ? (state.playerClass as SaveSummary["playerClass"])
    : "mage";
  const level = boundedInteger(state.level, 1, 1, 10_000);
  const prestige = boundedInteger(state.prestige, 0, 0, 1_000);
  const totalKills = boundedInteger(stats.kills, 0, 0, 1_000_000_000);
  const uniqueCount = boundedInteger(stats.uniques, 0, 0, 10_000);
  const powerScore = prestige * 1_000_000_000 + level * 1_000_000 + Math.min(totalKills, 999_999);
  const portrait = sanitizePortrait(state.character);
  return { playerClass, level, prestige, totalKills, uniqueCount, powerScore, portrait };
}

const PORTRAIT_KEYS = [
  "gender", "skinId", "specialSkinId", "hairId", "basewearId", "topId", "bottomId",
  "socksId", "shoesId", "outfitId", "earsId", "hatId", "maskId", "backId",
] as const;

export function sanitizePortrait(value: unknown): Record<string, string | null> {
  if (!isRecord(value)) return {};
  const portrait: Record<string, string | null> = {};
  for (const key of PORTRAIT_KEYS) {
    const item = value[key];
    if (item === null) portrait[key] = null;
    else if (typeof item === "string" && item.length <= 160) portrait[key] = item;
  }
  if (portrait.gender !== "female" && portrait.gender !== "male") delete portrait.gender;
  return portrait;
}

const RESERVED_USERNAME_KEYS = new Set(["admin", "administrator", "moderator", "mod", "sylex", "kadimvadi", "downtown"]);

export function normalizeUsername(value: unknown): { username: string; key: string } {
  if (typeof value !== "string") throw new ApiError(400, "INVALID_USERNAME", "Kullanıcı adı metin olmalı.");
  const username = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const length = Array.from(username).length;
  if (length < 3 || length > 16) throw new ApiError(400, "INVALID_USERNAME", "Kullanıcı adı 3-16 karakter olmalı.");
  if (!/^[\p{L}\p{N}_]+(?: [\p{L}\p{N}_]+)*$/u.test(username)) {
    throw new ApiError(400, "INVALID_USERNAME", "Yalnızca harf, rakam, boşluk ve alt çizgi kullanabilirsin.");
  }
  const key = username.toLocaleLowerCase("tr-TR");
  if (key.startsWith("maceracı") || RESERVED_USERNAME_KEYS.has(key.replace(/[ _]/g, ""))) {
    throw new ApiError(400, "RESERVED_USERNAME", "Bu kullanıcı adı kullanılamaz.");
  }
  return { username, key };
}

export function parseSavePayload(value: unknown): SavePayload {
  if (!isRecord(value) || !isRecord(value.state)) {
    throw new ApiError(400, "INVALID_SAVE", "Geçerli bir oyun kaydı gönderilmedi.");
  }
  const expectedRevision = boundedInteger(value.expectedRevision, -1, -1, 2_147_483_647);
  if (expectedRevision < 0) throw new ApiError(400, "INVALID_REVISION", "Kayıt sürümü geçersiz.");
  const saveVersion = typeof value.saveVersion === "string" ? value.saveVersion.trim() : "";
  if (!saveVersion || saveVersion.length > 32) throw new ApiError(400, "INVALID_VERSION", "Oyun sürümü geçersiz.");
  const serializedState = JSON.stringify(value.state);
  if (utf8Bytes(serializedState) > MAX_SAVE_BYTES) throw new ApiError(413, "SAVE_TOO_LARGE", "Oyun kaydı izin verilen boyutu aşıyor.");
  return {
    expectedRevision,
    saveVersion,
    state: value.state,
    serializedState,
    summary: summarizeState(value.state),
  };
}

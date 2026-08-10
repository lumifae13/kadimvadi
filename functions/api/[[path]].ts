import { ApiError, normalizeUsername, parseSavePayload } from "../../src/cloud-save-core";

type Bindings = Env & { DOWNTOWN_SERVICE_KEY?: string };
type ApiContext = Parameters<PagesFunction<Bindings>>[0];

type SessionRow = {
  character_id: number;
  public_id: string;
  username: string;
  is_generated: number;
  name_changes: number;
  last_name_change_at: number | null;
  expires_at: number;
};
type SaveRow = { revision: number; save_version: string; state_json: string; updated_at: number };
type LeaderboardRow = {
  public_id: string;
  username: string;
  player_class: string;
  level: number;
  prestige: number;
  total_kills: number;
  unique_count: number;
  power_score: number;
  portrait_json: string;
};
type RenameIntentRow = { intent_id: string; username: string; username_key: string; price: number; expected_name_changes: number; expires_at: number; used_at: number | null };

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" };
const MAX_REQUEST_BYTES = 220_000;
const USERNAME_CHANGE_PRICE = 750;
const USERNAME_CHANGE_COOLDOWN = 24 * 60 * 60_000;
const RENAME_INTENT_LIFETIME = 10 * 60_000;

function json(data: unknown, status = 200, cacheControl = "no-store"): Response {
  return Response.json(data, { status, headers: { ...JSON_HEADERS, "cache-control": cacheControl } });
}

function routePath(context: ApiContext): string {
  const value = context.params.path;
  return Array.isArray(value) ? value.join("/") : String(value || "");
}

async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_REQUEST_BYTES) throw new ApiError(413, "REQUEST_TOO_LARGE", "İstek çok büyük.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) throw new ApiError(413, "REQUEST_TOO_LARGE", "İstek çok büyük.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "İstek gövdesi geçerli JSON değil.");
  }
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.{20,4096})$/i);
  if (!match) throw new ApiError(401, "AUTH_REQUIRED", "Kimlik doğrulaması gerekli.");
  return match[1];
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generatedUsername(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return `Maceracı${String(values[0] % 100_000_000).padStart(8, "0")}`;
}

function publicProfile(row: Pick<SessionRow, "public_id" | "username" | "is_generated" | "name_changes" | "last_name_change_at">) {
  return {
    id: row.public_id,
    username: row.username,
    generated: row.is_generated === 1,
    canChooseFreeName: row.is_generated === 1 && row.name_changes === 0,
    nameChanges: row.name_changes,
    nextRenameAt: row.last_name_change_at ? row.last_name_change_at + USERNAME_CHANGE_COOLDOWN : null,
  };
}

async function verifyDowntownIdentity(request: Request, env: Bindings): Promise<{ characterId: number; expiresAt: number }> {
  if (!env.DOWNTOWN_SERVICE_KEY) throw new ApiError(503, "IDENTITY_NOT_CONFIGURED", "Kimlik servisi henüz yapılandırılmadı.");
  const token = bearerToken(request);
  const response = await fetch(env.DOWNTOWN_VERIFY_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.DOWNTOWN_SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const payload: unknown = await response.json();
  if (!response.ok || payload === null || typeof payload !== "object") throw new ApiError(502, "IDENTITY_UNAVAILABLE", "Kimlik servisine ulaşılamadı.");
  const result = payload as Record<string, unknown>;
  const characterId = Number(result.characterId);
  if (result.valid !== true || !Number.isSafeInteger(characterId) || characterId <= 0) throw new ApiError(401, "INVALID_IDENTITY", "Downtown kimliği doğrulanamadı.");
  const rawExpiry = Number(result.expiresAt);
  const tokenExpiry = Number.isFinite(rawExpiry) ? (rawExpiry < 1_000_000_000_000 ? rawExpiry * 1000 : rawExpiry) : Date.now() + 15 * 60_000;
  const expiresAt = Math.min(tokenExpiry, Date.now() + 15 * 60_000);
  if (expiresAt < Date.now() + 15_000) throw new ApiError(401, "IDENTITY_EXPIRED", "Downtown kimlik token'ı sona ermiş.");
  return { characterId, expiresAt };
}

async function requireSession(request: Request, env: Bindings): Promise<SessionRow> {
  const tokenHash = await sha256(bearerToken(request));
  const session = await env.DB.prepare(`
    SELECT s.character_id, p.public_id, p.username, p.is_generated, p.name_changes, p.last_name_change_at, s.expires_at
    FROM sessions s JOIN players p ON p.character_id = s.character_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, Date.now()).first<SessionRow>();
  if (!session) throw new ApiError(401, "SESSION_EXPIRED", "Bulut kayıt oturumu sona ermiş.");
  return session;
}

async function createSession(context: ApiContext): Promise<Response> {
  if (context.request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const identity = await verifyDowntownIdentity(context.request, context.env);
  const now = Date.now();
  const sessionToken = randomToken();
  const tokenHash = await sha256(sessionToken);
  let player = await context.env.DB.prepare(`
    SELECT public_id, username, is_generated, name_changes, last_name_change_at
    FROM players WHERE character_id = ?
  `).bind(identity.characterId).first<SessionRow>();
  if (!player) {
    for (let attempt = 0; attempt < 12 && !player; attempt++) {
      const username = generatedUsername();
      await context.env.DB.prepare(`
        INSERT OR IGNORE INTO players
          (character_id, public_id, username, username_key, is_generated, name_changes, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, 1, 0, ?, ?)
      `).bind(identity.characterId, crypto.randomUUID(), username, username.toLocaleLowerCase("tr-TR"), now, now).run();
      player = await context.env.DB.prepare(`
        SELECT public_id, username, is_generated, name_changes, last_name_change_at
        FROM players WHERE character_id = ?
      `).bind(identity.characterId).first<SessionRow>();
    }
  } else {
    await context.env.DB.prepare("UPDATE players SET last_seen_at = ? WHERE character_id = ?").bind(now, identity.characterId).run();
  }
  if (!player) throw new ApiError(500, "PLAYER_CREATE_FAILED", "Oyuncu profili oluşturulamadı.");
  await context.env.DB.prepare("INSERT INTO sessions (token_hash, character_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, identity.characterId, identity.expiresAt, now).run();
  context.waitUntil(context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    context.env.DB.prepare("DELETE FROM username_change_intents WHERE expires_at <= ?").bind(now),
  ]));
  return json({ sessionToken, expiresAt: identity.expiresAt, player: publicProfile(player) }, 201);
}

async function getSave(context: ApiContext, session: SessionRow): Promise<Response> {
  const row = await context.env.DB.prepare("SELECT revision, save_version, state_json, updated_at FROM player_saves WHERE character_id = ?")
    .bind(session.character_id).first<SaveRow>();
  if (!row) return json({ save: null, revision: 0 });
  try {
    return json({ save: JSON.parse(row.state_json), revision: row.revision, saveVersion: row.save_version, updatedAt: row.updated_at });
  } catch {
    console.error(JSON.stringify({ message: "corrupt cloud save", characterId: session.character_id }));
    throw new ApiError(500, "CORRUPT_SAVE", "Bulut kaydı okunamadı.");
  }
}

async function putSave(context: ApiContext, session: SessionRow): Promise<Response> {
  const payload = parseSavePayload(await readJson(context.request));
  const now = Date.now();
  const summary = payload.summary;
  let result: D1Result;
  if (payload.expectedRevision === 0) {
    result = await context.env.DB.prepare(`
      INSERT OR IGNORE INTO player_saves
      (character_id, revision, save_version, state_json, player_class, level, prestige, total_kills, unique_count, power_score, portrait_json, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(session.character_id, payload.saveVersion, payload.serializedState, summary.playerClass, summary.level, summary.prestige, summary.totalKills, summary.uniqueCount, summary.powerScore, JSON.stringify(summary.portrait), now, now).run();
  } else {
    result = await context.env.DB.prepare(`
      UPDATE player_saves SET
        revision = revision + 1, save_version = ?, state_json = ?, player_class = ?, level = ?, prestige = ?,
        total_kills = ?, unique_count = ?, power_score = ?, portrait_json = ?, updated_at = ?
      WHERE character_id = ? AND revision = ?
    `).bind(payload.saveVersion, payload.serializedState, summary.playerClass, summary.level, summary.prestige, summary.totalKills, summary.uniqueCount, summary.powerScore, JSON.stringify(summary.portrait), now, session.character_id, payload.expectedRevision).run();
  }
  if (result.meta.changes !== 1) {
    const current = await context.env.DB.prepare("SELECT revision, updated_at FROM player_saves WHERE character_id = ?")
      .bind(session.character_id).first<{ revision: number; updated_at: number }>();
    return json({ error: "SAVE_CONFLICT", revision: current?.revision || 0, updatedAt: current?.updated_at || null }, 409);
  }
  const revision = payload.expectedRevision + 1;
  return json({ saved: true, revision, updatedAt: now, score: summary.powerScore });
}

async function profile(context: ApiContext): Promise<Response> {
  const session = await requireSession(context.request, context.env);
  if (context.request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  return json({ player: publicProfile(session), renamePrice: USERNAME_CHANGE_PRICE });
}

async function createRenameIntent(context: ApiContext): Promise<Response> {
  if (context.request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const session = await requireSession(context.request, context.env);
  const body = await readJson(context.request);
  const requested = body && typeof body === "object" ? (body as Record<string, unknown>).username : undefined;
  const { username, key } = normalizeUsername(requested);
  if (key === session.username.toLocaleLowerCase("tr-TR")) throw new ApiError(400, "USERNAME_UNCHANGED", "Bu zaten mevcut kullanıcı adın.");
  const now = Date.now();
  const free = session.is_generated === 1 && session.name_changes === 0;
  if (!free && session.last_name_change_at && now < session.last_name_change_at + USERNAME_CHANGE_COOLDOWN) {
    throw new ApiError(429, "RENAME_COOLDOWN", "Kullanıcı adını günde bir kez değiştirebilirsin.");
  }
  const occupied = await context.env.DB.prepare(`
    SELECT 1 AS found FROM players WHERE username_key = ?
    UNION ALL
    SELECT 1 AS found FROM username_change_intents WHERE username_key = ? AND expires_at > ? AND character_id != ?
    LIMIT 1
  `).bind(key, key, now, session.character_id).first();
  if (occupied) throw new ApiError(409, "USERNAME_TAKEN", "Bu kullanıcı adı alınmış.");
  const intentId = crypto.randomUUID();
  const expiresAt = now + RENAME_INTENT_LIFETIME;
  try {
    await context.env.DB.batch([
      context.env.DB.prepare("DELETE FROM username_change_intents WHERE character_id = ? OR expires_at <= ?").bind(session.character_id, now),
      context.env.DB.prepare(`
        INSERT INTO username_change_intents
          (intent_id, character_id, username, username_key, price, expected_name_changes, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(intentId, session.character_id, username, key, free ? 0 : USERNAME_CHANGE_PRICE, session.name_changes, expiresAt, now),
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new ApiError(409, "USERNAME_TAKEN", "Bu kullanıcı adı az önce rezerve edildi.");
    throw error;
  }
  return json({ intentId, username, price: free ? 0 : USERNAME_CHANGE_PRICE, expiresAt }, 201);
}

async function commitRenameIntent(context: ApiContext): Promise<Response> {
  if (context.request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const session = await requireSession(context.request, context.env);
  const body = await readJson(context.request);
  const intentId = body && typeof body === "object" ? String((body as Record<string, unknown>).intentId || "") : "";
  if (!/^[0-9a-f-]{36}$/i.test(intentId)) throw new ApiError(400, "INVALID_RENAME_INTENT", "İsim değiştirme isteği geçersiz.");
  const now = Date.now();
  const intent = await context.env.DB.prepare(`
    SELECT intent_id, username, username_key, price, expected_name_changes, expires_at, used_at
    FROM username_change_intents WHERE intent_id = ? AND character_id = ?
  `).bind(intentId, session.character_id).first<RenameIntentRow>();
  if (!intent || (!intent.used_at && intent.expires_at <= now)) throw new ApiError(410, "RENAME_INTENT_EXPIRED", "İsim değiştirme isteğinin süresi dolmuş.");
  if (intent.used_at) {
    const current = await context.env.DB.prepare(`
      SELECT public_id, username, is_generated, name_changes, last_name_change_at FROM players WHERE character_id = ?
    `).bind(session.character_id).first<SessionRow>();
    if (!current) throw new ApiError(500, "PROFILE_READ_FAILED", "Profil okunamadı.");
    return json({ player: publicProfile(current), chargedPrice: intent.price, repeated: true });
  }
  try {
    const results = await context.env.DB.batch([
      context.env.DB.prepare(`
        UPDATE players SET username = ?, username_key = ?, is_generated = 0,
          name_changes = name_changes + 1, last_name_change_at = ?, last_seen_at = ?
        WHERE character_id = ? AND name_changes = ?
      `).bind(intent.username, intent.username_key, now, now, session.character_id, intent.expected_name_changes),
      context.env.DB.prepare("UPDATE username_change_intents SET used_at = ? WHERE intent_id = ? AND used_at IS NULL").bind(now, intent.intent_id),
    ]);
    if (results[0].meta.changes !== 1) throw new ApiError(409, "PROFILE_CONFLICT", "Profil başka bir oturumda değiştirildi.");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (String(error).toLowerCase().includes("unique")) throw new ApiError(409, "USERNAME_TAKEN", "Bu kullanıcı adı artık kullanılıyor.");
    throw error;
  }
  const player = await context.env.DB.prepare(`
    SELECT public_id, username, is_generated, name_changes, last_name_change_at
    FROM players WHERE character_id = ?
  `).bind(session.character_id).first<SessionRow>();
  if (!player) throw new ApiError(500, "PROFILE_READ_FAILED", "Profil güncellenemedi.");
  return json({ player: publicProfile(player), chargedPrice: intent.price });
}

async function deleteSave(context: ApiContext, session: SessionRow): Promise<Response> {
  await context.env.DB.prepare("DELETE FROM player_saves WHERE character_id = ?").bind(session.character_id).run();
  return json({ deleted: true, revision: 0 });
}

async function saveRoute(context: ApiContext): Promise<Response> {
  const session = await requireSession(context.request, context.env);
  if (context.request.method === "GET") return getSave(context, session);
  if (context.request.method === "PUT") return putSave(context, session);
  if (context.request.method === "DELETE") return deleteSave(context, session);
  return json({ error: "METHOD_NOT_ALLOWED" }, 405);
}

async function leaderboard(context: ApiContext): Promise<Response> {
  if (context.request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  await requireSession(context.request, context.env);
  const requested = Number(new URL(context.request.url).searchParams.get("limit") || 25);
  const limit = Math.min(50, Math.max(5, Number.isFinite(requested) ? Math.floor(requested) : 25));
  const { results } = await context.env.DB.prepare(`
    SELECT p.public_id, p.username, s.player_class, s.level, s.prestige, s.total_kills, s.unique_count, s.power_score, s.portrait_json
    FROM player_saves s JOIN players p ON p.character_id = s.character_id
    ORDER BY s.power_score DESC, s.level DESC, s.total_kills DESC, s.updated_at ASC
    LIMIT ?
  `).bind(limit).all<LeaderboardRow>();
  return json({
    entries: results.map((row, index) => ({
      rank: index + 1,
      name: row.username,
      classId: row.player_class,
      level: row.level,
      prestige: row.prestige,
      kills: row.total_kills,
      uniques: row.unique_count,
      score: row.power_score,
      portrait: (() => { try { return JSON.parse(row.portrait_json); } catch { return {}; } })(),
    })),
    generatedAt: Date.now(),
    competitive: false,
  });
}

export const onRequest: PagesFunction<Bindings> = async context => {
  try {
    const path = routePath(context);
    if (path === "health" && context.request.method === "GET") {
      await context.env.DB.prepare("SELECT 1").first();
      return json({ ok: true, service: "kadim-vadi-cloud-save" }, 200, "no-store");
    }
    if (path === "session") return await createSession(context);
    if (path === "save") return await saveRoute(context);
    if (path === "profile") return await profile(context);
    if (path === "profile/rename-intent") return await createRenameIntent(context);
    if (path === "profile/rename-commit") return await commitRenameIntent(context);
    if (path === "leaderboard") return await leaderboard(context);
    return json({ error: "NOT_FOUND" }, 404);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.code, message: error.message }, error.status);
    console.error(JSON.stringify({ message: "unhandled api error", path: new URL(context.request.url).pathname, error: error instanceof Error ? error.message : String(error) }));
    return json({ error: "INTERNAL_ERROR", message: "Beklenmeyen bir sunucu hatası oluştu." }, 500);
  }
};

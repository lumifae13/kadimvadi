import { contentTypeForAsset, normalizeAssetPath, resolveByteRange } from "../../src/r2-asset-core";

type AssetContext = Parameters<PagesFunction<Env>>[0];

const CACHE_CONTROL = "public, max-age=31536000, immutable";

function routePath(context: AssetContext): string {
  const value = context.params.path;
  return Array.isArray(value) ? value.join("/") : String(value || "");
}

function cacheRequest(request: Request, range: string | null = null): Request {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.toString(), { method: "GET", headers: range ? { range } : undefined });
}

function headResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("content-length", response.headers.get("content-length") || "0");
  return new Response(null, { status: response.status === 206 ? 200 : response.status, headers });
}

function baseHeaders(path: string, object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", CACHE_CONTROL);
  headers.set("content-type", contentTypeForAsset(path) || "application/octet-stream");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("etag", object.httpEtag);
  headers.set("last-modified", object.uploaded.toUTCString());
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

function plain(status: number, message: string, extraHeaders: HeadersInit = {}): Response {
  return new Response(message, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function primeFullAssetCache(context: AssetContext, path: string, cache: Cache): Promise<void> {
  const object = await context.env.GAME_ASSETS.get(path);
  if (!object) return;
  const headers = baseHeaders(path, object);
  headers.set("content-length", String(object.size));
  await cache.put(cacheRequest(context.request), new Response(object.body, { status: 200, headers }));
}

export const onRequest: PagesFunction<Env> = async context => {
  const method = context.request.method;
  if (method !== "GET" && method !== "HEAD") return plain(405, "Method not allowed", { allow: "GET, HEAD" });

  const path = normalizeAssetPath(routePath(context));
  if (!path) return plain(404, "Asset not found");

  const rangeHeader = method === "GET" ? context.request.headers.get("range") : null;
  const edgeCache = caches.default;
  const edgeRequest = cacheRequest(context.request, rangeHeader);
  const cached = await edgeCache.match(edgeRequest);
  if (cached) return method === "HEAD" ? headResponse(cached) : cached;

  if (method === "HEAD") {
    const object = await context.env.GAME_ASSETS.head(path);
    if (!object) return plain(404, "Asset not found");
    const headers = baseHeaders(path, object);
    headers.set("content-length", String(object.size));
    return new Response(null, { status: 200, headers });
  }

  if (rangeHeader) {
    const metadata = await context.env.GAME_ASSETS.head(path);
    if (!metadata) return plain(404, "Asset not found");
    const range = resolveByteRange(rangeHeader, metadata.size);
    if (!range) return plain(416, "Requested range not satisfiable", { "content-range": `bytes */${metadata.size}` });
    const object = await context.env.GAME_ASSETS.get(path, { range: { offset: range.offset, length: range.length } });
    if (!object) return plain(404, "Asset not found");
    const headers = baseHeaders(path, object);
    headers.set("content-length", String(range.length));
    headers.set("content-range", `bytes ${range.start}-${range.end}/${metadata.size}`);
    if (/\.(?:mp3|wav)$/i.test(path)) {
      context.waitUntil(primeFullAssetCache(context, path, edgeCache).catch(error => {
        console.error(JSON.stringify({ message: "audio cache prime failed", path, error: String(error) }));
      }));
    }
    return new Response(object.body, { status: 206, headers });
  }

  const object = await context.env.GAME_ASSETS.get(path);
  if (!object) return plain(404, "Asset not found");
  const headers = baseHeaders(path, object);
  headers.set("content-length", String(object.size));
  const response = new Response(object.body, { status: 200, headers });
  context.waitUntil(edgeCache.put(edgeRequest, response.clone()).catch(error => {
    console.error(JSON.stringify({ message: "asset cache put failed", path, error: String(error) }));
  }));
  return response;
};

export const ASSET_VERSION_PREFIX = "v61/";

const MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".wav": "audio/wav",
};

const SAFE_ASSET_PATH = /^[A-Za-z0-9._/-]+$/;

export type ByteRange = {
  offset: number;
  length: number;
  start: number;
  end: number;
};

export function contentTypeForAsset(path: string): string | null {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  return MIME_TYPES[path.slice(dot).toLowerCase()] || null;
}

export function normalizeAssetPath(value: string): string | null {
  if (!value || value.length > 512 || !SAFE_ASSET_PATH.test(value)) return null;
  if (!value.startsWith(ASSET_VERSION_PREFIX) || value.includes("//")) return null;
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return null;
  return contentTypeForAsset(value) ? value : null;
}

export function resolveByteRange(header: string, size: number): ByteRange | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = header.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    const length = Math.min(suffix, size);
    return { offset: size - length, length, start: size - length, end: size - 1 };
  }

  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;
  const end = Math.min(requestedEnd, size - 1);
  return { offset: start, length: end - start + 1, start, end };
}

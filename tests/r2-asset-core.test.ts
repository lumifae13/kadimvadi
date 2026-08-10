import { describe, expect, it } from "vitest";
import { contentTypeForAsset, normalizeAssetPath, resolveByteRange } from "../src/r2-asset-core";

describe("R2 asset delivery", () => {
  it("only accepts versioned game asset paths", () => {
    expect(normalizeAssetPath("v61/character-v54/female/hair/female-hair1.png")).toBe("v61/character-v54/female/hair/female-hair1.png");
    expect(normalizeAssetPath("v61/kv-bg.mp3")).toBe("v61/kv-bg.mp3");
    expect(normalizeAssetPath("v61/index.html")).toBeNull();
    expect(normalizeAssetPath("v61/../secret.png")).toBeNull();
    expect(normalizeAssetPath("v60/kv-bg.mp3")).toBeNull();
  });

  it("assigns explicit image, audio and manifest content types", () => {
    expect(contentTypeForAsset("thing.PNG")).toBe("image/png");
    expect(contentTypeForAsset("sound.wav")).toBe("audio/wav");
    expect(contentTypeForAsset("music.mp3")).toBe("audio/mpeg");
    expect(contentTypeForAsset("manifest.json")).toBe("application/json; charset=utf-8");
    expect(contentTypeForAsset("page.html")).toBeNull();
  });

  it("resolves bounded HTTP byte ranges for game audio", () => {
    expect(resolveByteRange("bytes=10-19", 100)).toEqual({ offset: 10, length: 10, start: 10, end: 19 });
    expect(resolveByteRange("bytes=95-", 100)).toEqual({ offset: 95, length: 5, start: 95, end: 99 });
    expect(resolveByteRange("bytes=-12", 100)).toEqual({ offset: 88, length: 12, start: 88, end: 99 });
    expect(resolveByteRange("bytes=0-999", 100)).toEqual({ offset: 0, length: 100, start: 0, end: 99 });
    expect(resolveByteRange("bytes=100-", 100)).toBeNull();
    expect(resolveByteRange("bytes=8-2", 100)).toBeNull();
    expect(resolveByteRange("bytes=0-1,4-5", 100)).toBeNull();
  });
});

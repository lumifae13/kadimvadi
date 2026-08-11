import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join, relative, resolve, sep } from "node:path";
import ffmpegPath from "ffmpeg-static";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "ucp-package");
const outputRelative = relative(root, output);
const excludedAudio = /\.(?:mp3|ogg|wav)$/i;
const packagedAudioDirectory = `${sep}phone-audio${sep}`;
const v62Root = join(root, "game-assets", "v62");
const excludedUnusedAssets = new Set([
  "blood-blue.png",
  "blood-green.png",
  "blood.png",
  "buff-blue.png",
  "goddess-npc-showcase.gif",
  join("character-v54", "manifest.json"),
]);

if (basename(output) !== "ucp-package" || outputRelative.startsWith("..") || outputRelative === "") {
  throw new Error("Güvensiz UCP çıktı yolu reddedildi.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "index.html"), join(output, "index.html"));

for (const file of await readdir(root)) {
  if (file.endsWith(".png")) await cp(join(root, file), join(output, file));
}

await cp(join(root, "assets"), join(output, "assets"), { recursive: true });
await cp(v62Root, join(output, "game-assets", "v62"), {
  recursive: true,
  filter: source => {
    const relativeAsset = relative(v62Root, source);
    if (excludedUnusedAssets.has(relativeAsset)) return false;
    return source.includes(packagedAudioDirectory) || !excludedAudio.test(source);
  },
});

function runFfmpeg(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpegPath, args, { stdio: "inherit" });
    child.on("error", rejectPromise);
    child.on("exit", code => code === 0 ? resolvePromise() : rejectPromise(new Error(`FFmpeg ${code} koduyla kapandı.`)));
  });
}

if (!ffmpegPath) throw new Error("ffmpeg-static çalıştırılabilir dosyası bulunamadı.");
await runFfmpeg([
  "-hide_banner", "-loglevel", "error", "-y",
  "-i", join(v62Root, "5uCOUOu.png"),
  "-vf", "scale=704:384:flags=neighbor", "-frames:v", "1",
  join(output, "game-assets", "v62", "5uCOUOu.png"),
]);

async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    total += entry.isDirectory() ? await directoryBytes(path) : (await stat(path)).size;
  }
  return total;
}

const bytes = await directoryBytes(output);
if (bytes > 8 * 1024 * 1024) throw new Error(`UCP paketi 8 MB sınırını aşıyor: ${bytes} bayt.`);
console.log(`UCP paketi hazır: ${(bytes / 1024 / 1024).toFixed(2)} MB (görseller ve kullanılan sesler dahil).`);

import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "ucp-package");
const outputRelative = relative(root, output);
const excludedAudio = /\.(?:mp3|ogg|wav)$/i;
const packagedAudioDirectory = `${sep}phone-audio${sep}`;

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
await cp(join(root, "game-assets", "v62"), join(output, "game-assets", "v62"), {
  recursive: true,
  filter: source => source.includes(packagedAudioDirectory) || !excludedAudio.test(source),
});

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

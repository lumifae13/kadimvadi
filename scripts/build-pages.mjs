import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");
const outputRelative = relative(root, output);

if (basename(output) !== "dist" || outputRelative.startsWith("..") || outputRelative === "") {
  throw new Error("Güvensiz build çıktı yolu reddedildi.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "_headers"]) {
  await cp(join(root, file), join(output, file));
}

for (const file of await readdir(root)) {
  if (file.endsWith(".png")) await cp(join(root, file), join(output, file));
}

await cp(join(root, "assets"), join(output, "assets"), { recursive: true });
await cp(join(root, "character-v54"), join(output, "character-v54"), { recursive: true });
await cp(join(root, "game-assets"), join(output, "game-assets"), { recursive: true });

console.log("Cloudflare Pages çıktısı hazır: dist/");

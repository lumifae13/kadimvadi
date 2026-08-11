import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "game-assets", "v62");
const output = join(source, "phone-audio");
const files = [
  "kv-bg.mp3",
  "kv-player-attack.wav",
  "kv-enemy-attack.wav",
  "gem.wav",
  "kv-level-up.wav",
  "kv-equip.wav",
  "kv-buy.wav",
  "kv-map-change.wav",
  "kv-chest.wav",
  "kv-enemy-death.wav",
  "kv-player-death.wav",
  "kv-tab.wav",
  "kv-select.wav",
  "kv-ritual.wav",
  "kv-quest-start.wav",
  "kv-rune.wav",
  "kv-altar-upgrade.wav",
  "kv-weapon-upgrade.wav",
  "kv-robe-upgrade.wav",
  "boss-warning.wav",
];

if (!ffmpegPath) throw new Error("ffmpeg-static çalıştırılabilir dosyası bulunamadı.");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

function encode(input, destination, bitrate) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-vn", "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", bitrate, destination,
    ], { stdio: "inherit" });
    child.on("error", rejectPromise);
    child.on("exit", code => code === 0 ? resolvePromise() : rejectPromise(new Error(`FFmpeg ${code} koduyla kapandı: ${basename(input)}`)));
  });
}

for (const file of files) {
  const target = `${file.replace(/\.(?:mp3|wav)$/i, "")}.mp3`;
  await encode(join(source, file), join(output, target), "48k");
}

console.log(`${files.length} telefon sesi paket boyutuna uygun MP3 olarak hazırlandı.`);

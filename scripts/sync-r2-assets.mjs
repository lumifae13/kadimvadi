import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wranglerBin = resolve(root, "node_modules", "wrangler", "bin", "wrangler.js");
const allowedExtensions = new Set([".gif", ".json", ".mp3", ".png", ".wav"]);
const contentTypes = new Map([
  [".gif", "image/gif"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".wav", "audio/wav"],
]);

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} için değer gerekli.`);
  return value;
}

const bucket = readOption("bucket", "kadim-vadi-assets");
const prefix = readOption("prefix", "v61").replace(/^\/+|\/+$/g, "");
const gitRef = readOption("ref", "origin/img");
const concurrency = Number(readOption("concurrency", "6"));
const dryRun = process.argv.includes("--dry-run");

if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) throw new Error("Geçersiz R2 bucket adı.");
if (!/^v[0-9A-Za-z.-]+$/.test(prefix)) throw new Error("Geçersiz asset sürüm öneki.");
if (!/^[A-Za-z0-9_./-]+$/.test(gitRef)) throw new Error("Geçersiz Git ref değeri.");
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error("Eşzamanlılık 1-12 arasında olmalı.");

function extension(path) {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot).toLowerCase();
}

function collect(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(`${command} başarısız (${code}): ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
  });
}

async function upload(path) {
  const ext = extension(path);
  const objectPath = `${bucket}/${prefix}/${path}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await new Promise(resolvePromise => {
      const git = spawn("git", ["cat-file", "blob", `${gitRef}:${path}`], {
        cwd: root,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const wrangler = spawn(process.execPath, [
        wranglerBin,
        "r2", "object", "put", objectPath,
        "--pipe", "--remote", "--force",
        "--content-type", contentTypes.get(ext),
        "--cache-control", "public, max-age=31536000, immutable",
      ], {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const gitErrors = [];
      const wranglerOutput = [];
      const wranglerErrors = [];
      let gitCode = null;
      let wranglerCode = null;
      git.stderr.on("data", chunk => gitErrors.push(chunk));
      wrangler.stdout.on("data", chunk => wranglerOutput.push(chunk));
      wrangler.stderr.on("data", chunk => wranglerErrors.push(chunk));
      wrangler.stdin.on("error", error => {
        if (error.code !== "EPIPE") wranglerErrors.push(Buffer.from(String(error)));
      });
      git.stdout.pipe(wrangler.stdin);
      const finish = () => {
        if (gitCode === null || wranglerCode === null) return;
        resolvePromise({
          ok: gitCode === 0 && wranglerCode === 0,
          detail: [...gitErrors, ...wranglerOutput, ...wranglerErrors].map(value => value.toString("utf8")).join("").trim(),
        });
      };
      git.on("error", error => { gitErrors.push(Buffer.from(String(error))); gitCode = -1; finish(); });
      wrangler.on("error", error => { wranglerErrors.push(Buffer.from(String(error))); wranglerCode = -1; finish(); });
      git.on("close", code => { gitCode = code; finish(); });
      wrangler.on("close", code => { wranglerCode = code; finish(); });
    });
    if (result.ok) return;
    if (attempt === 3) throw new Error(`${path}: ${result.detail || "yükleme başarısız"}`);
    await new Promise(resolvePromise => setTimeout(resolvePromise, attempt * 750));
  }
}

const tree = await collect("git", ["ls-tree", "-r", "--name-only", gitRef]);
const files = tree.split(/\r?\n/).filter(Boolean).filter(path => allowedExtensions.has(extension(path)));
if (!files.length) throw new Error(`${gitRef} içinde yüklenebilir asset bulunamadı.`);

console.log(`${files.length} asset bulundu. Hedef: R2 ${bucket}/${prefix}/`);
console.log("HTML ve desteklenmeyen dosyalar güvenlik nedeniyle taşınmayacak.");

if (dryRun) {
  const counts = Object.groupBy(files, path => extension(path));
  for (const [ext, paths] of Object.entries(counts)) console.log(`${ext}: ${paths.length}`);
  process.exit(0);
}

let cursor = 0;
let completed = 0;
const failures = [];
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= files.length) return;
    try {
      await upload(files[index]);
    } catch (error) {
      failures.push(String(error));
    }
    completed++;
    if (completed % 25 === 0 || completed === files.length) console.log(`R2 yükleme: ${completed}/${files.length}`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, () => worker()));
if (failures.length) {
  console.error(`${failures.length} asset yüklenemedi:\n${failures.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log(`Tamamlandı: ${files.length} asset R2'ye yüklendi.`);

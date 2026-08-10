import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

if (!scripts.length) throw new Error("index.html içinde denetlenecek inline JavaScript bulunamadı.");

for (const [index, source] of scripts.entries()) {
  try {
    Function(source);
  } catch (error) {
    throw new Error(`Inline JavaScript #${index + 1} sözdizimi hatalı: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`${scripts.length} inline JavaScript bloğunun sözdizimi geçerli.`);

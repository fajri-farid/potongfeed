import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const outDir = join(process.cwd(), "out");
const swOutPath = join(outDir, "sw.js");

if (!existsSync(outDir) || !existsSync(swOutPath)) {
  throw new Error(
    "Folder out/ atau out/sw.js tidak ditemukan. Pastikan next build dengan output: 'export' berjalan terlebih dahulu.",
  );
}

const IGNORED_FILES = new Set(["/sw.js", "/.DS_Store", "/Thumbs.db"]);

function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else {
      const relPosix = "/" + relative(outDir, fullPath).replaceAll("\\", "/");
      if (!IGNORED_FILES.has(relPosix)) {
        results.push({ url: relPosix, fullPath });
      }
    }
  }
  return results;
}

const files = collectFiles(outDir).sort((a, b) => a.url.localeCompare(b.url));
const hash = createHash("sha256");

for (const item of files) {
  hash.update(item.url);
  hash.update(readFileSync(item.fullPath));
}

const cacheVersion = `potongfeed-${hash.digest("hex").slice(0, 12)}`;
const precacheUrls = Array.from(new Set(["/", ...files.map((item) => item.url)]));

const swTemplate = readFileSync(swOutPath, "utf8");
const versionMarker = 'const CACHE_VERSION = "__POTONGFEED_CACHE_VERSION__";';
const urlsMarker = 'const PRECACHE_URLS = ["/"];';

if (!swTemplate.includes(versionMarker) || !swTemplate.includes(urlsMarker)) {
  throw new Error("Marker CACHE_VERSION atau PRECACHE_URLS tidak ditemukan pada out/sw.js.");
}

const updatedSw = swTemplate
  .replace(versionMarker, `const CACHE_VERSION = ${JSON.stringify(cacheVersion)};`)
  .replace(urlsMarker, `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`);

writeFileSync(swOutPath, updatedSw, "utf8");
console.log(
  `[postbuild] Precache out/sw.js diperbarui (${cacheVersion}, ${precacheUrls.length} aset).`,
);

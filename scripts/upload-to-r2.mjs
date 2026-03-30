import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";

config();

const DRIVE_PATH = "G:/.shortcut-targets-by-id/1cVaUf3nolyYwDwf0ynPUZuPrazEh0QZy/VS - ACERVO DE VS E SHOWS MONTADOS";
const TEMP_BASE = path.join(os.tmpdir(), "palco-solo-extract");
const PARALLEL_UPLOADS = 5; // stems simultâneos
const PARALLEL_ZIPS = 1; // 1 zip por vez para economizar disco

const GENRE_MAP = {
  "01. ATUALIZAÇÕES 2017-2026": "atualizacoes",
  "02. FORRÓ DAS ANTIGAS": "forro",
  "03. PAGODES": "pagode",
  "04. SERTANEJO": "sertanejo",
  "05. GOSPEL": "gospel",
  "06. ROCK POP MPB BREGA": "rock-pop-mpb",
  "07. AXÉS, CARNAVAL E PAGODE BAIANO": "axe-carnaval",
  "08. ABERTURAS DE SHOW": "aberturas",
  "09. PLAYBACKS FECHADOS": "playbacks",
  "10. PASTA DE SHOWS MONTADOS MULTIPISTAS REAPER": "shows-multipistas",
  "11. PASTA DE SHOWS MONTADOS PLAYBACKS FECHADOS": "shows-playbacks",
};

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  maxAttempts: 3,
});

const BUCKET = process.env.R2_BUCKET;
const SCRIPTS_DIR = path.join(process.cwd(), "scripts");
const LOG_FILE = path.join(SCRIPTS_DIR, "upload-progress.json");
const CATALOG_FILE = path.join(SCRIPTS_DIR, "catalog.json");

function loadProgress() {
  try {
    if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {}
  return { completed: [], catalog: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(progress));
}

function slugify(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getContentType(ext) {
  return { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4" }[ext] || "application/octet-stream";
}

// Parallel execution with concurrency limit
async function parallelMap(items, fn, concurrency) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function uploadStem(filePath, r2Key) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: r2Key,
    Body: buffer,
    ContentType: getContentType(ext),
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return buffer.length;
}

function findAudioFiles(dir) {
  const files = [];
  try {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) files.push(...findAudioFiles(full));
        else {
          const ext = path.extname(item).toLowerCase();
          if ([".mp3", ".wav", ".ogg", ".m4a"].includes(ext)) files.push(full);
        }
      } catch {}
    }
  } catch {}
  return files;
}

async function processZip(zipPath, genreSlug, genreName, tempDir) {
  const zipName = path.basename(zipPath, ".zip");
  const songSlug = slugify(zipName);

  // Clean and create temp dir for this zip
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  // Copy zip locally
  const localZip = path.join(tempDir, "current.zip");
  fs.copyFileSync(zipPath, localZip);

  // Extract
  try {
    execSync(`unzip -o -q "${localZip}" -d "${tempDir}"`, { timeout: 120000, stdio: "pipe" });
  } catch {
    try {
      const psPath = localZip.replace(/\//g, "\\");
      const psDir = tempDir.replace(/\//g, "\\");
      execSync(`powershell -Command "Expand-Archive -LiteralPath '${psPath}' -DestinationPath '${psDir}' -Force"`, { timeout: 120000, stdio: "pipe" });
    } catch (e) {
      throw new Error(`extract failed: ${e.message}`);
    }
  }

  fs.unlinkSync(localZip);

  const audioFiles = findAudioFiles(tempDir);
  if (audioFiles.length === 0) throw new Error("no audio files");

  // Upload all stems in parallel
  const stems = [];
  await parallelMap(audioFiles, async (audioPath) => {
    const ext = path.extname(audioPath).toLowerCase();
    const stemName = path.basename(audioPath, ext);
    const stemSlug = slugify(stemName);
    const r2Key = `stems/${genreSlug}/${songSlug}/${stemSlug}${ext}`;

    const size = await uploadStem(audioPath, r2Key);
    stems.push({
      name: stemName, slug: stemSlug, key: r2Key,
      url: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
      format: ext.slice(1), size,
    });
  }, PARALLEL_UPLOADS);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    name: zipName, slug: songSlug, genre: genreName, genreSlug,
    stems, stemCount: stems.length,
  };
}

async function main() {
  console.log("🎵 Upload TURBO para Cloudflare R2");
  console.log(`⏰ ${new Date().toLocaleString("pt-BR")}`);
  console.log(`🔧 ${PARALLEL_ZIPS} zips simultâneos, ${PARALLEL_UPLOADS} stems paralelos\n`);

  const progress = loadProgress();
  console.log(`📋 ${progress.completed.length} músicas já feitas\n`);

  fs.mkdirSync(TEMP_BASE, { recursive: true });

  // Collect all zip tasks
  const allTasks = [];
  const genres = fs.readdirSync(DRIVE_PATH).filter((f) => {
    try { return fs.statSync(path.join(DRIVE_PATH, f)).isDirectory(); } catch { return false; }
  });

  for (const genre of genres) {
    const genreSlug = GENRE_MAP[genre] || slugify(genre);
    const genrePath = path.join(DRIVE_PATH, genre);
    let zips;
    try {
      zips = fs.readdirSync(genrePath).filter((f) => f.toLowerCase().endsWith(".zip"));
    } catch { continue; }

    for (const zipFile of zips) {
      const songSlug = slugify(path.basename(zipFile, ".zip"));
      const songKey = `${genreSlug}/${songSlug}`;
      if (progress.completed.includes(songKey)) continue;
      allTasks.push({ zipPath: path.join(genrePath, zipFile), genreSlug, genre, songKey, zipFile });
    }
  }

  console.log(`📦 ${allTasks.length} músicas para processar\n`);

  if (allTasks.length === 0) {
    console.log("✅ Tudo já foi enviado!");
    return;
  }

  let done = 0;
  let errors = 0;
  let skipped = 0;
  const startTime = Date.now();

  // Process zips in parallel batches
  for (let i = 0; i < allTasks.length; i += PARALLEL_ZIPS) {
    const batch = allTasks.slice(i, i + PARALLEL_ZIPS);

    const results = await Promise.allSettled(
      batch.map(async (task, batchIdx) => {
        const tempDir = path.join(TEMP_BASE, `worker-${batchIdx}`);
        const shortName = path.basename(task.zipFile, ".zip").substring(0, 40);
        const t0 = Date.now();

        try {
          const songData = await processZip(task.zipPath, task.genreSlug, task.genre, tempDir);
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          done++;
          const total = progress.completed.length + done;
          const rate = (done / ((Date.now() - startTime) / 60000)).toFixed(1);
          console.log(`✅ [${total}] ${shortName} — ${songData.stemCount} stems (${elapsed}s) [${rate}/min]`);

          progress.completed.push(task.songKey);
          progress.catalog.push(songData);
          return songData;
        } catch (err) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          if (err.message.includes("copyfile") || err.message.includes("UNKNOWN") || err.message.includes("EBUSY")) {
            skipped++;
            console.log(`⏭️  ${shortName} — não sincronizado ainda (${elapsed}s)`);
          } else {
            errors++;
            console.log(`❌ ${shortName} — ${err.message.substring(0, 60)} (${elapsed}s)`);
          }
          // Cleanup on error
          try { fs.rmSync(path.join(TEMP_BASE, `worker-${batchIdx}`), { recursive: true, force: true }); } catch {}
          return null;
        }
      })
    );

    // Save progress after each batch
    saveProgress(progress);

    // Save catalog every 100 songs
    if (done % 100 < PARALLEL_ZIPS) {
      fs.writeFileSync(CATALOG_FILE, JSON.stringify(progress.catalog, null, 2));
    }
  }

  // Final save
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(progress.catalog, null, 2));
  saveProgress(progress);

  const totalMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log("\n=====================================");
  console.log(`✅ Rodada concluída em ${totalMin} min`);
  console.log(`   📤 Enviadas: ${done}`);
  console.log(`   ⏭️  Não sincronizadas: ${skipped}`);
  console.log(`   ❌ Erros: ${errors}`);
  console.log(`   📋 Total no catálogo: ${progress.catalog.length}`);

  if (skipped > 0) {
    console.log(`\n⚠️  ${skipped} músicas não estavam sincronizadas. Rode o script novamente quando o Drive terminar de baixar.`);
  }
}

main().catch(console.error);

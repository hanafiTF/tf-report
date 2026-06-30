/**
 * main.js — CommonJS
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mariadb = require('mariadb');
const fs      = require('fs');
const path    = require('path');
const { Worker } = require('worker_threads');
const os      = require('os');

const OUTPUT_DIR  = path.join(__dirname, 'output');
const WORKER_PATH = path.join(__dirname, 'worker.js');
const BATCH_SIZE  = 10000;
const MAX_WORKERS = Math.max(1, os.cpus().length);

const DB_META_CONFIG = {
  host:     process.env.DB1_HOST,
  user:     process.env.DB1_USER,
  password: process.env.DB1_PASSWORD,
  database: process.env.DB1_NAME,
  port:     parseInt(process.env.DB1_PORT) || 3306,
  connectTimeout: 30000,
};

const DB_TF2_CONFIG = {
  host:     process.env.DB_TF2_HOST,
  user:     process.env.DB_TF2_USER,
  password: process.env.DB_TF2_PASSWORD,
  database: process.env.DB_TF2_NAME,
  port:     parseInt(process.env.DB_TF2_PORT) || 3306,
};

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function runWorker(batch, batchIndex, total) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { batch, batchIndex, dbTF2Config: DB_TF2_CONFIG, outputDir: OUTPUT_DIR },
    });

    worker.on('message', msg => {
      if (msg.type === 'done') {
        console.log(`✅ Batch ${msg.batchIndex + 1}/${total} — ${msg.count} user punya subs → ${path.basename(msg.outFile)}`);
        resolve(msg);
      } else if (msg.type === 'fatal') {
        // Tampilkan semua detail error supaya tidak kosong lagi
        const detail = [msg.message, msg.code, msg.errno, msg.stack].filter(Boolean).join(' | ');
        console.error(`❌ Batch ${msg.batchIndex + 1}/${total} FATAL: ${detail}`);
        reject(new Error(detail));
      } else if (msg.type === 'warn') {
        console.warn(`  ⚠️  Batch[${msg.batchIndex}] ims_id=${msg.ims_id} errno=${msg.errno}: ${msg.message}`);
      } else if (msg.type === 'progress') {
        process.stdout.write(`  ⏳ Batch ${msg.batchIndex + 1} — ${msg.done}/${msg.total}\r`);
      }
    });

    worker.on('error', err => {
      console.error(`❌ Batch ${batchIndex + 1} worker error:`, err.message);
      reject(err);
    });

    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`Worker batch ${batchIndex} exit code ${code}`));
    });
  });
}

async function runWithConcurrency(batches, concurrency) {
  const total    = batches.length;
  const queue    = batches.map((b, i) => ({ batch: b, index: i }));
  let completed  = 0;
  let failed     = 0;

  async function next() {
    if (queue.length === 0) return;
    const { batch, index } = queue.shift();
    console.log(`🚀 Batch ${index + 1}/${total} dimulai (${batch.length} user)`);

    try {
      await runWorker(batch, index, total);
      completed++;
    } catch (_) {
      failed++;
    }
    await next();
  }

  const slots = Array.from({ length: Math.min(concurrency, queue.length) }, () => next());
  await Promise.all(slots);

  console.log(`\n📦 Selesai. Berhasil: ${completed}/${total} | Gagal: ${failed}/${total}`);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── Step 1: Query CRM ───────────────────────────────────────────────────────
  console.log('🔄 Mengambil data CRM dari maenmeta2...');
  const metaPool = mariadb.createPool({ ...DB_META_CONFIG, connectionLimit: 3 });
  let crmRows;

  try {
    const conn = await metaPool.getConnection();
    crmRows = await conn.query(`
      SELECT a.crm_id, a.ims_id, brokers.codename FROM srcims a
      INNER JOIN brokers ON a.source = brokers.id
      WHERE a.id IN(SELECT srcims_id FROM srcims_deposit WHERE srcims_id IS NOT NULL GROUP BY srcims_id)
    `);
    conn.release();
  } finally {
    await metaPool.end();
  }

  console.log(`✅ ${crmRows.length.toLocaleString()} CRM rows ditemukan.`);
  if (crmRows.length === 0) return;

  // ── Step 2: Simpan raw CRM per batch ───────────────────────────────────────
  const batches = chunkArray(crmRows, BATCH_SIZE);
  console.log(`📂 Menyimpan ${batches.length} file CRM raw...`);
  batches.forEach((b, i) => {
    const file = path.join(OUTPUT_DIR, `crm_${String(i).padStart(4, '0')}.json`);
    fs.writeFileSync(file, JSON.stringify(b, null, 2), 'utf8');
  });

  // ── Step 3: Worker threads ──────────────────────────────────────────────────
  console.log(`\n🧵 Mulai proses subscription — ${MAX_WORKERS} worker parallel\n`);
  const started = Date.now();
  await runWithConcurrency(batches, MAX_WORKERS);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`⏱️  Selesai dalam ${elapsed}s`);
  console.log(`📁 Output: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
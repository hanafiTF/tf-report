/**
 * check.js — Cek CRM mana yang punya subs dan mana yang tidak
 * Jalankan: node check.js
 */
const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');

// ── Baca semua crm_XXXX.json ──────────────────────────────────────────────────
const crmFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('crm_') && f.endsWith('.json')).sort();
if (crmFiles.length === 0) {
  console.error('❌ Tidak ada file crm_XXXX.json di folder output/');
  process.exit(1);
}

let allCRM = [];
for (const f of crmFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf8'));
  allCRM = allCRM.concat(data);
}

// ── Baca semua subs_XXXX.json ─────────────────────────────────────────────────
const subsFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('subs_') && f.endsWith('.json')).sort();

const hasSubs = new Set(); // Set of ims_id yang punya subs
for (const f of subsFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf8'));
  for (const row of data) {
    hasSubs.add(String(row.ims_id));
  }
}

// ── Pisahkan ──────────────────────────────────────────────────────────────────
const withSubs    = allCRM.filter(r => hasSubs.has(String(r.ims_id)));
const withoutSubs = allCRM.filter(r => !hasSubs.has(String(r.ims_id)));

// ── Simpan hasil ──────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUTPUT_DIR, 'result_with_subs.json'),    JSON.stringify(withSubs, null, 2), 'utf8');
fs.writeFileSync(path.join(OUTPUT_DIR, 'result_without_subs.json'), JSON.stringify(withoutSubs, null, 2), 'utf8');

// ── Summary ───────────────────────────────────────────────────────────────────
const pad = n => n.toLocaleString().padStart(10);
console.log('\n📊 Hasil Check CRM vs Subscription');
console.log('─'.repeat(40));
console.log(`  Total CRM          : ${pad(allCRM.length)}`);
console.log(`  ✅ Punya subs      : ${pad(withSubs.length)}`);
console.log(`  ❌ Tidak ada subs  : ${pad(withoutSubs.length)}`);
console.log('─'.repeat(40));

// Breakdown per codename
const byCodename = {};
for (const r of allCRM) {
  if (!byCodename[r.codename]) byCodename[r.codename] = { total: 0, withSubs: 0 };
  byCodename[r.codename].total++;
  if (hasSubs.has(String(r.ims_id))) byCodename[r.codename].withSubs++;
}

console.log('\n📂 Breakdown per Codename:');
console.log(`  ${'Codename'.padEnd(15)} ${'Total'.padStart(8)} ${'Punya Subs'.padStart(12)} ${'Tidak'.padStart(8)}`);
console.log('  ' + '─'.repeat(45));
for (const [code, stat] of Object.entries(byCodename).sort((a,b) => b[1].total - a[1].total)) {
  const noSubs = stat.total - stat.withSubs;
  console.log(`  ${code.padEnd(15)} ${String(stat.total).padStart(8)} ${String(stat.withSubs).padStart(12)} ${String(noSubs).padStart(8)}`);
}

console.log('\n📁 File tersimpan:');
console.log(`  output/result_with_subs.json    (${withSubs.length} CRM)`);
console.log(`  output/result_without_subs.json (${withoutSubs.length} CRM)\n`);
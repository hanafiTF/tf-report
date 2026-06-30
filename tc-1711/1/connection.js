/**
 * test-conn.js — cek koneksi ke DB tf2
 * Jalankan: node test-conn.js
 */
require('dotenv').config();
const mariadb = require('mariadb');

async function main() {
  const config = {
    host:     process.env.DB_TF2_HOST,
    user:     process.env.DB_TF2_USER,
    password: process.env.DB_TF2_PASSWORD,
    database: process.env.DB_TF2_NAME,
    port:     parseInt(process.env.DB_TF2_PORT) || 3306,
    connectTimeout: 10000,
  };

  console.log('🔍 Config yang dipakai:');
  console.log({
    host:     config.host     || '❌ KOSONG (DB_TF2_HOST)',
    user:     config.user     || '❌ KOSONG (DB_TF2_USER)',
    password: config.password ? '***set***' : '❌ KOSONG (DB_TF2_PASSWORD)',
    database: config.database || '❌ KOSONG (DB_TF2_NAME)',
    port:     config.port,
  });

  const missing = ['host','user','password','database'].filter(k => !config[k]);
  if (missing.length) {
    console.error(`\n❌ .env kurang: ${missing.map(k => 'DB_TF2_' + k.toUpperCase()).join(', ')}`);
    process.exit(1);
  }

  console.log('\n🔄 Mencoba konek...');
  let conn;
  try {
    conn = await mariadb.createConnection(config);
    console.log('✅ Koneksi berhasil!');
    const rows = await conn.query('SELECT 1 AS ok');
    console.log('✅ Query test OK:', rows[0]);
  } catch (err) {
    console.error('\n❌ Gagal konek:');
    console.error('  message:', err.message);
    console.error('  errno:  ', err.errno);
    console.error('  code:   ', err.code);
  } finally {
    if (conn) await conn.end();
  }
}

main();
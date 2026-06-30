/**
 * worker.js — CommonJS
 */
const { workerData, parentPort } = require('worker_threads');
const mariadb = require('mariadb');
const fs = require('fs');
const path = require('path');

const { batch, dbTF2Config, batchIndex, outputDir } = workerData;

const CONN_CONFIG = {
  ...dbTF2Config,
  connectTimeout: 30000,
  socketTimeout:  120000,
};

const SUBS_QUERY = `
  WITH base AS (
		SELECT dc.user_id, dc.id, dc.title, dc.banned, 
	    -- Kondisi: Jika post_signal bernilai false, tampilkan last_signal. Jika true, tampilkan NULL.
	    CASE 
	        WHEN COUNT(CASE WHEN ds.CREATED_AT IS NOT NULL AND ds.close_time IS NULL THEN 1 END) = 0 
	        THEN MAX(ds.CREATED_AT)
	        ELSE NULL 
	    END AS last_signal,
	    -- Logika post_signal
	    CASE 
	        WHEN COUNT(CASE WHEN ds.CREATED_AT <= CONCAT(UTC_DATE(), ' 16:59:59') AND ds.CREATED_AT >= CONCAT(DATE_SUB(UTC_DATE(), INTERVAL 3 MONTH), ' 17:00:00') AND ds.active = 1 THEN 1 END) > 0 THEN 'true'
	        ELSE 'false'
	    END AS post_signal,
	    -- logika berapa bulan ini channel
	     PERIOD_DIFF(
	        EXTRACT(YEAR_MONTH FROM UTC_TIMESTAMP()), 
	        EXTRACT(YEAR_MONTH FROM CONVERT_TZ(FROM_UNIXTIME(dc.created_time), @@session.time_zone, '+00:00'))
	    ) AS selisih_bulan
	FROM dsc_channels dc 
	LEFT JOIN dsc_signals ds ON dc.id = ds.channel_id
	WHERE dc.user_id = ?
	GROUP BY dc.user_id, dc.id, dc.title, dc.banned
)
SELECT b.user_id AS ims_id, JSON_ARRAYAGG(JSON_OBJECT('channel_id', b.id, 'channel_name', b.title, 'channel_banned', b.banned, 'last_signal', b.last_signal, 'post_signal', b.post_signal, 'selisih_bulan', b.selisih_bulan) ORDER BY b.last_signal DESC) AS channel_list
FROM base b
WHERE b.post_signal = 'false' and b.banned = 0
GROUP BY b.user_id
`;

const SUBS_QUERY_INVESTOR = `
  SELECT a.crm_id, a.ims_id, MIN(sd.created_at) as investor_date,
  CASE 
    /*
      TODO
      last_signal = ambil dari SUBS_QUERY dengan channel_list paling atas karena yang terbaru
      kalau ternyata inverstor_date lebih besar dari last_signal hasilnya true
    */
    WHEN COUNT(CASE WHEN MIN(sd.created_at) as investor_date > last_signal THEN 1 END)  > 0 THEN 'true'
	  THEN MAX(ds.CREATED_AT)
	  ELSE NULL 
	  END AS last_signal, 
  FROM srcims a 
  INNER JOIN brokers ON a.source = brokers.id
  INNER JOIN srcims_deposit sd ON a.ims_id = sd.ims_id
  WHERE a.\`source\` NOT IN (2,3) AND a.ims_id = ?
  GROUP BY a.crm_id, a.ims_id
`

async function createConn() {
  return mariadb.createConnection(CONN_CONFIG);
}

async function ensureConn(conn) {
  try {
    await conn.ping();
    return conn;
  } catch (_) {
    try { await conn.end(); } catch (_) {}
    return createConn();
  }
}

async function processBatch() {
  const results = [];
  let conn = await createConn();

  for (let i = 0; i < batch.length; i++) {
    const crm = batch[i];

    // Ping setiap 500 user supaya koneksi tidak stale
    if (i > 0 && i % 500 === 0) {
      conn = await ensureConn(conn);
      parentPort.postMessage({ type: 'progress', batchIndex, done: i, total: batch.length });
    }

    try {
      const rows = await conn.query(SUBS_QUERY, [crm.ims_id]);
      if (rows.length > 0) {
        results.push({
          crm_id:        crm.crm_id,
          ims_id:        crm.ims_id,
          channel_list: rows.map(r => ({
            channel_id: r.channel_id,
            channel_name: r.channel_name,
            channel_banned: r.channel_banned,
            last_signal: r.last_signal,
            post_signal: r.post_signal,
            mont_diff: r.selisih_bulan
          })),
        });
      }
      const investorRows = await conn.query(SUBS_QUERY_INVESTOR, [crm.ims_id]); // TODO iini harusnya menggunakan connection crm
      /**
       * Kalau investorRows
       */
    } catch (userErr) {
      parentPort.postMessage({
        type:       'warn',
        batchIndex,
        ims_id:     crm.ims_id,
        message:    userErr.message || String(userErr),
        errno:      userErr.errno,
      });

      // Reconnect kalau koneksi mati
      if (userErr.fatal || userErr.errno === 45028 || !conn.isValid()) {
        try { await conn.end(); } catch (_) {}
        conn = await createConn();
      }
    }
  }

  try { await conn.end(); } catch (_) {}

  // Simpan langsung ke file JSON dari dalam worker
  const outFile = path.join(outputDir, `task3_${String(batchIndex).padStart(4, '0')}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');

  return { count: results.length, outFile };
}

processBatch()
  .then(({ count, outFile }) => {
    parentPort.postMessage({ type: 'done', batchIndex, count, outFile });
  })
  .catch(err => {
    // Serialize error dengan benar supaya tidak hilang
    parentPort.postMessage({
      type:    'fatal',
      batchIndex,
      message: err.message || String(err),
      errno:   err.errno,
      code:    err.code,
      stack:   err.stack,
    });
  });
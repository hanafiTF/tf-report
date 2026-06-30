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
  SELECT max(a.id) AS id, a.channel_id, b.price AS channel_price,
    CASE
      WHEN COUNT(a.id) < 2
      AND TIMESTAMPDIFF (SECOND, MIN(a.CREATED_AT), MAX(a.EXPIRED)) > 2591999 THEN DATE_ADD(DATE_ADD(MAX(a.EXPIRED), INTERVAL -30 DAY), INTERVAL 1 SECOND)
      ELSE DATE_ADD(DATE_ADD(MIN(a.EXPIRED), INTERVAL -30 DAY), INTERVAL 1 SECOND)
    END AS subsDate, MAX(a.EXPIRED) AS subsExpired, a.paid, b.title, IFNULL(cr.rank, 0) AS \`rank\`,
    IFNULL(e.symbol, tsub.symbol) AS symbol, b.medals, b.total_active_subs, (a.user_id = b.user_id) AS own,
    IF ( cr.rank = 10 AND cr.pips_settled < cr.pips_treshold, 1, 0 ) AS suspend,
    CONCAT("[", GROUP_CONCAT(JSON_OBJECT("subs_id", a.id, "subs", a.subs, "subsExpired", a.EXPIRED, "mute", a.mute, "created_at", a.CREATED_AT, "price", IFNULL(d.bill_total, 0))), "]") AS detail,
    b.total_score,
    IF ( b.image IS NOT NULL AND b.image != "", CONCAT('https://staticdev.tradersfamily.id/', b.image), NULL) AS avatar
  FROM dsc_subs a
	INNER JOIN dsc_channels b ON a.channel_id = b.id AND b.user_id != ?
	LEFT JOIN dsc_payment d ON a.paid = d.bill_no
	LEFT JOIN dsc_subs_details e ON e.subs_id = a.id AND e.symbol = 'ALL'
	LEFT JOIN (
		SELECT a.subs_id, GROUP_CONCAT(a.symbol SEPARATOR ",") AS symbol
		FROM dsc_subs_details a
		WHERE a.symbol != 'ALL'
		GROUP BY a.subs_id
	) AS tsub ON tsub.subs_id = a.id
	LEFT JOIN dsc_channels_rank cr ON cr.channel_id = a.channel_id
  WHERE
    a.user_id = ?
  GROUP BY
    a.channel_id,
    IFNULL(e.symbol, tsub.symbol)
`;

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
      const rows = await conn.query(SUBS_QUERY, [crm.ims_id, crm.ims_id]);
      if (rows.length > 0) {
        results.push({
          crm_id:        crm.crm_id,
          ims_id:        crm.ims_id,
          codename:      crm.codename,
          subscriptions: rows.map(r => ({
            id:                r.id,
            channel_id:        r.channel_id,
            channel_price:     r.channel_price,
            subsDate:          r.subsDate,
            subsExpired:       r.subsExpired,
            paid:              r.paid,
            title:             r.title,
            rank:              r.rank,
            symbol:            r.symbol,
            medals:            r.medals,
            total_active_subs: r.total_active_subs,
            own:               r.own,
            suspend:           r.suspend,
            detail:            r.detail,
            total_score:       r.total_score,
            avatar:            r.avatar,
          })),
        });
      }
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
  const outFile = path.join(outputDir, `subs_${String(batchIndex).padStart(4, '0')}.json`);
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
# case 2: 
# analis NON trading | db: mainmeta2
SELECT a.crm_id, a.ims_id, brokers.codename FROM srcims a
INNER JOIN brokers ON a.source = brokers.id
LEFT JOIN brokers parent ON brokers.parent_id = parent.id
WHERE email_ver = 1 AND a.id IN(SELECT srcims_id FROM srcims_deposit WHERE srcims_id IS NOT NULL GROUP BY srcims_id)

# find free + paid sub setiap user | db: tf2
SELECT
	max(a.id) AS id,
	a.channel_id,
	b.price AS channel_price,
	CASE
		WHEN COUNT(a.id) < 2
		AND TIMESTAMPDIFF (SECOND, MIN(a.CREATED_AT), MAX(a.EXPIRED)) > 2591999 THEN DATE_ADD(DATE_ADD(MAX(a.EXPIRED), INTERVAL -30 DAY), INTERVAL 1 SECOND)
		ELSE DATE_ADD(DATE_ADD(MIN(a.EXPIRED), INTERVAL -30 DAY), INTERVAL 1 SECOND)
	END AS subsDate,
	MAX(a.EXPIRED) AS subsExpired,
	a.paid,
	b.title,
	IFNULL(cr.rank, 0) AS `rank`,
	IFNULL(e.symbol, tsub.symbol) AS symbol,
	b.medals,
	b.total_active_subs,
	(a.user_id = b.user_id) AS own,
	IF (
		cr.rank = 10
		AND cr.pips_settled < cr.pips_treshold,
		1,
		0
	) AS suspend,
	CONCAT("[", GROUP_CONCAT(JSON_OBJECT("subs_id", a.id, "subs", a.subs, "subsExpired", a.EXPIRED, "mute", a.mute, "created_at", a.CREATED_AT, "price", IFNULL(d.bill_total, 0))), "]") AS detail,
	b.total_score,
	IF (
		b.image IS NOT NULL
		AND b.image != "",
		CONCAT('https://staticdev.tradersfamily.id/', b.image),
		NULL
	) AS avatar
FROM
	dsc_subs a
	INNER JOIN dsc_channels b ON a.channel_id = b.id AND b.user_id != ? -- bukann chanel dia sendiri
	LEFT JOIN dsc_payment d ON a.paid = d.bill_no
	LEFT JOIN dsc_subs_details e ON e.subs_id = a.id
	AND e.symbol = 'ALL'
	LEFT JOIN (
		SELECT
			a.subs_id,
			GROUP_CONCAT(a.symbol SEPARATOR ",") AS symbol
		FROM
			dsc_subs_details a
		WHERE
			a.symbol != 'ALL'
		GROUP BY
			a.subs_id
	) AS tsub ON tsub.subs_id = a.id
	LEFT JOIN dsc_channels_rank cr ON cr.channel_id = a.channel_id
WHERE
	a.user_id = ? -- seuai dengan user itu sendiri
	-- AND b.banned = 0
	AND a.EXPIRED > UTC_TIMESTAMP
GROUP BY
	a.channel_id,
	IFNULL(e.symbol, tsub.symbol)
HAVING
	subsExpired > UTC_TIMESTAMP ()

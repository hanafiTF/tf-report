-- user TF
SELECT a.crm_id, a.ims_id, MIN(sd.created_at) as investor_date
FROM srcims a 
INNER JOIN brokers ON a.source = brokers.id
INNER JOIN srcims_deposit sd ON a.ims_id = sd.ims_id
WHERE a.`source` NOT IN (2,3)
GROUP BY a.crm_id, a.ims_id

-- cek apakah orang terbut punya channel yang di telantarkan
SELECT 
    dc.user_id, 
    dc.id, 
    dc.title, 
    dc.banned, 
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
INNER JOIN dsc_signals ds ON dc.id = ds.channel_id
WHERE dc.user_id = 628964
GROUP BY 
    dc.user_id, 
    dc.id, 
    dc.title, 
    dc.banned;

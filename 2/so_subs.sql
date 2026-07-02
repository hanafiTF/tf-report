WITH analist AS (
    SELECT u.id
    FROM users u
    LEFT JOIN affiliate_mrg mrg ON u.id = mrg.userid
    LEFT JOIN affiliate_mrg_users_stats affMrg ON mrg.mrgid = affMrg.mrg_id
    WHERE affMrg.last_trade IS NULL 
      AND u.id IN (SELECT dc.user_id FROM dsc_channels dc)
)
SELECT COUNT(a.id) AS analist_tidak_aktif_no_subs
FROM analist a 
WHERE a.id NOT IN (SELECT ds.user_id FROM dsc_subs ds WHERE ds.user_id IS NOT NULL);

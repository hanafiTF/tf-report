WITH analist AS (
    SELECT
        dc.id AS channel_id,
        dc.title AS channel_name,
--         dc.price as channel_price,
        dsu.user_id AS customer_id,
        u.fullname AS customer_name,
        dsu.CREATED_AT AS sub_created_at,
        dsu.EXPIRED AS sub_expired,
        ROW_NUMBER() OVER (
            PARTITION BY dsu.user_id, dsu.channel_id
            ORDER BY dsu.CREATED_AT DESC
        ) AS rn,
        IFNULL(CONVERT_TZ(affMrg.last_trade, '+00:00', '+07:00'), '') AS last_trade_jakarta
    FROM dsc_subs dsu
    INNER JOIN dsc_channels dc ON dsu.channel_id = dc.id
    INNER JOIN users u ON dsu.user_id = u.id
    LEFT JOIN affiliate_mrg mrg ON u.id = mrg.userid
    LEFT JOIN affiliate_mrg_users_stats affMrg ON mrg.mrgid = affMrg.mrg_id
    WHERE affMrg.last_trade IS NULL -- analist tidak aktif
    	AND dsu.paid = 0 -- free
        AND EXISTS ( 
            SELECT 1
            FROM dsc_channels dc_owned
            WHERE dc_owned.user_id = dsu.user_id
        )
   )
   
SELECT COUNT(DISTINCT channel_id) as total_analyst from analist
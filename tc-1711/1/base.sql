WITH paid_subs AS (
    -- PAID SUBS
    SELECT
        dc.id AS channel_id,
        dc.title AS channel_name,
--         dc.price as channel_price,
        dp.cust_no AS customer_id,
        dp.cust_name AS customer_name,
        dsu.CREATED_AT AS sub_created_at,
        dsu.EXPIRED AS sub_expired,
        ROW_NUMBER() OVER (
            PARTITION BY dp.cust_no, dsu.channel_id
            ORDER BY dsu.CREATED_AT DESC
        ) AS rn,
        IFNULL(CONVERT_TZ(mrg.last_trade, '+00:00', '+07:00'), '') AS last_trade_jakarta
    FROM dsc_subs dsu
    INNER JOIN dsc_channels dc ON dsu.channel_id = dc.id
    INNER JOIN dsc_payment dp ON dsu.paid = dp.bill_no
    INNER JOIN dsc_subs_details dsd ON dsd.subs_id = dsu.id
    LEFT JOIN affiliate_mrg_users_stats mrg ON dsu.user_id = mrg.mrg_id
    WHERE dc.price != 0
   )
   
SELECT ps.customer_id, ps.customer_name, JSON_ARRAYAGG(
        JSON_OBJECT(
            'channel_id', ps.channel_id,
            'channel_name', ps.channel_name,
            'sub_created_at', ps.sub_created_at,
            'sub_expired', ps.sub_expired
        )
    ) AS list_channels,
    ps.last_trade_jakarta
FROM paid_subs ps
WHERE ps.rn = 1
GROUP BY ps.customer_id, ps.customer_name
WITH free_subs AS (
	 SELECT
        dc.id AS channel_id,
        dc.title AS channel_name,
--         dc.price as channel_price,
        u.id AS customer_id,
        u.fullname AS customer_name,
        dsu.CREATED_AT AS sub_created_at,
        dsu.EXPIRED AS sub_expired,
        ROW_NUMBER() OVER (
            PARTITION BY dsu.user_id, dsu.channel_id
            ORDER BY dsu.CREATED_AT DESC
        ) AS rn,
    	IFNULL(CONVERT_TZ(mrg.last_trade, '+00:00', '+07:00'), '') AS last_trade_jakarta
    FROM dsc_subs dsu
    INNER JOIN dsc_channels dc ON dsu.channel_id = dc.id
    INNER JOIN users u ON dsu.user_id = u.id
    LEFT JOIN affiliate_mrg_users_stats mrg ON dsu.user_id = mrg.mrg_id
    WHERE dc.price = 0
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
FROM free_subs ps
WHERE ps.rn =1
GROUP BY ps.customer_id, ps.customer_name
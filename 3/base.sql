SELECT 
	    dc.user_id, 
	    dc.id, 
	    dc.title, 
	    dc.banned, 
	    CASE 
	        WHEN dc.last_post IS NOT NULL 
	        THEN dc.last_post
	        ELSE NULL 
	    END AS last_post,
	    -- logika berapa bulan ini channel
	    CASE 
	        WHEN dc.last_post IS NOT NULL 
	        THEN DATEDIFF(dc.last_post, FROM_UNIXTIME(dc.created_time))
	        ELSE NULL 
    	END AS diff_day,
	    de.prev_channel_medal,
	    mrg.mrgid as mrg_id,
-- 	   	askap.askapid as askap_id
	FROM dsc_channels dc 
	INNER JOIN dsc_signals ds ON dc.id = ds.channel_id
	INNER JOIN dsc_channels_point_events de ON dc.id = de.channel_id AND dc.last_post BETWEEN de.utc_start AND de.utc_end
	LEFT JOIN affiliate_mrg mrg ON dc.user_id = mrg.userid
	LEFT JOIN affiliate_askap askap ON dc.user_id = askap.userid
	GROUP BY 
	    dc.user_id, 
	    dc.id, 
	    dc.title, 
	    dc.banned,
	    dc.last_post,
	    diff_day,
	    de.prev_channel_medal,
	    mrg.mrgid,
	    askap.askapid
SELECT user_id, nominal
FROM deposit
WHERE user_id IN(91352,91360)
GROUP BY user_id
CREATE TEMP TABLE tmp_customers (
    email VARCHAR(150),
    full_name VARCHAR(150),
    city VARCHAR(150)
);

\copy tmp_customers FROM '/seed/customers.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO customers (email, full_name, city)
SELECT DISTINCT ON (email) email, full_name, city
FROM tmp_customers
ORDER BY email
ON CONFLICT (email) DO NOTHING;
CREATE TEMP TABLE tmp_orders (
    order_ref VARCHAR(150),
    customer_email VARCHAR(150),
    status VARCHAR(150),
    created_at TIMESTAMPTZ
);

\copy tmp_orders FROM '/seed/orders.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO orders (order_ref, customer_email, status, created_at)
SELECT DISTINCT ON (order_ref) order_ref, customer_email,status, created_at
FROM tmp_orders t
WHERE EXISTS (SELECT 1 FROM customers c WHERE c.email = t.customer_email) 
ORDER BY t.order_ref
ON CONFLICT (order_ref) DO NOTHING;
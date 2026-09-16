CREATE TEMP TABLE tmp_orders (
    order_ref VARCHAR(50),
    customer_email VARCHAR(150),
    status VARCHAR(150),
    created_at TIMESTAMPTZ
);

\copy tmp_orders FROM '/seed/orders.csv' WITH (FORMAT csv, HEADER true);

-- Total de filas en el CSV
SELECT COUNT(*) AS total_csv FROM tmp_orders;

-- Órdenes con order_ref duplicado (filas extra por repetición)
SELECT COUNT(*) - COUNT(DISTINCT order_ref) AS duplicados_order_ref FROM tmp_orders;

-- Órdenes huérfanas: su customer_email no existe en customers
SELECT COUNT(*) AS huerfanas
FROM tmp_orders t
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.email = t.customer_email);
CREATE TEMP TABLE tmp_order_items (
    order_ref VARCHAR(50),
    sku VARCHAR(150),
    quantity INT,
    unit_price DECIMAL(10,2)
);

\copy tmp_order_items FROM '/seed/order_items.csv' WITH (FORMAT csv, HEADER true);

SELECT COUNT(*) AS total_csv FROM tmp_order_items;

-- Ítems cuya orden no existe
SELECT COUNT(*) AS sin_orden
FROM tmp_order_items t
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_ref = t.order_ref);

-- Ítems cuyo producto no existe
SELECT COUNT(*) AS sin_producto
FROM tmp_order_items t
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = t.sku);
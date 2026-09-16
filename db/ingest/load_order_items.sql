CREATE TEMP TABLE tmp_order_items (
    order_ref VARCHAR(150),
    sku VARCHAR(150),
    quantity INT,
    unit_price DECIMAL(10,2)
);

\copy tmp_order_items FROM '/seed/order_items.csv' WITH (FORMAT csv, HEADER true);
TRUNCATE order_items;

INSERT INTO order_items (order_ref, sku, quantity, unit_price)
SELECT t.order_ref, t.sku, t.quantity, t.unit_price
FROM tmp_order_items t
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.order_ref = t.order_ref) 
AND EXISTS (SELECT 1 FROM products p WHERE p.sku = t.sku);
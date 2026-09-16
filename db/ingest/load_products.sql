CREATE TEMP TABLE tmp_products (
    sku VARCHAR(150),
    name VARCHAR(150),
    price DECIMAL(10,2),
    stock INT
);

\copy tmp_products FROM '/seed/products.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO products (sku, name, price, stock)
SELECT DISTINCT ON (sku) sku, name, price, stock
FROM tmp_products
ORDER BY sku
ON CONFLICT (sku) DO NOTHING;
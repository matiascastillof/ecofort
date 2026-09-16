\echo 'Cargando customers...'
\i /ingest/load_customers.sql

\echo 'Cargando products...'
\i /ingest/load_products.sql

\echo 'Cargando orders...'
\i /ingest/load_orders.sql

\echo 'Cargando order_items...'
\i /ingest/load_order_items.sql

\echo 'Ingesta completada.'
SET lock_timeout = '3s';

ALTER TABLE orders
    ADD COLUMN channel VARCHAR(50) NOT NULL DEFAULT 'web';
CREATE TABLE order_items(
    id SERIAL PRIMARY KEY,
    order_ref VARCHAR(150) NOT NULL REFERENCES orders(order_ref),
    sku VARCHAR(150) NOT NULL REFERENCES products(sku),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL (10,2) NOT NULL CHECK (unit_price >= 0)
);
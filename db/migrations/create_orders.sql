CREATE TABLE orders(
    id SERIAL PRIMARY KEY,
    order_ref VARCHAR(50) NOT NULL UNIQUE, 
    customer_email VARCHAR(150) NOT NULL REFERENCES customers(email),
    status VARCHAR(150) NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL
);

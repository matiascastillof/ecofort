CREATE TABLE products(
    id SERIAL PRIMARY KEY,
    sku VARCHAR(150) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    price DECIMAL (10,2) NOT NULL CHECK (price >= 0),
    stock INT NOT NULL CHECK (stock >=0)
);
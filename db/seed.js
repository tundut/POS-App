const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL_LOCAL,
});

async function seedDB() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Insert sample products
    await client.query(`
      INSERT INTO products (name, price, description, category, stock) VALUES
      ('Laptop', 1500.00, 'High-performance laptop', 'Electronics', 10),
      ('Mouse', 25.00, 'Wireless mouse', 'Electronics', 50),
      ('Keyboard', 75.00, 'Mechanical keyboard', 'Electronics', 30),
      ('Monitor', 300.00, '27-inch monitor', 'Electronics', 15),
      ('Coffee Mug', 10.00, 'Ceramic coffee mug', 'Kitchen', 100);
    `);

    console.log('Sample data inserted');
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    await client.end();
  }
}

seedDB();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seedDB() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL_LOCAL,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    const hash = await bcrypt.hash('admin123', 10);

    // ── Tenant 1: TechMart ──
    const t1 = (await client.query(
      "INSERT INTO tenants(name, slug) VALUES('TechMart', 'techmart') RETURNING id"
    )).rows[0].id;

    await client.query(
      `INSERT INTO users(tenant_id, username, password, name, role) VALUES
        ($1, 'admin',    $2, 'John Admin',     'admin'),
        ($1, 'manager', $2, 'Sarah Manager',  'manager'),
        ($1, 'staff',   $2, 'Mike Cashier',   'staff')`,
      [t1, hash]
    );

    const cat1 = (await client.query(
      `INSERT INTO categories(tenant_id, name, description) VALUES
        ($1, 'Electronics',  'Electronic devices and gadgets'),
        ($1, 'Accessories',  'Computer and phone accessories'),
        ($1, 'Software',     'Software licenses and subscriptions')
       RETURNING id`, [t1]
    )).rows;

    await client.query(
      `INSERT INTO products(tenant_id, category_id, name, description, price, stock_quantity) VALUES
        ($1, $2, 'Laptop',       'High-performance laptop',       15000000, 10),
        ($1, $2, 'Desktop PC',   '27-inch all-in-one desktop',    12000000, 8),
        ($1, $3, 'Wireless Mouse','Ergonomic wireless mouse',       250000, 50),
        ($1, $3, 'Mech Keyboard','RGB mechanical keyboard',         750000, 30),
        ($1, $3, 'USB-C Hub',    '7-in-1 USB-C hub',               450000, 40),
        ($1, $4, 'Antivirus',    '1-year antivirus license',       300000, 999),
        ($1, $4, 'Office Suite', 'Productivity suite license',     120000, 999)`,
      [t1, cat1[0].id, cat1[1].id, cat1[2].id]
    );

    await client.query(
      `INSERT INTO customers(tenant_id, email, name) VALUES
        ($1, 'alice@example.com', 'Alice Johnson'),
        ($1, 'bob@example.com',   'Bob Smith')`, [t1]
    );

    // ── Tenant 2: CaféBrew ──
    const t2 = (await client.query(
      "INSERT INTO tenants(name, slug) VALUES('CaféBrew', 'cafebrew') RETURNING id"
    )).rows[0].id;

    await client.query(
      `INSERT INTO users(tenant_id, username, password, name, role) VALUES
        ($1, 'admin',      $2, 'Emma Admin',     'admin'),
        ($1, 'manager',$2, 'Liam Manager',   'manager'),
        ($1, 'staff',   $2, 'Olivia Barista',  'staff')`,
      [t2, hash]
    );

    const cat2 = (await client.query(
      `INSERT INTO categories(tenant_id, name, description) VALUES
        ($1, 'Hot Drinks',  'Coffee, tea and hot beverages'),
        ($1, 'Cold Drinks', 'Iced beverages and smoothies'),
        ($1, 'Pastries',    'Fresh baked goods')
       RETURNING id`, [t2]
    )).rows;

    await client.query(
      `INSERT INTO products(tenant_id, category_id, name, description, price, stock_quantity) VALUES
        ($1, $2, 'Espresso',       'Single shot espresso',     35000, 999),
        ($1, $2, 'Cappuccino',     'Classic cappuccino',       45000, 999),
        ($1, $2, 'Hot Chocolate',  'Rich hot chocolate',       40000, 999),
        ($1, $3, 'Iced Latte',     'Iced caffè latte',        50000, 999),
        ($1, $3, 'Smoothie',       'Mixed berry smoothie',     60000, 999),
        ($1, $4, 'Croissant',      'Butter croissant',         30000, 50),
        ($1, $4, 'Muffin',         'Blueberry muffin',         35000, 40)`,
      [t2, cat2[0].id, cat2[1].id, cat2[2].id]
    );

    await client.query(
      `INSERT INTO customers(tenant_id, email, name) VALUES
        ($1, 'charlie@example.com', 'Charlie Brown'),
        ($1, 'diana@example.com',   'Diana Prince')`, [t2]
    );

    console.log('Seed data inserted successfully');
    console.log('');
    console.log('Demo accounts (password for all: admin123):');
    console.log('─────────────────────────────────────────');
    console.log('TechMart  → admin / manager1 / staff1');
    console.log('CaféBrew  → admin / barista_mgr / barista1');
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    await client.end();
  }
}

seedDB();
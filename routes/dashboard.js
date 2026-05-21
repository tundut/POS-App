const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/dashboard — stats for current tenant
router.get('/', auth, async (req, res) => {
  const tid = req.tenantId;
  try {
    const [categories, products, customers, staff, managers, orders, revenue] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM categories WHERE tenant_id = $1', [tid]),
      db.query('SELECT COUNT(*)::int AS count FROM products WHERE tenant_id = $1', [tid]),
      db.query('SELECT COUNT(*)::int AS count FROM customers WHERE tenant_id = $1', [tid]),
      db.query("SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1 AND role = 'staff'", [tid]),
      db.query("SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1 AND role = 'manager'", [tid]),
      db.query('SELECT COUNT(*)::int AS count FROM orders WHERE tenant_id = $1', [tid]),
      db.query('SELECT COALESCE(SUM(total_amount), 0)::numeric AS total FROM orders WHERE tenant_id = $1 AND status = \'completed\'', [tid]),
    ]);

    res.json({
      categories: categories.rows[0].count,
      products: products.rows[0].count,
      customers: customers.rows[0].count,
      staff: staff.rows[0].count,
      managers: managers.rows[0].count,
      orders: orders.rows[0].count,
      revenue: parseFloat(revenue.rows[0].total),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

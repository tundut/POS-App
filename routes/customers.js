const express = require('express');
const db = require('../db');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();

// GET all customers for tenant
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM customers WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name', [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create customer
router.post('/', auth, async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ message: 'Email and name are required' });

  try {
    const result = await db.query(
      'INSERT INTO customers(tenant_id, email, name) VALUES($1, $2, $3) RETURNING *',
      [req.tenantId, email, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Customer email already exists' });
    res.status(400).json({ message: err.message });
  }
});

// PUT update customer
router.put('/:id', auth, async (req, res) => {
  const { email, name } = req.body;
  try {
    const result = await db.query(
      'UPDATE customers SET email = COALESCE($1, email), name = COALESCE($2, name) WHERE id = $3 AND tenant_id = $4 AND deleted_at IS NULL RETURNING *',
      [email, name, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE customer
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE customers SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

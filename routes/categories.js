const express = require('express');
const db = require('../db');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();

// GET all categories for tenant
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM categories WHERE tenant_id = $1 ORDER BY name', [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create category (admin, manager)
router.post('/', auth, authorize('admin', 'manager'), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Category name is required' });

  try {
    const result = await db.query(
      'INSERT INTO categories(tenant_id, name, description) VALUES($1, $2, $3) RETURNING *',
      [req.tenantId, name, description || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update category
router.put('/:id', auth, authorize('admin', 'manager'), async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await db.query(
      'UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 AND tenant_id = $4 RETURNING *',
      [name, description, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Category not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE category
router.delete('/:id', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM categories WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

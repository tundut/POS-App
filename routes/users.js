const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();

// GET all users for tenant (filtered by optional role query param)
router.get('/', auth, authorize('admin'), async (req, res) => {
  const { role } = req.query;
  try {
    let query = 'SELECT id, tenant_id, username, name, role, created_at FROM users WHERE tenant_id = $1 AND deleted_at IS NULL';
    const params = [req.tenantId];

    if (role) {
      query += ' AND role = $2';
      params.push(role);
    }
    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create user (admin only)
router.post('/', auth, authorize('admin'), async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!['staff', 'manager', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users(tenant_id, username, password, name, role) VALUES($1, $2, $3, $4, $5) RETURNING id, tenant_id, username, name, role, created_at',
      [req.tenantId, username, hashedPassword, name, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Username already exists in this store' });
    res.status(400).json({ message: err.message });
  }
});

// PUT update user (admin only)
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  const { username, name, role, password } = req.body;
  if (role && !['staff', 'manager', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    let query = 'UPDATE users SET username = COALESCE($1, username), name = COALESCE($2, name), role = COALESCE($3, role)';
    let params = [username, name, role];
    let paramIndex = 4;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += `, password = $${paramIndex}`;
      params.push(hashedPassword);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} RETURNING id, tenant_id, username, name, role, created_at`;
    params.push(req.params.id, req.tenantId);

    const result = await db.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Username already exists' });
    res.status(400).json({ message: err.message });
  }
});

// DELETE user (admin only, cannot delete self)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ message: 'Cannot delete your own account' });
  }
  try {
    const result = await db.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING id, username, name, role',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
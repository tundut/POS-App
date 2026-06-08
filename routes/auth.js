const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

const signToken = (user, tenant) => {
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id, username: user.username, name: user.name, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '24h' }
  );
};

// Register new tenant + admin user
router.post('/register', async (req, res) => {
  const { storeName, username, password, name } = req.body;
  if (!storeName || !username || !password || !name) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    const tenantResult = await client.query(
      'INSERT INTO tenants(name, slug) VALUES($1, $2) RETURNING *',
      [storeName, slug]
    );
    const tenant = tenantResult.rows[0];

    const hashedPassword = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      'INSERT INTO users(tenant_id, username, password, name, role) VALUES($1, $2, $3, $4, $5) RETURNING id, tenant_id, username, name, role',
      [tenant.id, username, hashedPassword, name, 'admin']
    );
    const user = userResult.rows[0];

    await client.query('COMMIT');
    const token = signToken(user, tenant);

    res.status(201).json({
      token,
      user: { id: user.id, tenant_id: user.tenant_id, username: user.username, name: user.name, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).json({ message: 'Store name already exists. Please choose a different name.' });
    }
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// Login
router.post('/login', async (req, res) => {
  const { storeName, username, password } = req.body;
  if (!storeName || !username || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const tenantResult = await db.query('SELECT * FROM tenants WHERE slug = $1', [slug]);
    if (tenantResult.rows.length === 0) {
      return res.status(401).json({ message: 'Store not found' });
    }
    const tenant = tenantResult.rows[0];

    const userResult = await db.query(
      'SELECT * FROM users WHERE tenant_id = $1 AND username = $2 AND deleted_at IS NULL',
      [tenant.id, username]
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const user = userResult.rows[0];

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken(user, tenant);
    res.json({
      token,
      user: { id: user.id, tenant_id: user.tenant_id, username: user.username, name: user.name, role: user.role },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

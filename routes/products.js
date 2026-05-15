const express = require('express');
const db = require('../db');
const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add product
router.post('/', async (req, res) => {
  const { name, price, description, category, stock } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO products(name, price, description, category, stock) VALUES($1, $2, $3, $4, $5) RETURNING *',
      [name, price, description || '', category || '', stock || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
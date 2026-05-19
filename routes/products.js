const express = require('express');
const db = require('../db');
const { auth, authorize } = require('../middleware/auth');
const multer = require('multer');
const { uploadBufferToS3 } = require('../utils/s3Service');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// GET all products for tenant (with category name)
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.tenant_id = $1
       ORDER BY p.name`, [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create product (admin, manager)
router.post('/', auth, authorize('admin', 'manager'), upload.single('image'), async (req, res) => {
  const { name, description, price, stock_quantity, category_id } = req.body;
  let image_url = null;

  if (!name || price == null) return res.status(400).json({ message: 'Name and price are required' });

  try {
    if (req.file) {
      const fileName = `products/${req.tenantId}-${Date.now()}-${req.file.originalname}`;
      image_url = await uploadBufferToS3(req.file.buffer, fileName, req.file.mimetype);
    }

    const result = await db.query(
      `INSERT INTO products(tenant_id, category_id, name, description, price, stock_quantity, image_url)
       VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.tenantId, category_id || null, name, description || '', price, stock_quantity || 0, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update product
router.put('/:id', auth, authorize('admin', 'manager'), upload.single('image'), async (req, res) => {
  const { name, description, price, stock_quantity, category_id } = req.body;
  let image_url = undefined; // undefined ensures COALESCE ignores it if no new image is provided

  try {
    if (req.file) {
      const fileName = `products/${req.tenantId}-${Date.now()}-${req.file.originalname}`;
      image_url = await uploadBufferToS3(req.file.buffer, fileName, req.file.mimetype);
    }

    const result = await db.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         stock_quantity = COALESCE($4, stock_quantity),
         category_id = COALESCE($5, category_id),
         image_url = COALESCE($6, image_url)
       WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [name, description, price, stock_quantity, category_id, image_url, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE product
router.delete('/:id', auth, authorize('admin', 'manager'), async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM products WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
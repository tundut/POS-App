const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { sendReceiptEmail } = require('../utils/email');
const router = express.Router();

// GET all orders for tenant
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.*, u.name AS cashier_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       WHERE o.tenant_id = $1
       ORDER BY o.created_at DESC`,
      [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single order with items
router.get('/:id', auth, async (req, res) => {
  try {
    const orderResult = await db.query(
      `SELECT o.*, u.name AS cashier_name, t.name AS store_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.cashier_id
       LEFT JOIN tenants t ON t.id = o.tenant_id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ message: 'Order not found' });

    const itemsResult = await db.query(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [req.params.id]
    );

    const paymentResult = await db.query(
      'SELECT * FROM payments WHERE order_id = $1', [req.params.id]
    );

    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows,
      payment: paymentResult.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create order
router.post('/', auth, async (req, res) => {
  const { items, customer_email, payment_method } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one item is required' });
  }
  if (!customer_email) {
    return res.status(400).json({ message: 'Customer email is required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch product info and verify they belong to this tenant
    const productIds = items.map(i => i.product_id);
    const productsResult = await client.query(
      'SELECT id, name, price FROM products WHERE id = ANY($1) AND tenant_id = $2',
      [productIds, req.tenantId]
    );
    const productMap = {};
    productsResult.rows.forEach(p => { productMap[p.id] = p; });

    // Build order items with subtotals
    let totalAmount = 0;
    const orderItems = items.map(item => {
      const product = productMap[item.product_id];
      if (!product) throw new Error(`Product ${item.product_id} not found`);
      const qty = item.quantity || 1;
      const price = parseFloat(product.price);
      const subtotal = price * qty;
      totalAmount += subtotal;
      return { product_id: product.id, product_name: product.name, product_price: price, quantity: qty, subtotal };
    });

    // Create order — VNPay orders start as 'pending', cash/card are 'completed' immediately
    const isVnpay = payment_method === 'vnpay';
    const orderStatus = isVnpay ? 'pending' : 'completed';
    const paymentStatus = isVnpay ? 'pending' : 'completed';

    const orderResult = await client.query(
      `INSERT INTO orders(tenant_id, cashier_id, customer_email, total_amount, status)
       VALUES($1, $2, $3, $4, $5) RETURNING *`,
      [req.tenantId, req.user.id, customer_email, totalAmount, orderStatus]
    );
    const order = orderResult.rows[0];

    // Insert order items and update stock
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items(order_id, product_id, product_name, product_price, quantity, subtotal)
         VALUES($1, $2, $3, $4, $5, $6)`,
        [order.id, item.product_id, item.product_name, item.product_price, item.quantity, item.subtotal]
      );

      // Only update product stock quantity immediately if not vnpay
      if (!isVnpay) {
        await client.query(
          `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND tenant_id = $3`,
          [item.quantity, item.product_id, req.tenantId]
        );
      }
    }

    // Create payment record
    const txRef = isVnpay ? null : 'CASH-' + Date.now();
    await client.query(
      `INSERT INTO payments(tenant_id, order_id, method, amount, transaction_ref, status)
       VALUES($1, $2, $3, $4, $5, $6)`,
      [req.tenantId, order.id, payment_method || 'cash', totalAmount, txRef, paymentStatus]
    );

    // Auto-create customer if not exists
    await client.query(
      `INSERT INTO customers(tenant_id, email, name) VALUES($1, $2, $3) ON CONFLICT (tenant_id, email) DO NOTHING`,
      [req.tenantId, customer_email, customer_email.split('@')[0]]
    );

    await client.query('COMMIT');

    // Only send email immediately for non-VNPay payments (VNPay sends after return/IPN)
    if (!isVnpay) {
      const tenantResult = await db.query('SELECT name FROM tenants WHERE id = $1', [req.tenantId]);
      const storeName = tenantResult.rows[0]?.name || 'POS Store';
      sendReceiptEmail({ to: customer_email, storeName, order, items: orderItems })
        .catch(err => console.error('Email send error:', err.message));
    }

    res.status(201).json({ ...order, items: orderItems });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
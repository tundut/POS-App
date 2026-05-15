const express = require('express');
const db = require('../db');
const { auth, authorizeRole } = require('../middleware/auth');
const { sendInvoiceEmail } = require('../utils/email');
const router = express.Router();

// // Get orders for user
// router.get('/:userId', auth, async (req, res) => {
//   try {
//     const result = await db.query(
//       `SELECT o.id AS order_id, o.total, o.status, o.payment_id, oi.product_id, oi.quantity,
//         p.name AS product_name, p.price AS product_price, p.description AS product_description
//        FROM orders o
//        JOIN order_items oi ON oi.order_id = o.id
//        JOIN products p ON p.id = oi.product_id
//        WHERE o.user_id = $1
//        ORDER BY o.id, oi.id`,
//       [req.params.userId]
//     );

//     const orders = [];
//     const map = {};
//     result.rows.forEach(row => {
//       if (!map[row.order_id]) {
//         map[row.order_id] = {
//           id: row.order_id,
//           total: row.total,
//           status: row.status,
//           paymentId: row.payment_id,
//           products: []
//         };
//         orders.push(map[row.order_id]);
//       }
//       map[row.order_id].products.push({
//         productId: row.product_id,
//         name: row.product_name,
//         price: row.product_price,
//         description: row.product_description,
//         quantity: row.quantity
//       });
//     });

//     res.json(orders);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// });

// Create order
router.post('/', auth, authorizeRole('admin', 'employee'), async (req, res) => {
  const { customerEmail, userId, products } = req.body;
  if (!customerEmail || typeof customerEmail !== 'string') {
    return res.status(400).json({ message: 'Customer email is required' });
  }
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ message: 'At least one product is required' });
  }

  const client = await db.pool.connect();
  try {
    const productIds = products.map(p => p.product);
    const productRows = await client.query(
      'SELECT id, name, price, description FROM products WHERE id = ANY($1)',
      [productIds]
    );

    const productMap = productRows.rows.reduce((acc, row) => {
      acc[row.id] = {
        id: row.id,
        name: row.name,
        price: Number(row.price),
        description: row.description
      };
      return acc;
    }, {});

    let total = 0;
    const invoiceItems = products.map(item => {
      const product = productMap[item.product];
      const quantity = item.quantity || 1;
      const price = product ? product.price : 0;
      total += price * quantity;
      return {
        productId: item.product,
        name: product?.name || 'Unknown product',
        price,
        quantity
      };
    });

    await client.query('BEGIN');
    const orderResult = await client.query(
      'INSERT INTO orders(user_id, total, status, payment_id) VALUES($1, $2, $3, $4) RETURNING *',
      [userId || null, total, 'pending', null]
    );

    const orderId = orderResult.rows[0].id;
    for (const item of invoiceItems) {
      await client.query(
        'INSERT INTO order_items(order_id, product_id, quantity) VALUES($1, $2, $3)',
        [orderId, item.productId, item.quantity]
      );
    }

    await sendInvoiceEmail({
      to: customerEmail,
      order: orderResult.rows[0],
      products: invoiceItems
    });

    await client.query('COMMIT');
    res.status(201).json(orderResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
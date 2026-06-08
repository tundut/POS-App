const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database
const db = require('./db');
db.pool.connect()
  .then(() => console.log('PostgreSQL connected'))
  .catch(err => console.error('PostgreSQL connection error:', err.message));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/users', require('./routes/users'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payment', require('./routes/payment'));

// Health check path 
app.get('/health', (req, res) => { 
  res.status(200).send('OK'); 
});

// SPA fallback — serve dashboard for authenticated routes\
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Background job to fail pending orders older than 15 minutes
setInterval(async () => {
  try {
    const result = await db.query(`
      UPDATE orders 
      SET status = 'failed' 
      WHERE status = 'pending' 
        AND created_at < NOW() - INTERVAL '15 minutes'
      RETURNING id
    `);
    
    if (result.rows.length > 0) {
      const orderIds = result.rows.map(r => r.id);
      await db.query(`
        UPDATE payments 
        SET status = 'failed' 
        WHERE order_id = ANY($1) AND status = 'pending'
      `, [orderIds]);
      console.log(`Failed ${orderIds.length} pending orders (timeout > 15m)`);
    }
  } catch (err) {
    console.error('Error auto-failing pending orders:', err.message);
  }
}, 60 * 1000); // Check every minute

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
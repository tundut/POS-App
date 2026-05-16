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

// SPA fallback — serve dashboard for authenticated routes
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
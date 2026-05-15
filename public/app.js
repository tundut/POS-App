// Cart functionality
let cart = JSON.parse(localStorage.getItem('cart')) || [];

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function addToCart(productId) {
  cart.push(productId);
  localStorage.setItem('cart', JSON.stringify(cart));
  alert('Added to cart');
}

async function checkout() {
  // Assume user is logged in
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) {
    window.location = 'login.html';
    return;
  }
  const customerEmail = document.getElementById('customerEmail')?.value.trim();
  if (!customerEmail) {
    alert('Please enter the customer email address.');
    return;
  }
  // Get products to calculate total
  const productsRes = await fetch('/api/products');
  const products = await productsRes.json();
  const productMap = products.reduce((map, p) => { map[p.id] = p; return map; }, {});
  let total = 0;
  const orderProducts = cart.map(id => {
    const product = productMap[id];
    if (product) {
      total += parseFloat(product.price);
      return { product: id, quantity: 1 };
    }
  }).filter(Boolean);

  if (orderProducts.length === 0) {
    alert('Cart is empty');
    return;
  }

  // Create order
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ customerEmail, userId: user.id, products: orderProducts })
  });
  const order = await res.json();
  if (res.ok) {
    // Create payment
    const payRes = await fetch('/api/payment/create', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ amount: total, orderId: order.id, orderInfo: 'POS_Order' })
    });
    const data = await payRes.json();
    if (payRes.ok) {
      window.open(data.paymentUrl, "_blank");
    } else {
      alert('Payment creation failed');
    }
  } else {
    alert('Order creation failed');
  }
}
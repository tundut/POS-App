// ═══════════════════════════════════════════════
//  POS SaaS — Single Page Application Logic
// ═══════════════════════════════════════════════

// ── STATE ──
const state = {
  token: localStorage.getItem('pos_token'),
  user: JSON.parse(localStorage.getItem('pos_user') || 'null'),
  tenant: JSON.parse(localStorage.getItem('pos_tenant') || 'null'),
  currentPage: 'dashboard',
  cart: [],
};

// ── AUTH CHECK ──
if (!state.token || !state.user) {
  window.location.href = '/';
}

// ── HELPERS ──
function $(id) { return document.getElementById(id); }

async function api(path, opts = {}) {
  const isFormData = opts.body instanceof FormData;
  const headers = { 'Authorization': 'Bearer ' + state.token, ...opts.headers };
  if (!isFormData && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const res = await fetch('/api' + path, {
    ...opts,
    headers,
    body: isFormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); return; }
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function toast(msg, type = 'success') {
  const c = $('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function showModal(html) {
  const m = $('modalOverlay');
  m.innerHTML = '<div class="modal">' + html + '</div>';
  m.classList.remove('hidden');
}
function hideModal() { $('modalOverlay').classList.add('hidden'); }

function logout() {
  localStorage.removeItem('pos_token');
  localStorage.removeItem('pos_user');
  localStorage.removeItem('pos_tenant');
  window.location.href = '/';
}

function formatCurrency(v) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(v);
}
function formatDate(d) { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function roleBadge(role) {
  const colors = { admin: 'danger', manager: 'warning', staff: 'info' };
  return '<span class="badge badge-' + (colors[role] || 'info') + '">' + role + '</span>';
}

// ── INIT ──
function init() {
  $('tenantName').textContent = state.tenant?.name || '';
  $('userName').textContent = state.user?.name || '';
  $('userRole').textContent = state.user?.role || '';
  $('userAvatar').textContent = (state.user?.name || 'U')[0].toUpperCase();

  if (state.user?.role === 'admin') {
    $('adminSection').style.display = '';
    $('navStaff').style.display = '';
    $('navManagers').style.display = '';
    $('navAdmins').style.display = '';
  }
  navigate('dashboard');
}

// ── NAVIGATION & SIDEBAR ──
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  }
}

function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Close sidebar on mobile after navigation
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  }

  const renderers = { dashboard: renderDashboard, pos: renderPOS, orders: renderOrders, categories: renderCategories, products: renderProducts, customers: renderCustomers, staff: () => renderUsers('staff'), managers: () => renderUsers('manager'), admins: () => renderUsers('admin') };
  (renderers[page] || renderDashboard)();
}

// ═══════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════
async function renderDashboard() {
  $('pageContent').innerHTML = '<div class="page-header"><div><h1>Dashboard</h1><p>Welcome back, ' + state.user.name + '</p></div></div><div class="stats-grid" id="statsGrid"><p style="color:var(--text-muted)">Loading...</p></div>';
  try {
    const s = await api('/dashboard');
    $('statsGrid').innerHTML = `
      <div class="stat-card"><div class="stat-icon">📁</div><div class="stat-value">${s.categories}</div><div class="stat-label">Categories</div></div>
      <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-value">${s.products}</div><div class="stat-label">Products</div></div>
      <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value">${s.orders}</div><div class="stat-label">Orders</div></div>
      <div class="stat-card"><div class="stat-icon">👤</div><div class="stat-value">${s.staff}</div><div class="stat-label">Staff</div></div>
      <div class="stat-card"><div class="stat-icon">👔</div><div class="stat-value">${s.managers}</div><div class="stat-label">Managers</div></div>
      <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${s.customers}</div><div class="stat-label">Customers</div></div>
      <div class="stat-card stat-full-width"><div class="stat-icon">💰</div><div class="stat-value">${formatCurrency(s.revenue)}</div><div class="stat-label">Total Revenue</div></div>`;
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════
//  POS — CREATE ORDER
// ═══════════════════════════════════════
async function renderPOS() {
  state.cart = [];
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h1>Create Order</h1><p>Select products and complete the sale</p></div></div>
    <div class="pos-layout">
      <div class="pos-products">
        <div class="search-bar"><input type="text" id="posSearch" placeholder="Search products..." oninput="filterPOSProducts()"></div>
        <div class="product-grid" id="posProductGrid"><p style="color:var(--text-muted)">Loading...</p></div>
      </div>
      <div class="pos-cart">
        <div class="pos-cart-header">🛒 Cart</div>
        <div class="pos-cart-items" id="posCartItems"><div class="empty-state"><div class="empty-icon">🛒</div><p>Cart is empty</p></div></div>
        <div class="pos-cart-footer">
          <div class="cart-total"><span>Total</span><span class="total-amount" id="cartTotal">0 ₫</span></div>
          <div class="form-group"><label>Customer Email</label><input type="email" id="posEmail" placeholder="customer@example.com"></div>
          <div class="form-group"><label>Payment Method</label><select id="posPayment"><option value="cash">💵 Cash</option><option value="vnpay">💳 VNPay</option></select></div>
          <button class="btn btn-success btn-block" onclick="submitOrder()">✓ Complete Order</button>
        </div>
      </div>
    </div>`;
  try {
    const products = await api('/products');
    window._posProducts = products;
    renderPOSProductGrid(products);
  } catch (e) { toast(e.message, 'error'); }
}

function renderPOSProductGrid(products) {
  $('posProductGrid').innerHTML = products.length === 0 ? '<div class="empty-state"><p>No products available</p></div>' :
    products.map(p => `<div class="product-card" onclick='addToCart(${JSON.stringify({ id: p.id, name: p.name, price: parseFloat(p.price) })})'>
      ${p.image_url ? `<div class="p-image" style="margin-bottom:8px;"><img src="${p.image_url}" alt="${p.name.replace(/"/g, '&quot;')}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; background:var(--bg-input);"></div>` : ''}
      <div class="p-name">${p.name}</div>
      <div class="p-price">${formatCurrency(p.price)}</div>
      <div class="p-cat">${p.category_name || 'Uncategorized'}</div>
    </div>`).join('');
}

function filterPOSProducts() {
  const q = $('posSearch').value.toLowerCase();
  const filtered = (window._posProducts || []).filter(p => p.name.toLowerCase().includes(q) || (p.category_name || '').toLowerCase().includes(q));
  renderPOSProductGrid(filtered);
}

function addToCart(product) {
  const existing = state.cart.find(i => i.id === product.id);
  if (existing) { existing.quantity++; existing.subtotal = existing.price * existing.quantity; }
  else { state.cart.push({ ...product, quantity: 1, subtotal: product.price }); }
  renderCartItems();
}

function updateCartQty(id, delta) {
  const item = state.cart.find(i => i.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) { state.cart = state.cart.filter(i => i.id !== id); }
  else { item.subtotal = item.price * item.quantity; }
  renderCartItems();
}

function removeCartItem(id) {
  state.cart = state.cart.filter(i => i.id !== id);
  renderCartItems();
}

function renderCartItems() {
  const el = $('posCartItems');
  if (state.cart.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><p>Cart is empty</p></div>';
    $('cartTotal').textContent = '$0.00';
    return;
  }
  let total = 0;
  el.innerHTML = state.cart.map(i => {
    total += i.subtotal;
    return `<div class="cart-item">
      <div class="ci-info"><div class="ci-name">${i.name}</div><div class="ci-price">${formatCurrency(i.price)} each</div></div>
      <div class="ci-qty"><button onclick="updateCartQty(${i.id},-1)">−</button><span>${i.quantity}</span><button onclick="updateCartQty(${i.id},1)">+</button></div>
      <div class="ci-subtotal">${formatCurrency(i.subtotal)}</div>
      <button class="ci-remove" onclick="removeCartItem(${i.id})">✕</button>
    </div>`;
  }).join('');
  $('cartTotal').textContent = formatCurrency(total);
}

async function submitOrder() {
  if (state.cart.length === 0) return toast('Cart is empty', 'error');
  const email = $('posEmail').value.trim();
  if (!email) return toast('Enter customer email', 'error');
  const paymentMethod = $('posPayment').value;
  try {
    const order = await api('/orders', {
      method: 'POST', body: {
        items: state.cart.map(i => ({ product_id: i.id, quantity: i.quantity })),
        customer_email: email,
        payment_method: paymentMethod,
      }
    });

    if (paymentMethod === 'vnpay') {
      // Create VNPay payment URL and redirect
      toast('Order #' + order.id + ' created. Redirecting to VNPay...', 'info');
      try {
        const payData = await api('/payment/create', {
          method: 'POST', body: {
            orderId: order.id,
            amount: parseFloat(order.total_amount),
            orderInfo: 'Payment for Order #' + order.id,
          }
        });
        window.open(payData.paymentUrl, '_blank');
        state.cart = [];
        renderCartItems();
        toast('VNPay payment page opened in new tab');
      } catch (pe) {
        toast('VNPay error: ' + pe.message, 'error');
      }
    } else {
      toast('Order #' + order.id + ' completed! Receipt sent to ' + email);
      showReceipt(order);
      state.cart = [];
    }
  } catch (e) { toast(e.message, 'error'); }
}

function showReceipt(order) {
  const rows = (order.items || []).map(i => `<tr><td>${i.product_name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${formatCurrency(i.product_price)}</td><td style="text-align:right">${formatCurrency(i.subtotal)}</td></tr>`).join('');
  showModal(`<div class="receipt">
    <h2>${state.tenant.name}</h2>
    <p class="receipt-subtitle">Order #${order.id} · ${formatDate(order.created_at || new Date())}</p>
    <table><thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="receipt-total">Total: ${formatCurrency(order.total_amount)}</div>
    <p class="receipt-footer">Email sent to ${order.customer_email}<br>Thank you for your purchase!</p>
  </div><div class="modal-actions"><button class="btn btn-primary" onclick="hideModal()">Close</button></div>`);
}

// ═══════════════════════════════════════
//  ORDERS LIST
// ═══════════════════════════════════════
async function renderOrders() {
  $('pageContent').innerHTML = '<div class="page-header"><div><h1>Orders</h1><p>Transaction history</p></div></div><div class="table-wrapper" id="ordersTable"><p style="padding:2rem;color:var(--text-muted)">Loading...</p></div>';
  try {
    const orders = await api('/orders');
    if (orders.length === 0) { $('ordersTable').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No orders yet</p></div>'; return; }
    const statusBadge = (s) => { const m = { completed: 'success', pending: 'warning', failed: 'danger' }; return `<span class="badge badge-${m[s] || 'info'}">${s}</span>`; };
    $('ordersTable').innerHTML = `<table><thead><tr><th>ID</th><th>Date</th><th>Cashier</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${orders.map(o => `<tr><td>#${o.id}</td><td>${formatDate(o.created_at)}</td><td>${o.cashier_name || '—'}</td><td>${o.customer_email || '—'}</td><td><strong>${formatCurrency(o.total_amount)}</strong></td><td>${statusBadge(o.status)}</td><td><button class="btn btn-ghost btn-sm" onclick="viewOrder(${o.id})">View</button></td></tr>`).join('')
      }</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function viewOrder(id) {
  try {
    const o = await api('/orders/' + id);
    showReceipt(o);
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════
//  CATEGORIES
// ═══════════════════════════════════════
async function renderCategories() {
  const canEdit = ['admin', 'manager'].includes(state.user.role);
  $('pageContent').innerHTML = `<div class="page-header"><div><h1>Categories</h1><p>Manage product categories</p></div>${canEdit ? '<button class="btn btn-primary" onclick="showAddCategory()">+ Add Category</button>' : ''}</div><div class="table-wrapper" id="catTable"><p style="padding:2rem;color:var(--text-muted)">Loading...</p></div>`;
  try {
    const cats = await api('/categories');
    if (cats.length === 0) { $('catTable').innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><p>No categories yet</p></div>'; return; }
    $('catTable').innerHTML = `<table><thead><tr><th>ID</th><th>Name</th><th>Description</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>${cats.map(c => `<tr><td>${c.id}</td><td><strong>${c.name}</strong></td><td style="color:var(--text-muted)">${c.description || '—'}</td>${canEdit ? `<td class="text-right"><button class="btn btn-ghost btn-sm" onclick="showUpdateCategory(decodeURIComponent('${encodeURIComponent(JSON.stringify(c))}'))">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteCategory(${c.id})">Delete</button></td>` : ''}</tr>`).join('')
      }</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function showAddCategory() {
  showModal(`<h2>Add Category</h2>
    <div class="form-group"><label>Name</label><input type="text" id="catName" placeholder="Category name"></div>
    <div class="form-group"><label>Description</label><input type="text" id="catDesc" placeholder="Optional description"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="addCategory()">Add</button></div>`);
}
async function addCategory() {
  try {
    await api('/categories', { method: 'POST', body: { name: $('catName').value, description: $('catDesc').value } });
    hideModal(); toast('Category added'); renderCategories();
  } catch (e) { toast(e.message, 'error'); }
}
function showUpdateCategory(encoded) {
  const cat = JSON.parse(encoded);
  showModal(`<h2>Edit Category</h2>
    <div class="form-group"><label>Name</label><input type="text" id="ucatName" value="${(cat.name || '').replace(/"/g, '&quot;')}"></div>
    <div class="form-group"><label>Description</label><input type="text" id="ucatDesc" value="${(cat.description || '').replace(/"/g, '&quot;')}"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="updateCategory(${cat.id})">Save</button></div>`);
}
async function updateCategory(id) {
  try {
    await api('/categories/' + id, { method: 'PUT', body: { name: $('ucatName').value, description: $('ucatDesc').value } });
    hideModal(); toast('Category updated'); renderCategories();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  try { await api('/categories/' + id, { method: 'DELETE' }); toast('Category deleted'); renderCategories(); }
  catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════
//  PRODUCTS
// ═══════════════════════════════════════
async function renderProducts() {
  const canEdit = ['admin', 'manager'].includes(state.user.role);
  $('pageContent').innerHTML = `<div class="page-header"><div><h1>Products</h1><p>Manage your inventory</p></div>${canEdit ? '<button class="btn btn-primary" onclick="showAddProduct()">+ Add Product</button>' : ''}</div><div class="table-wrapper" id="prodTable"><p style="padding:2rem;color:var(--text-muted)">Loading...</p></div>`;
  try {
    const prods = await api('/products');
    if (prods.length === 0) { $('prodTable').innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>No products yet</p></div>'; return; }
    $('prodTable').innerHTML = `<table><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>${prods.map(p => `<tr><td>${p.id}</td><td><strong>${p.name}</strong></td><td>${p.category_name || '—'}</td><td>${formatCurrency(p.price)}</td><td>${p.stock_quantity}</td>${canEdit ? `<td class="text-right"><button class="btn btn-ghost btn-sm" onclick="showUpdateProduct(decodeURIComponent('${encodeURIComponent(JSON.stringify(p))}'))">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Delete</button></td>` : ''}</tr>`).join('')
      }</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function showAddProduct() {
  const cats = await api('/categories');
  const opts = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  showModal(`<h2>Add Product</h2>
    <div class="form-group"><label>Name</label><input type="text" id="prodName" placeholder="Product name"></div>
    <div class="form-group"><label>Description</label><input type="text" id="prodDesc" placeholder="Optional"></div>
    <div class="form-row">
      <div class="form-group"><label>Price</label><input type="number" id="prodPrice" placeholder="0" step="100" min="0"></div>
      <div class="form-group"><label>Stock</label><input type="number" id="prodStock" placeholder="0" step="1" min="0"></div>
    </div>
    <div class="form-group"><label>Category</label><select id="prodCat"><option value="">— None —</option>${opts}</select></div>
    <div class="form-group">
      <label>Product Image</label>
      <input type="file" id="prodImage" accept="image/*" onchange="previewImage(this, 'prodImagePreview')">
      <div id="prodImagePreview" style="margin-top: 10px; width: 100%;"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="addProduct()">Add</button></div>`);
}
function previewImage(input, previewId) {
  const preview = document.getElementById(previewId);
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; border-radius: 8px;">`;
    }
    reader.readAsDataURL(input.files[0]);
  } else {
    preview.innerHTML = '';
  }
}

async function addProduct() {
  try {
    const formData = new FormData();
    formData.append('name', $('prodName').value);
    formData.append('description', $('prodDesc').value);
    formData.append('price', parseFloat($('prodPrice').value));
    formData.append('stock_quantity', parseInt($('prodStock').value) || 0);
    if ($('prodCat').value) formData.append('category_id', $('prodCat').value);

    const fileInput = $('prodImage');
    if (fileInput.files.length > 0) {
      formData.append('image', fileInput.files[0]);
    }

    await api('/products', { method: 'POST', body: formData });
    hideModal(); toast('Product added'); renderProducts();
  } catch (e) { toast(e.message, 'error'); }
}
async function showUpdateProduct(encoded) {
  const prod = JSON.parse(encoded);
  const cats = await api('/categories');
  const opts = cats.map(c => `<option value="${c.id}" ${c.id === prod.category_id ? 'selected' : ''}>${c.name}</option>`).join('');
  showModal(`<h2>Edit Product</h2>
    <div class="form-group"><label>Name</label><input type="text" id="uprodName" value="${(prod.name || '').replace(/"/g, '&quot;')}"></div>
    <div class="form-group"><label>Description</label><input type="text" id="uprodDesc" value="${(prod.description || '').replace(/"/g, '&quot;')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Price</label><input type="number" id="uprodPrice" step="1000" min="0" value="${prod.price.toFixed(0)}"></div>
      <div class="form-group"><label>Stock</label><input type="number" id="uprodStock" step="1" min="0" value="${prod.stock_quantity}"></div>
    </div>
    <div class="form-group"><label>Category</label><select id="uprodCat"><option value="">— None —</option>${opts}</select></div>
    <div class="form-group">
      <label>Product Image</label>
      <input type="file" id="uprodImage" accept="image/*" onchange="previewImage(this, 'uprodImagePreview')">
      <div id="uprodImagePreview" style="margin-top: 10px; width: 100%">
        ${prod.image_url ? `<img src="${prod.image_url}" style="width: 100%; border-radius: 8px;">` : ''}
      </div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="updateProduct(${prod.id})">Save</button></div>`);
}
async function updateProduct(id) {
  try {
    const formData = new FormData();
    formData.append('name', $('uprodName').value);
    formData.append('description', $('uprodDesc').value);
    formData.append('price', parseFloat($('uprodPrice').value));
    formData.append('stock_quantity', parseInt($('uprodStock').value) || 0);
    if ($('uprodCat').value) formData.append('category_id', $('uprodCat').value);

    const fileInput = $('uprodImage');
    if (fileInput.files.length > 0) {
      formData.append('image', fileInput.files[0]);
    }

    await api('/products/' + id, { method: 'PUT', body: formData });
    hideModal(); toast('Product updated'); renderProducts();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  try { await api('/products/' + id, { method: 'DELETE' }); toast('Product deleted'); renderProducts(); }
  catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════
//  CUSTOMERS
// ═══════════════════════════════════════
async function renderCustomers() {
  $('pageContent').innerHTML = `<div class="page-header"><div><h1>Customers</h1><p>Customer directory</p></div><button class="btn btn-primary" onclick="showAddCustomer()">+ Add Customer</button></div><div class="table-wrapper" id="custTable"><p style="padding:2rem;color:var(--text-muted)">Loading...</p></div>`;
  try {
    const custs = await api('/customers');
    if (custs.length === 0) { $('custTable').innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No customers yet</p></div>'; return; }
    $('custTable').innerHTML = `<table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Joined</th><th></th></tr></thead><tbody>${custs.map(c => `<tr><td>${c.id}</td><td><strong>${c.name}</strong></td><td>${c.email}</td><td>${formatDate(c.created_at)}</td><td class="text-right"><button class="btn btn-ghost btn-sm" onclick="showUpdateCustomer(decodeURIComponent('${encodeURIComponent(JSON.stringify(c))}'))">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteCustomer(${c.id})">Delete</button></td></tr>`).join('')
      }</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function showAddCustomer() {
  showModal(`<h2>Add Customer</h2>
    <div class="form-group"><label>Name</label><input type="text" id="custName" placeholder="Full name"></div>
    <div class="form-group"><label>Email</label><input type="email" id="custEmail" placeholder="email@example.com"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="addCustomer()">Add</button></div>`);
}
async function addCustomer() {
  try {
    await api('/customers', { method: 'POST', body: { name: $('custName').value, email: $('custEmail').value } });
    hideModal(); toast('Customer added'); renderCustomers();
  } catch (e) { toast(e.message, 'error'); }
}
function showUpdateCustomer(encoded) {
  const c = JSON.parse(encoded);
  showModal(`<h2>Edit Customer</h2>
    <div class="form-group"><label>Name</label><input type="text" id="ucustName" value="${(c.name || '').replace(/"/g, '&quot;')}"></div>
    <div class="form-group"><label>Email</label><input type="email" id="ucustEmail" value="${(c.email || '').replace(/"/g, '&quot;')}"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="updateCustomer(${c.id})">Save</button></div>`);
}
async function updateCustomer(id) {
  try {
    await api('/customers/' + id, { method: 'PUT', body: { name: $('ucustName').value, email: $('ucustEmail').value } });
    hideModal(); toast('Customer updated'); renderCustomers();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteCustomer(id) {
  if (!confirm('Delete this customer?')) return;
  try { await api('/customers/' + id, { method: 'DELETE' }); toast('Customer deleted'); renderCustomers(); }
  catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════
//  USERS (Staff / Managers / Admins)
// ═══════════════════════════════════════
async function renderUsers(role) {
  const labels = { staff: 'Staff', manager: 'Managers', admin: 'Admins' };
  const label = labels[role] || 'Users';
  $('pageContent').innerHTML = `<div class="page-header"><div><h1>${label}</h1><p>Manage ${label.toLowerCase()} accounts</p></div><button class="btn btn-primary" onclick="showAddUser('${role}')">+ Add ${label.slice(0, -1) || role}</button></div><div class="table-wrapper" id="usersTable"><p style="padding:2rem;color:var(--text-muted)">Loading...</p></div>`;
  try {
    const users = await api('/users?role=' + role);
    if (users.length === 0) { $('usersTable').innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><p>No ${label.toLowerCase()} yet</p></div>`; return; }
    $('usersTable').innerHTML = `<table><thead><tr><th>ID</th><th>Username</th><th>Name</th><th>Role</th><th>Joined</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td><strong>${u.name}</strong></td><td>${roleBadge(u.role)}</td><td>${formatDate(u.created_at)}</td><td class="text-right">${u.id !== state.user.id ? `<button class="btn btn-ghost btn-sm" onclick="showUpdateUser(decodeURIComponent('${encodeURIComponent(JSON.stringify(u))}'), '${role}')">Edit</button> <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id},'${role}')">Delete</button>` : '<span class="badge badge-accent">You</span>'}</td></tr>`).join('')
      }</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function showAddUser(role) {
  const labels = { staff: 'Staff Member', manager: 'Manager', admin: 'Admin' };
  showModal(`<h2>Add ${labels[role]}</h2>
    <div class="form-group"><label>Full Name</label><input type="text" id="newUserName" placeholder="Full name"></div>
    <div class="form-group"><label>Username</label><input type="text" id="newUserUsername" placeholder="Username for login"></div>
    <div class="form-group"><label>Password</label><input type="password" id="newUserPassword" placeholder="Password"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="addUser('${role}')">Add</button></div>`);
}
async function addUser(role) {
  try {
    await api('/users', { method: 'POST', body: { name: $('newUserName').value, username: $('newUserUsername').value, password: $('newUserPassword').value, role } });
    hideModal(); toast(role.charAt(0).toUpperCase() + role.slice(1) + ' added'); renderUsers(role);
  } catch (e) { toast(e.message, 'error'); }
}
function showUpdateUser(encoded, viewRole) {
  const u = JSON.parse(encoded);
  showModal(`<h2>Edit User</h2>
    <div class="form-group"><label>Full Name</label><input type="text" id="uuserName" value="${(u.name || '').replace(/"/g, '&quot;')}"></div>
    <div class="form-group"><label>Username</label><input type="text" id="uuserUsername" value="${(u.username || '').replace(/"/g, '&quot;')}"></div>
    <div class="form-group"><label>New Password (Optional)</label><input type="password" id="uuserPassword" placeholder="Leave blank to keep current"></div>
    <div class="form-group"><label>Role</label><select id="uuserRole"><option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff</option><option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Manager</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="hideModal()">Cancel</button><button class="btn btn-primary" onclick="updateUser(${u.id}, '${viewRole}')">Save</button></div>`);
}
async function updateUser(id, viewRole) {
  try {
    const pwd = $('uuserPassword').value;
    const body = { name: $('uuserName').value, username: $('uuserUsername').value, role: $('uuserRole').value };
    if (pwd) body.password = pwd;
    await api('/users/' + id, { method: 'PUT', body });
    hideModal(); toast('User updated'); renderUsers(viewRole);
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteUser(id, role) {
  if (!confirm('Delete this user?')) return;
  try { await api('/users/' + id, { method: 'DELETE' }); toast('User deleted'); renderUsers(role); }
  catch (e) { toast(e.message, 'error'); }
}

// ── START APP ──
init();
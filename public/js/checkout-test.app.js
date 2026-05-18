// public/js/checkout-test.app.js
let token = localStorage.getItem('oxxila_token') || '';
let adminToken = localStorage.getItem('oxxila_admin_token') || '';
let cartData = null;
let shippingPrice = 0;
let selectedPay = 'cod';
let pollTimer = null;

const BASE = () =>
  (document.getElementById('base-url')?.value || 'https://oxxila-api-01ced6342147.herokuapp.com/api/v1').replace(/\/$/, '');

document.querySelectorAll('.pay-opt-row').forEach((el) => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.pay-opt-row').forEach((x) => x.classList.remove('active'));
    el.classList.add('active');
    el.querySelector('input').checked = true;
    selectedPay = el.dataset.pay;
    document.getElementById('paymob-frame-wrap').style.display = 'none';
  });
});

const baseInput = document.getElementById('base-url');
if (localStorage.getItem('oxxila_base')) baseInput.value = localStorage.getItem('oxxila_base');
baseInput.addEventListener('change', (e) => localStorage.setItem('oxxila_base', e.target.value));

function log(msg, data) {
  const el = document.getElementById('api-log');
  const line = data === undefined ? msg : `${msg}\n${JSON.stringify(data, null, 2)}`;
  el.textContent = `${line}\n\n${el.textContent.slice(0, 3500)}`;
}

let toastTimer;
function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function api(method, path, body, pub = false, authToken = null) {
  const headers = { 'Content-Type': 'application/json' };
  const bearer = authToken ?? token;
  if (!pub && bearer) headers.Authorization = `Bearer ${bearer}`;
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    log(`${method} ${path} → ${res.status}`, json);
    return json;
  } catch (e) {
    log(`${method} ${path} → ERROR`, { message: e.message });
    return { success: false, message: 'Network error' };
  }
}

function updateLoginUI() {
  const pill = document.getElementById('login-pill');
  const btn = document.getElementById('place-btn');
  if (token) {
    pill.classList.add('logged');
    document.getElementById('login-label').textContent = 'Logged in';
    btn.disabled = !(cartData?.items?.length);
  } else {
    pill.classList.remove('logged');
    document.getElementById('login-label').textContent = 'Login';
    btn.disabled = true;
  }
}

function openLogin() {
  if (token) {
    token = '';
    localStorage.removeItem('oxxila_token');
    updateLoginUI();
    showToast('Logged out', 'err');
    return;
  }
  document.getElementById('login-modal').classList.add('open');
}

function closeLogin() {
  document.getElementById('login-modal').classList.remove('open');
}

async function doLogin() {
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const data = await api(
    'POST',
    '/auth/login',
    {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-pass').value,
    },
    true
  );
  btn.disabled = false;
  btn.textContent = 'Sign in';
  if (data?.data?.accessToken) {
    token = data.data.accessToken;
    localStorage.setItem('oxxila_token', token);
    closeLogin();
    updateLoginUI();
    showToast('Logged in');
    await loadCart();
    await loadCountries();
    loadMyOrders();
  } else {
    const err = document.getElementById('login-err');
    err.textContent = data?.message || 'Login failed';
    err.style.display = 'block';
  }
}

async function loadCart() {
  if (!token) return;
  const data = await api('GET', '/cart');
  cartData = data?.data || { items: [], subtotal: 0, totalPrice: 0 };
  renderSummary();
  updateLoginUI();
}

function renderSummary() {
  const items = cartData?.items || [];
  const box = document.getElementById('cart-lines');
  if (!items.length) {
    box.innerHTML =
      '<p class="empty-inline">Cart empty — <a href="/cart-test.html">add products</a></p>';
  } else {
    box.innerHTML = items
      .map((it) => {
        const img = it.product?.images?.[0]
          ? `<img src="${it.product.images[0]}" alt="">`
          : '🧴';
        return `<div class="sum-item"><div class="sum-thumb">${img}</div><div><div class="sum-name">${it.product?.name || 'Product'}</div><div class="sum-meta">${it.quantity} × ${it.price} EGP</div></div></div>`;
      })
      .join('');
  }

  document.getElementById('sum-sub').textContent = `${cartData?.subtotal ?? 0} EGP`;
  const discRow = document.getElementById('sum-disc-row');
  if (cartData?.couponCode) {
    discRow.style.display = '';
    document.getElementById('sum-disc').textContent = `-${cartData.discountAmount} EGP`;
  } else {
    discRow.style.display = 'none';
  }
  updateTotal();
}

function updateTotal() {
  const sub = cartData?.subtotal ?? 0;
  const disc = cartData?.discountAmount ?? 0;
  const total = Math.max(0, sub - disc + shippingPrice);
  document.getElementById('sum-total').textContent = `${total.toFixed(0)} EGP`;
  document.getElementById('sum-ship').textContent = shippingPrice ? `${shippingPrice} EGP` : '—';
}

async function loadCountries() {
  const data = await api('GET', '/shipping/countries', null, true);
  const sel = document.getElementById('country');
  const list = data?.data || [];
  sel.innerHTML =
    '<option value="">Select country</option>' +
    list.map((c) => `<option value="${c._id}">${c.name}</option>`).join('');
  if (list.length === 1) {
    sel.value = list[0]._id;
    onCountryChange();
  }
}

async function onCountryChange() {
  const id = document.getElementById('country').value;
  const gov = document.getElementById('governorate');
  gov.disabled = true;
  gov.innerHTML = '<option value="">Loading…</option>';
  document.getElementById('district').innerHTML = '<option value="">Select governorate</option>';
  document.getElementById('district').disabled = true;
  if (!id) return;
  const data = await api('GET', `/shipping/countries/${id}/governorates`, null, true);
  const list = data?.data || [];
  gov.innerHTML =
    '<option value="">Select governorate</option>' +
    list.map((g) => `<option value="${g._id}">${g.name} (${g.shippingPrice} EGP)</option>`).join('');
  gov.disabled = false;
}

async function onGovernorateChange() {
  const id = document.getElementById('governorate').value;
  const dist = document.getElementById('district');
  dist.disabled = true;
  dist.innerHTML = '<option value="">Loading…</option>';
  if (!id) return;
  const data = await api('GET', `/shipping/governorates/${id}/zones`, null, true);
  const d = data?.data;
  if (!d?.hasDistricts) {
    dist.innerHTML = `<option value="other">Other (${d.shippingPrice} EGP)</option>`;
    shippingPrice = d.shippingPrice;
    dist.disabled = false;
    updateTotal();
    return;
  }
  let html = '<option value="">Select district</option>';
  d.districts.forEach((z) => {
    html += `<option value="${z._id}">${z.name} (${z.shippingPrice} EGP)</option>`;
  });
  html += `<option value="other">Other (${d.other.shippingPrice} EGP)</option>`;
  dist.innerHTML = html;
  dist.disabled = false;
  resolveShippingPrice();
}

async function resolveShippingPrice() {
  const governorateId = document.getElementById('governorate').value;
  const districtId = document.getElementById('district').value || 'other';
  if (!governorateId) return;
  const data = await api(
    'GET',
    `/shipping/resolve?governorateId=${governorateId}&districtId=${districtId}`,
    null,
    true
  );
  shippingPrice = data?.data?.shippingPrice ?? 0;
  document.getElementById('sum-ship').textContent = `${shippingPrice} EGP`;
  updateTotal();
}

function checkoutPayload() {
  return {
    governorateId: document.getElementById('governorate').value,
    districtId: document.getElementById('district').value || 'other',
    addressLine: document.getElementById('address-line').value.trim(),
  };
}

async function placeOrder() {
  if (!token) {
    openLogin();
    return;
  }
  const payload = checkoutPayload();
  if (!payload.governorateId || !payload.addressLine) {
    showToast('Complete shipping address', 'err');
    return;
  }

  const btn = document.getElementById('place-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Processing…';

  if (selectedPay === 'cod') {
    const data = await api('POST', '/orders', { ...payload, paymentMethod: 'cod' });
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-lock"></i> Place order';
    if (data?.data) {
      showToast('COD order created');
      const alert = document.getElementById('return-alert');
      alert.style.display = '';
      document.getElementById('return-msg').textContent = `Order ${data.data._id} — ${data.data.paymentStatus}`;
      await loadCart();
      loadMyOrders();
    } else {
      showToast(data?.message || 'Failed', 'err');
    }
    return;
  }

  const data = await api('POST', '/orders/payment-session', { ...payload, provider: selectedPay });
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-lock"></i> Place order';

  if (!data?.data?.paymentSessionId) {
    showToast(data?.message || 'Payment session failed', 'err');
    return;
  }

  const psId = data.data.paymentSessionId;
  sessionStorage.setItem('oxxila_payment_session', psId);

  if (selectedPay === 'stripe' && data.data.url) {
    showToast('Redirecting to Stripe…');
    window.location.href = data.data.url;
    return;
  }

  if (selectedPay === 'paymob' && data.data.iframeUrl) {
    showToast('Complete payment in iframe');
    document.getElementById('paymob-frame-wrap').style.display = 'block';
    document.getElementById('paymob-frame').src = data.data.iframeUrl;
    pollPaymentSession(psId);
  }
}

function pollPaymentSession(id) {
  clearInterval(pollTimer);
  let n = 0;
  pollTimer = setInterval(async () => {
    n += 1;
    const data = await api('GET', `/orders/payment-session/${id}`);
    const st = data?.data?.status;
    if (st === 'completed' && data?.data?.order) {
      clearInterval(pollTimer);
      const orderId = data.data.order._id || data.data.order;
      showToast('Order created after payment');
      document.getElementById('return-alert').style.display = '';
      document.getElementById('return-msg').textContent = `Order ${orderId}`;
      document.getElementById('paymob-frame-wrap').style.display = 'none';
      sessionStorage.removeItem('oxxila_payment_session');
      await loadCart();
      loadMyOrders();
    } else if (st === 'failed' || n > 80) {
      clearInterval(pollTimer);
      if (st === 'failed') showToast('Payment failed', 'err');
    }
  }, 3000);
}

function canRefundOrder(o) {
  return (
    adminToken &&
    o.paymentMethod === 'card' &&
    o.paymentProvider === 'stripe' &&
    o.paymentStatus === 'paid'
  );
}

function updateAdminUI() {
  const fields = document.getElementById('admin-fields');
  const status = document.getElementById('admin-status');
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (!fields) return;

  if (adminToken) {
    fields.style.display = 'none';
    status.style.display = '';
    status.textContent = 'Admin signed in';
    status.classList.add('ok');
    logoutBtn.style.display = '';
  } else {
    fields.style.display = '';
    status.style.display = 'none';
    status.classList.remove('ok');
    logoutBtn.style.display = 'none';
  }
}

async function adminLogin() {
  const email = document.getElementById('admin-email')?.value?.trim();
  const password = document.getElementById('admin-pass')?.value;
  if (!email || !password) {
    showToast('Enter admin email and password', 'err');
    return;
  }

  const data = await api('POST', '/auth/login', { email, password }, true);
  const role = data?.data?.user?.role;
  const accessToken = data?.data?.accessToken;

  if (!accessToken || role !== 'admin') {
    showToast(data?.message || 'Admin login failed — use an admin account', 'err');
    return;
  }

  adminToken = accessToken;
  localStorage.setItem('oxxila_admin_token', adminToken);
  updateAdminUI();
  showToast('Admin signed in — refund enabled');
  loadMyOrders();
}

function adminLogout() {
  adminToken = '';
  localStorage.removeItem('oxxila_admin_token');
  updateAdminUI();
  showToast('Admin signed out', 'err');
  loadMyOrders();
}

async function refundOrder(orderId, btn) {
  if (!adminToken) {
    showToast('Sign in as admin first', 'err');
    return;
  }
  if (!confirm('Refund this order on Stripe? Stock will be restored.')) return;

  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const data = await api('POST', `/orders/${orderId}/refund`, null, false, adminToken);

  btn.disabled = false;
  btn.innerHTML = prev;

  if (data?.data?.order) {
    showToast(data.message || 'Order refunded');
    loadMyOrders();
  } else {
    showToast(data?.message || 'Refund failed', 'err');
  }
}

async function loadMyOrders() {
  if (!token) return;
  const data = await api('GET', '/orders/my-orders?limit=10&sort=-createdAt');
  const box = document.getElementById('orders-list');
  const orders = data?.data || [];
  if (!orders.length) {
    box.innerHTML = '<p class="empty-inline">No orders yet</p>';
    return;
  }
  box.innerHTML = orders
    .map((o) => {
      const refundBtn = canRefundOrder(o)
        ? `<button type="button" class="btn-refund" onclick="refundOrder('${o._id}', this)"><i class="ti ti-receipt-refund"></i> Refund</button>`
        : '';
      const provider = o.paymentProvider ? ` · ${o.paymentProvider}` : '';
      return `
    <div class="order-card">
      <div class="order-top"><span class="order-id">#${o._id.slice(-8)}</span><span class="badge ${o.paymentStatus}">${o.paymentStatus}</span></div>
      <div>${o.items?.length || 0} items · <strong>${o.totalPrice} EGP</strong></div>
      <div class="order-meta">${o.paymentMethod}${provider} · ${o.orderStatus} · ${new Date(o.createdAt).toLocaleString()}</div>
      ${refundBtn}
    </div>`;
    })
    .join('');
}

function checkStripeReturn() {
  const psId = sessionStorage.getItem('oxxila_payment_session');
  const params = new URLSearchParams(location.search);
  if (psId && (params.get('session_id') || params.get('paid') === '1')) {
    document.getElementById('return-alert').style.display = '';
    document.getElementById('return-msg').textContent = 'Back from Stripe — verifying…';
    pollPaymentSession(psId);
    history.replaceState({}, '', location.pathname);
  }
}

window.openLogin = openLogin;
window.closeLogin = closeLogin;
window.doLogin = doLogin;
window.onCountryChange = onCountryChange;
window.onGovernorateChange = onGovernorateChange;
window.resolveShippingPrice = resolveShippingPrice;
window.placeOrder = placeOrder;
window.loadMyOrders = loadMyOrders;
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.refundOrder = refundOrder;

updateAdminUI();
updateLoginUI();
if (token) {
  loadCart();
  loadCountries();
  loadMyOrders();
}
checkStripeReturn();

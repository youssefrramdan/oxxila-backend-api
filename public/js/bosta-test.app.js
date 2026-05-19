// public/js/bosta-test.app.js
let token = localStorage.getItem('oxxila_bosta_admin_token') || localStorage.getItem('oxxila_admin_token') || '';
let orders = [];
let selectedOrderId = null;
let selectedWebhookState = 'DELIVERED';

const PACKAGE_TYPES = ['Parcel', 'Document', 'Bulky'];
const PACKAGE_SIZES = ['SMALL', 'MEDIUM', 'LARGE', 'LIGHT_BULKY', 'HEAVY_BULKY'];

const BOSTA_PICKUP_STORAGE_KEY = 'oxxila_bosta_pickup_draft';

const defaultBostaPickup = () => ({
  cityId: 'FceDyHXwpSYYF9zGW',
  city: 'Cairo',
  zone: '15 May',
  districtId: 'Iy7-lFD0BE0',
  districtName: '15 May',
  firstLine: '1 Test warehouse street',
});

const loadBostaPickupDraft = () => {
  try {
    const raw = localStorage.getItem(BOSTA_PICKUP_STORAGE_KEY);
    const draft = raw ? { ...defaultBostaPickup(), ...JSON.parse(raw) } : defaultBostaPickup();
    if (!draft.cityId) draft.cityId = defaultBostaPickup().cityId;
    return draft;
  } catch {
    return defaultBostaPickup();
  }
};

const saveBostaPickupDraft = (addr) => {
  localStorage.setItem(BOSTA_PICKUP_STORAGE_KEY, JSON.stringify(addr));
};

const BOSTA_STATES = [
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
  'EXCEPTION',
];

const BASE = () =>
  (document.getElementById('base-url')?.value || 'http://localhost:3000/api/v1').replace(/\/$/, '');

const baseInput = document.getElementById('base-url');
if (localStorage.getItem('oxxila_base')) baseInput.value = localStorage.getItem('oxxila_base');
baseInput?.addEventListener('change', (e) => localStorage.setItem('oxxila_base', e.target.value));

function log(msg, data) {
  const el = document.getElementById('api-log');
  const line = data === undefined ? msg : `${msg}\n${JSON.stringify(data, null, 2)}`;
  el.textContent = `${line}\n\n${el.textContent.slice(0, 8000)}`;
}

function clearLog() {
  document.getElementById('api-log').textContent = 'Cleared.';
}

let toastTimer;
function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type === 'err' ? 'err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function api(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method,
      headers,
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    log(`${method} ${path} → ${res.status}`, json);
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    log(`${method} ${path} → ERROR`, { message: e.message });
    return { ok: false, status: 0, json: { success: false, message: e.message } };
  }
}

function statusBadge(status) {
  const cls =
    {
      pending: 'badge-pending',
      processing: 'badge-processing',
      delivered: 'badge-delivered',
      returned: 'badge-returned',
    }[status] || 'badge-default';
  return `<span class="badge ${cls}">${status || '—'}</span>`;
}

function shortId(id) {
  if (!id) return '—';
  const s = String(id);
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}

function orderItemsCount(items = []) {
  return items.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

function defaultPackageDescription(order) {
  const preview = (order.items || [])
    .slice(0, 3)
    .map((item) => `${item.name}×${item.quantity}`)
    .join(', ');
  const extra = (order.items?.length || 0) > 3 ? ` (+${order.items.length - 3} more)` : '';
  return `Oxxila order: ${preview}${extra}`;
}

function renderOrderItemsList(items = []) {
  if (!items.length) return '<p class="hint">No line items</p>';
  return `<ul class="items-list">${items
    .map(
      (item) =>
        `<li><span>${item.name}</span><span class="mono">×${item.quantity} · ${item.price} EGP</span></li>`
    )
    .join('')}</ul>`;
}

function updateLoginUI() {
  const pill = document.getElementById('login-pill');
  const label = document.getElementById('login-label');
  if (token) {
    pill.classList.add('logged');
    label.textContent = 'Admin connected';
  } else {
    pill.classList.remove('logged');
    label.textContent = 'Admin login';
  }
}

function openLogin() {
  if (token) {
    token = '';
    localStorage.removeItem('oxxila_bosta_admin_token');
    updateLoginUI();
    orders = [];
    selectedOrderId = null;
    renderOrdersTable();
    renderDetail(null);
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
  const errEl = document.getElementById('login-err');
  errEl.textContent = '';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { ok, json } = await api(
    'POST',
    '/auth/login',
    {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-pass').value,
    },
    { auth: false }
  );

  btn.disabled = false;
  btn.textContent = 'Sign in';

  if (!ok || !json?.data?.accessToken) {
    errEl.textContent = json?.message || 'Login failed';
    showToast(json?.message || 'Login failed', 'err');
    return;
  }

  if (json.data.user?.role !== 'admin') {
    errEl.textContent = 'This account is not an admin';
    showToast('Admin role required', 'err');
    return;
  }

  token = json.data.accessToken;
  localStorage.setItem('oxxila_bosta_admin_token', token);
  localStorage.setItem('oxxila_base', BASE());
  updateLoginUI();
  closeLogin();
  showToast('Signed in as admin');
  await loadOrders();
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  document.getElementById('orders-count').textContent = orders.length ? `(${orders.length})` : '';

  if (!token) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-cell">Sign in as admin to load orders</td></tr>';
    return;
  }

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No orders found</td></tr>';
    return;
  }

  tbody.innerHTML = orders
    .map((o) => {
      const id = o._id;
      const user = o.user || {};
      const bosta = o.bostaTrackingNumber
        ? `<span class="badge badge-bosta">${o.bostaStatus || 'shipped'}</span>`
        : '<span class="badge-none">—</span>';
      const sel = id === selectedOrderId ? 'selected' : '';
      return `<tr class="${sel}" data-id="${id}" onclick="selectOrder('${id}')">
        <td><span class="mono" title="${id}">${shortId(id)}</span></td>
        <td>${user.name || '—'}<br><span class="mono">${user.phone || ''}</span></td>
        <td>${statusBadge(o.orderStatus)}</td>
        <td>${bosta}</td>
        <td>${o.totalPrice ?? 0} EGP</td>
      </tr>`;
    })
    .join('');
}

function renderDetail(order) {
  const title = document.getElementById('detail-title');
  const body = document.getElementById('detail-body');

  if (!order) {
    title.textContent = 'Select an order';
    body.innerHTML = '<p class="hint">Click a row to manage Bosta shipment and simulate webhooks.</p>';
    return;
  }

  const canShip = !order.bostaDeliveryId && ['pending', 'processing'].includes(order.orderStatus);
  const hasShipment = Boolean(order.bostaDeliveryId || order.bostaTrackingNumber);
  const itemCount = orderItemsCount(order.items);
  const pkgDesc = defaultPackageDescription(order);
  const chips = BOSTA_STATES.map(
    (s) =>
      `<button type="button" class="state-chip ${s === selectedWebhookState ? 'sel' : ''}" onclick="pickState('${s}')">${s}</button>`
  ).join('');

  title.textContent = `Order ${shortId(order._id)}`;
  const pickup = loadBostaPickupDraft();

  body.innerHTML = `
    <div class="detail-grid">
      <div class="detail-row"><span>Order ID</span><span class="mono">${order._id}</span></div>
      <div class="detail-row"><span>Customer</span><span>${order.user?.name || '—'} · ${order.user?.phone || '<em style="color:var(--red)">no phone</em>'}</span></div>
      <div class="detail-row"><span>Payment</span><span>${order.paymentMethod} · ${order.paymentStatus}</span></div>
      <div class="detail-row"><span>Order status</span><span>${statusBadge(order.orderStatus)}</span></div>
      <div class="detail-row"><span>Items</span><span>${itemCount} pcs</span></div>
      <div class="detail-row"><span>Total</span><span>${order.totalPrice} EGP</span></div>
      <div class="detail-row"><span>Address</span><span>${order.shippingAddress?.governorateName}, ${order.shippingAddress?.districtName}<br>${order.shippingAddress?.addressLine}</span></div>
      <div class="detail-row"><span>Bosta delivery ID</span><span class="mono">${order.bostaDeliveryId || '—'}</span></div>
      <div class="detail-row"><span>Tracking #</span><span class="mono">${order.bostaTrackingNumber || '—'}</span></div>
      <div class="detail-row"><span>Bosta status</span><span>${order.bostaStatus ? `<span class="badge badge-bosta">${order.bostaStatus}</span>` : '—'}</span></div>
      <div class="detail-row"><span>Delivered at</span><span>${order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : '—'}</span></div>
    </div>

    <p class="section-title">Order line items</p>
    ${renderOrderItemsList(order.items)}

    <p class="section-title">1 — Pickup address (manual)</p>
    <p class="hint">cityId + districtId from Bosta cities API (server fills cityId from districtId).</p>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">cityId</label>
        <input class="form-input mono" id="pickup-city-id" value="${pickup.cityId || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">City</label>
        <input class="form-input" id="pickup-city" value="${pickup.city}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Zone</label>
        <input class="form-input" id="pickup-zone" value="${pickup.zone}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">districtId</label>
        <input class="form-input mono" id="pickup-district-id" value="${pickup.districtId}">
      </div>
      <div class="form-group">
        <label class="form-label">districtName</label>
        <input class="form-input" id="pickup-district-name" value="${pickup.districtName}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">firstLine (warehouse)</label>
      <input class="form-input" id="pickup-first-line" value="${pickup.firstLine}" placeholder="Street address">
    </div>

    <p class="section-title">2 — Drop-off override</p>
    <p class="hint">Prefilled from order — add cityId + districtId from Bosta if needed.</p>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">cityId</label>
        <input class="form-input mono" id="dropoff-city-id" value="${pickup.cityId || ''}" placeholder="FceDyHXwpSYYF9zGW">
      </div>
      <div class="form-group">
        <label class="form-label">City</label>
        <input class="form-input" id="dropoff-city" value="${order.shippingAddress?.governorateName || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Zone</label>
        <input class="form-input" id="dropoff-zone" value="${order.shippingAddress?.districtName || order.shippingAddress?.governorateName || ''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">districtId</label>
        <input class="form-input mono" id="dropoff-district-id" value="${pickup.districtId}" placeholder="e.g. Iy7-lFD0BE0">
      </div>
      <div class="form-group">
        <label class="form-label">districtName</label>
        <input class="form-input" id="dropoff-district-name" value="${order.shippingAddress?.districtName || ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">firstLine</label>
      <input class="form-input" id="dropoff-first-line" value="${order.shippingAddress?.addressLine || ''}">
    </div>

    <p class="section-title">3 — Package &amp; create shipment</p>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Package type</label>
        <select class="form-input" id="pkg-type">
          ${PACKAGE_TYPES.map((t) => `<option value="${t}" ${t === 'Parcel' ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Size</label>
        <select class="form-input" id="pkg-size">
          ${PACKAGE_SIZES.map((s) => `<option value="${s}" ${s === 'MEDIUM' ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Items count</label>
        <input class="form-input" id="pkg-count" type="number" min="1" max="999" value="${itemCount}">
      </div>
      <div class="form-group">
        <label class="form-label">COD (read-only)</label>
        <input class="form-input" readonly value="${order.paymentMethod === 'cod' ? order.totalPrice : 0} EGP">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Package description</label>
      <textarea class="form-input form-textarea" id="pkg-desc" rows="2" maxlength="500">${pkgDesc}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Shipment notes (optional)</label>
      <input class="form-input" id="ship-notes" placeholder="e.g. Call before delivery">
    </div>
    <div class="btn-row">
      <button class="btn-primary" onclick="createShipment()" ${canShip ? '' : 'disabled'} title="${canShip ? '' : 'Only pending/processing without existing shipment'}">
        <i class="ti ti-package"></i> Create Bosta shipment
      </button>
      <button class="btn-secondary" onclick="refreshSelectedOrder()"><i class="ti ti-refresh"></i> Reload order</button>
    </div>

    <p class="section-title">4 — Track shipment</p>
    <div class="btn-row">
      <button class="btn-secondary" onclick="trackShipment()" ${hasShipment ? '' : 'disabled'}>
        <i class="ti ti-map-pin"></i> Track on Bosta
      </button>
      <button class="btn-danger" onclick="cancelShipment()" ${order.bostaDeliveryId ? '' : 'disabled'}>
        <i class="ti ti-x"></i> Cancel shipment
      </button>
    </div>
    <div id="track-output" class="track-box">${hasShipment ? 'Click “Track on Bosta” to load live status.' : 'No shipment yet.'}</div>

    <p class="section-title">5 — Simulate Bosta webhook (dashboard)</p>
    <p class="hint">POST /webhooks/bosta — updates bostaStatus and order on DELIVERED / RETURNED.</p>
    <div class="form-group">
      <label class="form-label">State value</label>
      <select class="form-input" id="webhook-state" onchange="selectedWebhookState=this.value">
        ${BOSTA_STATES.map((s) => `<option value="${s}" ${s === selectedWebhookState ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="state-chips">${chips}</div>
    <div class="btn-row">
      <button class="btn-primary" onclick="simulateWebhook()"><i class="ti ti-webhook"></i> Send webhook</button>
    </div>
  `;
}

function pickState(state) {
  selectedWebhookState = state;
  const sel = document.getElementById('webhook-state');
  if (sel) sel.value = state;
  document.querySelectorAll('.state-chip').forEach((el) => {
    el.classList.toggle('sel', el.textContent === state);
  });
}

async function loadOrders() {
  if (!token) {
    openLogin();
    return;
  }

  const status = document.getElementById('filter-status').value;
  const qs = new URLSearchParams({ limit: '50', sort: '-createdAt' });
  if (status) qs.set('orderStatus', status);

  const { ok, json } = await api('GET', `/orders?${qs}`);
  if (!ok) {
    showToast(json?.message || 'Failed to load orders', 'err');
    return;
  }

  orders = json.data || [];
  renderOrdersTable();

  if (selectedOrderId) {
    const still = orders.find((o) => o._id === selectedOrderId);
    if (still) renderDetail(still);
    else await refreshSelectedOrder();
  }
}

async function fetchOrder(orderId) {
  const { ok, json } = await api('GET', `/orders/${orderId}`);
  if (!ok) return null;
  return json.data;
}

async function selectOrder(orderId) {
  selectedOrderId = orderId;
  renderOrdersTable();
  const cached = orders.find((o) => o._id === orderId);
  if (cached) renderDetail(cached);
  const fresh = await fetchOrder(orderId);
  if (fresh) {
    const idx = orders.findIndex((o) => o._id === orderId);
    if (idx >= 0) orders[idx] = fresh;
    else orders.unshift(fresh);
    renderDetail(fresh);
    renderOrdersTable();
  }
}

async function refreshSelectedOrder() {
  if (!selectedOrderId) return;
  const fresh = await fetchOrder(selectedOrderId);
  if (fresh) {
    const idx = orders.findIndex((o) => o._id === selectedOrderId);
    if (idx >= 0) orders[idx] = fresh;
    renderDetail(fresh);
    renderOrdersTable();
    showToast('Order refreshed');
  }
}

function readBostaAddressForm(prefix) {
  const districtId = document.getElementById(`${prefix}-district-id`)?.value?.trim();
  const districtName = document.getElementById(`${prefix}-district-name`)?.value?.trim();
  const cityId = document.getElementById(`${prefix}-city-id`)?.value?.trim();
  const addr = {
    city: document.getElementById(`${prefix}-city`)?.value?.trim(),
    zone: document.getElementById(`${prefix}-zone`)?.value?.trim(),
    firstLine: document.getElementById(`${prefix}-first-line`)?.value?.trim(),
  };
  if (cityId) addr.cityId = cityId;
  if (districtId) {
    addr.districtId = districtId;
  } else if (districtName) {
    addr.districtName = districtName;
  }
  return addr;
}

async function createShipment() {
  if (!selectedOrderId) return;
  const pickupAddress = readBostaAddressForm('pickup');
  if (!pickupAddress.firstLine) {
    pickupAddress.firstLine = defaultBostaPickup().firstLine;
  }
  if (!pickupAddress.city || !pickupAddress.firstLine) {
    showToast('Pickup city and firstLine are required', 'err');
    return;
  }
  saveBostaPickupDraft(pickupAddress);
  if (!pickupAddress.districtId && !pickupAddress.districtName) {
    showToast('Pickup needs districtId or districtName', 'err');
    return;
  }

  const dropOffAddress = readBostaAddressForm('dropoff');
  if (!dropOffAddress.districtId && !dropOffAddress.districtName) {
    if (pickupAddress.districtId) dropOffAddress.districtId = pickupAddress.districtId;
    if (pickupAddress.cityId) dropOffAddress.cityId = pickupAddress.cityId;
    if (pickupAddress.districtName) dropOffAddress.districtName = pickupAddress.districtName;
  }
  if (dropOffAddress.city && dropOffAddress.firstLine && !dropOffAddress.districtId && !dropOffAddress.districtName) {
    showToast('Drop-off needs districtId (use same as pickup or paste Iy7-lFD0BE0)', 'err');
    return;
  }
  const notes = document.getElementById('ship-notes')?.value?.trim() || '';
  const itemsCount = Number(document.getElementById('pkg-count')?.value);
  const body = {
    notes,
    pickupAddress,
    dropOffAddress:
      dropOffAddress.city && dropOffAddress.firstLine ? dropOffAddress : undefined,
    packageType: document.getElementById('pkg-type')?.value || 'Parcel',
    size: document.getElementById('pkg-size')?.value || 'MEDIUM',
    itemsCount: Number.isFinite(itemsCount) && itemsCount > 0 ? itemsCount : undefined,
    description: document.getElementById('pkg-desc')?.value?.trim() || undefined,
  };
  const { ok, json } = await api('POST', `/bosta/orders/${selectedOrderId}/ship`, body);
  if (!ok) {
    showToast(json?.message || 'Create shipment failed', 'err');
    return;
  }
  showToast(`Shipment created · ${json.data?.bostaTrackingNumber || 'OK'}`);
  await refreshSelectedOrder();
  await loadOrders();
}

async function trackShipment() {
  if (!selectedOrderId) return;
  const { ok, json } = await api('GET', `/bosta/orders/${selectedOrderId}/track`);
  const box = document.getElementById('track-output');
  if (!ok) {
    box.className = 'track-box';
    box.textContent = json?.message || 'Track failed';
    showToast(json?.message || 'Track failed', 'err');
    return;
  }
  box.className = 'track-box has-data';
  box.textContent = JSON.stringify(json.data, null, 2);
  showToast('Tracking loaded');
}

async function cancelShipment() {
  if (!selectedOrderId) return;
  if (!confirm('Cancel Bosta shipment for this order?')) return;
  const { ok, json } = await api('DELETE', `/bosta/orders/${selectedOrderId}/ship`);
  if (!ok) {
    showToast(json?.message || 'Cancel failed', 'err');
    return;
  }
  showToast('Shipment cancelled');
  document.getElementById('track-output').textContent = 'Shipment cancelled.';
  await refreshSelectedOrder();
  await loadOrders();
}

async function simulateWebhook() {
  if (!selectedOrderId) {
    showToast('Select an order first', 'err');
    return;
  }
  const state = document.getElementById('webhook-state')?.value || selectedWebhookState;
  selectedWebhookState = state;

  const { ok, json } = await api(
    'POST',
    '/webhooks/bosta',
    {
      businessReference: selectedOrderId,
      state: { value: state },
    },
    { auth: false }
  );

  if (!ok) {
    showToast('Webhook request failed', 'err');
    return;
  }

  showToast(`Webhook sent: ${state}`);
  await refreshSelectedOrder();
  await loadOrders();
}

updateLoginUI();
if (token) loadOrders();

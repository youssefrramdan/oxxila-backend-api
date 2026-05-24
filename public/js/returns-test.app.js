// public/js/returns-test.app.js
let token = localStorage.getItem('oxxila_token') || '';
let eligibleOrders = [];
let countries = [];
let governorates = [];

const BASE = () =>
  (document.getElementById('base-url')?.value || 'http://localhost:3000/api/v1').replace(/\/$/, '');

function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (isErr ? 'err' : 'ok');
  setTimeout(() => el.classList.remove('show'), 3200);
}

async function api(method, path, body, pub = false) {
  const headers = {};
  if (!pub && token) headers.Authorization = 'Bearer ' + token;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.message || 'Request failed');
  return json;
}

function toggleLogin() {
  if (token) {
    token = '';
    localStorage.removeItem('oxxila_token');
    document.getElementById('login-btn').textContent = 'Login';
    toast('Logged out');
    return;
  }
  const email = prompt('Email:');
  const password = prompt('Password:');
  if (!email) return;
  api('POST', '/auth/login', { email, password }, true)
    .then((data) => {
      token = data.data?.accessToken || data.accessToken;
      if (!token) throw new Error('No token in response');
      localStorage.setItem('oxxila_token', token);
      document.getElementById('login-btn').textContent = 'Logged in';
      toast('Logged in');
      loadMyReturns();
      loadEligible();
      loadCountries();
    })
    .catch((e) => toast(e.message, true));
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('tab-list').classList.toggle('hidden', tab !== 'list');
  document.getElementById('tab-new').classList.toggle('hidden', tab !== 'new');
  if (tab === 'new' && token) loadEligible();
}

async function loadMyReturns() {
  if (!token) return;
  try {
    const { data } = await api('GET', '/returns/my-returns?limit=20&sort=-createdAt');
    const list = document.getElementById('my-returns-list');
    if (!data?.length) {
      list.innerHTML = '<p style="color:var(--muted)">No return requests yet.</p>';
      return;
    }
    list.innerHTML = data
      .map((r) => {
        const codCredit =
          r.refundStatus === 'refunded' && r.order?.paymentMethod === 'cod'
            ? ' · store credit issued'
            : '';
        return `<div class="card">
          <strong>#${String(r._id).slice(-6)}</strong> · ${r.refundStatus} · ${r.refundAmount} EGP${codCredit}
          <div style="color:var(--muted);margin-top:4px">Order ${String(r.order?._id || r.order).slice(-6)} · ${r.reason}</div>
        </div>`;
      })
      .join('');
  } catch (e) {
    toast(e.message, true);
  }
}

async function loadEligible(page = 1) {
  if (!token) return;
  try {
    const res = await api('GET', `/returns/eligible-orders?limit=50&page=${page}&sort=-deliveredAt`);
    eligibleOrders = page === 1 ? res.data || [] : [...eligibleOrders, ...(res.data || [])];
    if (res.pagination?.nextPage) {
      await loadEligible(res.pagination.nextPage);
      return;
    }
    const sel = document.getElementById('eligible-order');
    sel.innerHTML =
      '<option value="">Select order</option>' +
      eligibleOrders
        .map((o) => `<option value="${o._id}">#${String(o._id).slice(-6)} — ${o.totalPrice} EGP</option>`)
        .join('');
  } catch (e) {
    toast(e.message, true);
  }
}

function onOrderPick() {
  const id = document.getElementById('eligible-order').value;
  const order = eligibleOrders.find((o) => o._id === id);
  const box = document.getElementById('return-lines');
  if (!order) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = order.items
    .map(
      (it) => `<div class="line-item">
        <label style="flex:1">${it.name} (max ${it.returnableQuantity})</label>
        <input type="number" min="0" max="${it.returnableQuantity}" value="0" data-item="${it.orderItemId}" style="width:60px" class="form-input" style="margin:0">
      </div>`
    )
    .join('');
}

async function loadCountries() {
  try {
    const { data } = await api('GET', '/shipping/countries', null, true);
    countries = data || [];
    const sel = document.getElementById('country');
    sel.innerHTML = countries.map((c) => `<option value="${c._id}">${c.name}</option>`).join('');
    if (countries[0]) onCountryChange();
  } catch (e) {
    toast(e.message, true);
  }
}

async function onCountryChange() {
  const countryId = document.getElementById('country').value;
  const { data } = await api('GET', `/shipping/countries/${countryId}/governorates`, null, true);
  governorates = data || [];
  const sel = document.getElementById('governorate');
  sel.disabled = false;
  sel.innerHTML = governorates.map((g) => `<option value="${g._id}">${g.name}</option>`).join('');
  if (governorates[0]) onGovernorateChange();
}

async function onGovernorateChange() {
  const govId = document.getElementById('governorate').value;
  const gov = governorates.find((g) => g._id === govId);
  const { data } = await api('GET', `/shipping/governorates/${govId}/zones`, null, true);
  const sel = document.getElementById('district');
  sel.disabled = false;
  if (data?.hasDistricts) {
    sel.innerHTML =
      (data.districts || []).map((d) => `<option value="${d._id}">${d.name}</option>`).join('') +
      `<option value="other">Other</option>`;
  } else {
    sel.innerHTML = '<option value="other">Other</option>';
  }
}

async function submitReturn() {
  if (!token) return toast('Login first', true);
  const orderId = document.getElementById('eligible-order').value;
  if (!orderId) return toast('Select an order', true);

  const order = eligibleOrders.find((o) => o._id === orderId);
  const items = [];
  document.querySelectorAll('[data-item]').forEach((inp) => {
    const q = Number(inp.value);
    if (q > 0) items.push({ orderItemId: inp.dataset.item, quantity: q });
  });
  if (!items.length) return toast('Select at least one item quantity', true);

  const gov = governorates.find((g) => g._id === document.getElementById('governorate').value);
  const districtSel = document.getElementById('district');
  const districtId = districtSel.value;
  const districtLabel = districtSel.options[districtSel.selectedIndex]?.text || '';

  const pickupAddress = {
    firstLine: document.getElementById('first-line').value.trim(),
    secondLine: document.getElementById('second-line').value.trim(),
    city: gov?.name || 'Cairo',
    governorateName: gov?.name || '',
    governorateId: gov?._id,
    districtId: districtId || 'other',
    districtName: districtId === 'other' ? 'Other' : districtLabel,
  };

  const reason = document.getElementById('reason').value;
  const proofRequired = ['damaged_item', 'wrong_product', 'allergic_reaction'].includes(reason);
  const files = document.getElementById('proof-files').files;

  try {
    if (proofRequired && files.length) {
      const fd = new FormData();
      fd.append('order', orderId);
      fd.append('items', JSON.stringify(items));
      fd.append('reason', reason);
      fd.append('note', document.getElementById('note').value);
      fd.append('pickupAddress', JSON.stringify(pickupAddress));
      for (let i = 0; i < Math.min(5, files.length); i++) fd.append('proofImages', files[i]);
      await api('POST', '/returns', fd);
    } else {
      await api('POST', '/returns', {
        order: orderId,
        items,
        reason,
        note: document.getElementById('note').value,
        pickupAddress,
      });
    }
    toast('Return submitted');
    switchTab('list');
    loadMyReturns();
  } catch (e) {
    toast(e.message, true);
  }
}

if (token) {
  document.getElementById('login-btn').textContent = 'Logged in';
  loadMyReturns();
  loadCountries();
}

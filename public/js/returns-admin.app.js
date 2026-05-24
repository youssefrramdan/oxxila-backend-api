// public/js/returns-admin.app.js
let token = localStorage.getItem('oxxila_admin_token') || '';
let returns = [];
let selected = null;
let statusFilter = 'all';
let returnsPage = 1;
let returnsPagination = null;
let bostaCarriers = [];
let dropoffCache = {};

const apiBase = () =>
  (
    document.getElementById('api-base')?.value ||
    localStorage.getItem('oxxila_api_base') ||
    'http://localhost:3000/api/v1'
  ).replace(/\/$/, '');

function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (isErr ? 'err' : 'ok');
  setTimeout(() => el.classList.remove('show'), 3200);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(apiBase() + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || res.statusText || 'Request failed');
  }
  return data;
}

function saveAuth() {
  token = document.getElementById('admin-token').value.trim();
  localStorage.setItem('oxxila_admin_token', token);
  localStorage.setItem('oxxila_api_base', apiBase());
  toast('Auth saved');
  init();
}

function shortId(id) {
  return String(id || '').slice(-6).toUpperCase();
}

function statusPill(status) {
  return `<span class="status-pill st-${status}">${esc(status)}</span>`;
}

function buildTabs() {
  const statuses = ['all', 'pending', 'approved', 'picked_up', 'received', 'refunded', 'rejected'];
  document.getElementById('status-tabs').innerHTML = statuses
    .map(
      (s) =>
        `<div class="tab ${statusFilter === s ? 'active' : ''}" onclick="setFilter('${s}')">${s === 'all' ? 'All' : s}</div>`
    )
    .join('');
}

function setFilter(s) {
  statusFilter = s;
  returnsPage = 1;
  buildTabs();
  loadReturns(1);
}

async function loadReturns(page = returnsPage) {
  try {
    returnsPage = page;
    let path = `/returns?limit=25&page=${page}&sort=-createdAt`;
    if (statusFilter !== 'all') path += '&refundStatus=' + statusFilter;
    const orderId = new URLSearchParams(location.search).get('orderId');
    const res = await api('GET', path);
    returns = res.data || [];
    returnsPagination = res.pagination || null;
    if (orderId) returns = returns.filter((r) => String(r.order?._id || r.order) === orderId);
    renderList();
    if (selected) {
      const fresh = returns.find((r) => r._id === selected._id);
      if (fresh) selectReturn(fresh._id);
    }
  } catch (e) {
    toast(e.message, true);
    returns = [];
    renderList();
  }
}

function renderReturnsPagination() {
  const el = document.getElementById('returns-pagination');
  if (!el) return;
  const p = returnsPagination;
  if (!p || p.numberOfPages <= 1) {
    el.innerHTML = p
      ? `<span class="muted">Page ${p.currentPage} · ${p.totalDocuments} total</span>`
      : '';
    return;
  }
  el.innerHTML = `
    <button class="btn btn-secondary" ${p.prevPage ? '' : 'disabled'} onclick="loadReturns(${p.prevPage})">Prev</button>
    <span class="muted">Page ${p.currentPage} / ${p.numberOfPages}</span>
    <button class="btn btn-secondary" ${p.nextPage ? '' : 'disabled'} onclick="loadReturns(${p.nextPage})">Next</button>
  `;
}

function renderList() {
  const body = document.getElementById('returns-body');
  renderReturnsPagination();
  if (!returns.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">No returns</td></tr>';
    return;
  }
  body.innerHTML = returns
    .map((r) => {
      const sel = selected?._id === r._id ? ' class="sel"' : '';
      return `<tr${sel} onclick="selectReturn('${r._id}')">
        <td>#${shortId(r._id)}</td>
        <td>${esc(r.user?.name || r.user?.email || '—')}</td>
        <td>#${shortId(r.order?._id || r.order)}</td>
        <td>${r.refundAmount} EGP</td>
        <td>${statusPill(r.refundStatus)}</td>
      </tr>`;
    })
    .join('');
}

async function selectReturn(id) {
  try {
    const { data } = await api('GET', '/returns/' + id);
    selected = data;
    renderList();
    renderDetail();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderDetail() {
  const panel = document.getElementById('detail-panel');
  const r = selected;
  if (!r) {
    panel.innerHTML = '<p class="muted">Select a return request</p>';
    return;
  }
  const pa = r.pickupAddress || {};
  const items = (r.items || [])
    .map((i) => `<li>${esc(i.name)} × ${i.quantity} (${i.price} EGP)</li>`)
    .join('');
  const proofs = (r.proofImages || [])
    .map((p) => `<a href="${esc(p.url)}" target="_blank">proof</a>`)
    .join(' ');

  const nextActions = [];
  if (r.refundStatus === 'pending') {
    nextActions.push(`<button class="btn btn-primary" onclick="openApprove()">Approve</button>`);
    nextActions.push(`<button class="btn btn-secondary" onclick="patchStatus('rejected')">Reject</button>`);
  }
  if (r.refundStatus === 'approved') {
    if (r.logisticsHandler === 'bosta' && !r.bostaExternalId) {
      nextActions.push(`<button class="btn btn-primary" onclick="scheduleBosta()">Schedule Bosta</button>`);
    }
    nextActions.push(`<button class="btn btn-secondary" onclick="patchStatus('picked_up')">Mark picked up</button>`);
  }
  if (r.refundStatus === 'picked_up') {
    nextActions.push(`<button class="btn btn-secondary" onclick="patchStatus('received')">Mark received</button>`);
  }
  if (r.refundStatus === 'received') {
    nextActions.push(`<button class="btn btn-primary" onclick="openRefund()">Refund</button>`);
  }

  panel.innerHTML = `
    <h3>Return #${shortId(r._id)}</h3>
    <p class="muted">Order #${shortId(r.order?._id || r.order)} · ${statusPill(r.refundStatus)}</p>
    <p style="margin:8px 0"><strong>Refund:</strong> ${r.refundAmount} EGP</p>
    <p><strong>Reason:</strong> ${esc(r.reason)}</p>
    <p class="muted">${esc(r.note || '')}</p>
    <p><strong>Logistics:</strong> ${esc(r.logisticsHandler || '—')}</p>
    ${r.dropOffPickup ? `<p><strong>Drop-off:</strong> ${esc(r.dropOffPickup?.locationName || r.dropOffSnapshot?.locationName || '')}</p>` : ''}
    ${r.bostaTrackingNumber ? `<p><strong>Bosta tracking:</strong> ${esc(r.bostaTrackingNumber)}</p>` : ''}
    <p><strong>Customer pickup address</strong></p>
    <p class="muted">${esc(pa.firstLine)}<br>${esc(pa.city)}, ${esc(pa.governorateName)}</p>
    <ul style="margin:10px 0;padding-left:18px;font-size:12px">${items}</ul>
    <p>${proofs || '<span class="muted">No proof images</span>'}</p>
    <div class="actions">${nextActions.join('')}</div>
  `;
}

async function loadBostaCarriers() {
  try {
    const { data } = await api('GET', '/admin/carriers');
    bostaCarriers = (data || []).filter((c) => c.apiProvider === 'bosta' && c.type === 'api');
    const sel = document.getElementById('approve-carrier');
    sel.innerHTML = bostaCarriers
      .map((c) => `<option value="${c._id}">${esc(c.name)}</option>`)
      .join('');
    if (bostaCarriers.length && document.getElementById('approve-handler').value === 'bosta') {
      await loadDropoffs(bostaCarriers[0]._id);
    }
  } catch (e) {
    toast(e.message, true);
  }
}

async function loadDropoffs(carrierId) {
  if (dropoffCache[carrierId]) {
    fillDropoff(dropoffCache[carrierId]);
    return;
  }
  const { data } = await api('GET', '/admin/carriers/' + carrierId + '/pickups');
  dropoffCache[carrierId] = data || [];
  fillDropoff(dropoffCache[carrierId]);
}

function fillDropoff(list) {
  const sel = document.getElementById('approve-dropoff');
  sel.innerHTML = (list || [])
    .map(
      (p) =>
        `<option value="${p._id}">${esc(p.locationName)}${p.isDefault ? ' (default)' : ''}</option>`
    )
    .join('');
}

function onHandlerChange() {
  const wrap = document.getElementById('dropoff-wrap');
  const isBosta = document.getElementById('approve-handler').value === 'bosta';
  wrap.style.display = isBosta ? 'block' : 'none';
  if (isBosta && bostaCarriers.length) {
    const carrierId = document.getElementById('approve-carrier').value || bostaCarriers[0]._id;
    loadDropoffs(carrierId);
  }
}

function openApprove() {
  document.getElementById('approve-modal').classList.add('open');
  loadBostaCarriers();
  onHandlerChange();
}

function closeApprove() {
  document.getElementById('approve-modal').classList.remove('open');
}

async function confirmApprove() {
  const handler = document.getElementById('approve-handler').value;
  const body = { refundStatus: 'approved', logisticsHandler: handler };
  if (handler === 'bosta') {
    body.carrierId = document.getElementById('approve-carrier').value;
    body.dropOffPickupId = document.getElementById('approve-dropoff').value;
  }
  try {
    await api('PATCH', '/returns/' + selected._id + '/status', body);
    closeApprove();
    toast('Approved');
    await selectReturn(selected._id);
    await loadReturns();
  } catch (e) {
    toast(e.message, true);
  }
}

function openRefund() {
  const amount = selected?.refundAmount ?? 0;
  const isCod = selected?.order?.paymentMethod === 'cod';
  const msg = isCod
    ? `Issue store credit of ${amount} EGP to the customer account? It will apply as a discount on their next order.`
    : `Process gateway refund of ${amount} EGP and restock items?`;
  document.getElementById('refund-modal-message').textContent = msg;
  document.getElementById('refund-modal').classList.add('open');
}

function closeRefund() {
  document.getElementById('refund-modal').classList.remove('open');
}

async function confirmRefund() {
  try {
    const { data } = await api('PATCH', '/returns/' + selected._id + '/status', {
      refundStatus: 'refunded',
    });
    closeRefund();
    const creditMsg =
      data?.storeCreditIssued && data?.refundAmount != null
        ? `Refunded — ${data.refundAmount} EGP store credit issued`
        : 'Refunded';
    toast(creditMsg);
    await loadReturns();
    await selectReturn(selected._id);
  } catch (e) {
    toast(e.message, true);
  }
}

async function patchStatus(status) {
  if (status === 'rejected') {
    const adminNote = prompt('Rejection note (optional):') || '';
    try {
      await api('PATCH', '/returns/' + selected._id + '/status', {
        refundStatus: 'rejected',
        adminNote,
      });
      toast('Rejected');
      await loadReturns();
      await selectReturn(selected._id);
    } catch (e) {
      toast(e.message, true);
    }
    return;
  }
  try {
    await api('PATCH', '/returns/' + selected._id + '/status', { refundStatus: status });
    toast('Updated');
    await loadReturns();
    await selectReturn(selected._id);
  } catch (e) {
    toast(e.message, true);
  }
}

async function scheduleBosta() {
  try {
    await api('POST', '/returns/' + selected._id + '/bosta/schedule');
    toast('Bosta scheduled');
    await selectReturn(selected._id);
  } catch (e) {
    toast(e.message, true);
  }
}

document.getElementById('approve-carrier')?.addEventListener('change', (e) => {
  loadDropoffs(e.target.value);
});

function init() {
  const base = document.getElementById('api-base');
  const tok = document.getElementById('admin-token');
  if (localStorage.getItem('oxxila_api_base')) base.value = localStorage.getItem('oxxila_api_base');
  if (token) tok.value = token;
  buildTabs();
  if (token) loadReturns();
}

init();

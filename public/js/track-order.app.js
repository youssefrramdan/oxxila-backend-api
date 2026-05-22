// public/js/track-order.app.js
const BASE = () =>
  (localStorage.getItem('oxxila_base') || '/api/v1').replace(/\/$/, '');

const token = () => localStorage.getItem('oxxila_token') || '';

let toastTimer;
function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

async function api(method, path, auth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(`${BASE()}${path}`, { method, headers });
  return res.json();
}

function renderTrack(data) {
  const wrap = document.getElementById('track-result');
  const empty = document.getElementById('track-empty');
  if (!data) {
    wrap.style.display = 'none';
    empty.style.display = '';
    empty.textContent = 'No tracking information found.';
    return;
  }

  empty.style.display = 'none';
  wrap.style.display = '';

  const order = {
    orderStatus: data.orderStatus,
    tracking: data.tracking,
    shipment: data.shipment,
  };

  document.getElementById('track-banner').innerHTML =
    window.OxxilaTracking.renderOrderStatusBanner(order);

  document.getElementById('track-stepper').innerHTML =
    window.OxxilaTracking.renderOrderTracker(order);

  const tn = data.tracking?.trackingNumber;
  const lines = [
    `Order: <strong>${data.orderId}</strong>`,
    `Status: <strong>${data.orderStatusLabel || data.orderStatus}</strong>`,
    data.paymentStatusLabel
      ? `Payment: <strong>${data.paymentStatusLabel}</strong> (${data.paymentMethod || ''})`
      : '',
    data.shippingAddress?.governorateName
      ? `Ship to: ${data.shippingAddress.governorateName}${data.shippingAddress.districtLabel ? ' · ' + data.shippingAddress.districtLabel : ''}`
      : '',
    tn ? `Tracking: <strong class="track-mono">${tn}</strong>` : 'Tracking number will appear after the carrier is assigned.',
    data.shipment?.carrierName ? `Carrier: ${data.shipment.carrierName}` : '',
  ].filter(Boolean);

  document.getElementById('track-details').innerHTML = lines.join('<br>');
}

async function loadByOrderId(orderId) {
  const json = await api('GET', `/track/order/${orderId}`, true);
  if (!json?.data) {
    showToast(json?.message || 'Could not load order', 'err');
    return;
  }
  renderTrack(json.data);
  if (json.data.tracking?.trackingNumber) {
    document.getElementById('tracking-input').value = json.data.tracking.trackingNumber;
  }
}

async function loadByTrackingNumber(trackingNumber) {
  const tn = encodeURIComponent(trackingNumber.trim());
  const json = await api('GET', `/track/${tn}`, false);
  if (!json?.data) {
    showToast(json?.message || 'Tracking not found', 'err');
    renderTrack(null);
    return;
  }
  renderTrack(json.data);
}

function searchTracking() {
  const tn = document.getElementById('tracking-input').value.trim();
  if (!tn) {
    showToast('Enter a tracking number', 'err');
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('tn', tn);
  url.searchParams.delete('orderId');
  window.history.replaceState({}, '', url);
  loadByTrackingNumber(tn);
}

function initFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');
  const tn = params.get('tn');

  if (orderId && token()) {
    loadByOrderId(orderId);
    return;
  }
  if (orderId && !token()) {
    document.getElementById('hint-line').textContent =
      'Log in on checkout to track by order link, or use your tracking number after shipment.';
  }
  if (tn) {
    document.getElementById('tracking-input').value = tn;
    loadByTrackingNumber(tn);
  }
}

window.searchTracking = searchTracking;
initFromQuery();

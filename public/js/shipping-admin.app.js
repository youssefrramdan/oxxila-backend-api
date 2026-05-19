// public/js/shipping-admin.app.js
let token = localStorage.getItem('oxxila_admin_token') || '';
let carriers = [];
let countries = [];
let governorates = [];
let districts = [];
let selCountry = null;
let selGov = null;
let carrierFilter = 'all';
let orderFilter = 'all';
let zoneMode = null;
let editingCarrierId = null;
let coverageOnlyMode = false;
let orders = [];
let assigningOrderId = null;
let assignDetail = null;
let pickupsReadOnly = [];
let bostaDistrictsCache = null;
const BOSTA_DISTRICTS_CACHE_KEY = 'oxxila_bosta_districts';
const BOSTA_DISTRICTS_CACHE_TS = 'oxxila_bosta_districts_ts';
const BOSTA_DISTRICTS_TTL_MS = 24 * 60 * 60 * 1000;

const apiBase = () =>
  (document.getElementById('api-base')?.value || localStorage.getItem('oxxila_api_base') || 'http://localhost:3000/api/v1').replace(/\/$/, '');

function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (isErr ? 'err' : 'ok');
  setTimeout(() => el.classList.remove('show'), 3200);
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
    const err = new Error(data.message || res.statusText || 'Request failed');
    err.data = data;
    throw err;
  }
  return data;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function selectedCountry() {
  return countries.find((c) => c._id === selCountry);
}

function selectedCurrency() {
  return selectedCountry()?.currency || 'EGP';
}

// â”€â”€ Auth â”€â”€
async function doLogin() {
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  try {
    const base = document.getElementById('api-base').value.trim();
    localStorage.setItem('oxxila_api_base', base);
    const bostaBase = document.getElementById('bosta-default-base')?.value?.trim();
    if (bostaBase) localStorage.setItem('oxxila_bosta_default_base', bostaBase);
    const data = await api('POST', '/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-pass').value,
    });
    token = data.data.accessToken;
    localStorage.setItem('oxxila_admin_token', token);
    document.getElementById('login-overlay').classList.add('hidden');
    await loadAll();
    toast('Logged in');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function loadAll() {
  await Promise.all([loadSettings(), loadCarriers(), loadZones(), loadOrders()]);
}

// â”€â”€ Settings â”€â”€
async function loadSettings() {
  const { data } = await api('GET', '/admin/shipping-settings');
  ['api', 'known', 'internal'].forEach((key) => {
    const card = document.getElementById('method-' + key);
    if (!card) return;
    const on = data[key] !== false;
    card.classList.toggle('on', on);
    card.querySelector('.toggle')?.classList.toggle('on', on);
  });
}

async function toggleMethodSetting(card) {
  const key = card.dataset.setting;
  if (!key) return;
  card.classList.toggle('on');
  card.querySelector('.toggle')?.classList.toggle('on');
  const payload = {
    api: document.getElementById('method-api').classList.contains('on'),
    known: document.getElementById('method-known').classList.contains('on'),
    internal: document.getElementById('method-internal').classList.contains('on'),
  };
  try {
    await api('PUT', '/admin/shipping-settings', payload);
    toast('Settings saved');
  } catch (e) {
    toast(e.message, true);
    await loadSettings();
  }
}

// â”€â”€ Carriers â”€â”€
async function loadCarriers() {
  const { data } = await api('GET', '/admin/carriers');
  carriers = (data || []).map((c) => ({
    id: c._id,
    name: c.name,
    code: c.code,
    type: c.type,
    provider: c.apiProvider,
    days: c.deliveryDays || 'n/a',
    coverage: c.coverage || [],
    active: c.isActive !== false,
    apiBaseUrl: c.apiBaseUrl || '',
    hasApiKey: c.hasApiKey === true,
  }));
  renderCarriers();
  populateCoverageCountries();
}

function renderCarriers() {
  const body = document.getElementById('carriers-body');
  const list = carrierFilter === 'all' ? carriers : carriers.filter((c) => c.type === carrierFilter);
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:24px">No carriers yet</td></tr>';
    return;
  }
  body.innerHTML = list
    .map(
      (c) => `
    <tr>
      <td><div class="carrier-name-cell"><div class="carrier-logo">${esc(c.code)}</div><div><div style="font-size:13px;font-weight:500">${esc(c.name)}</div><div style="font-size:10px;color:var(--muted)">${c.type === 'api' ? 'via ' + esc(c.provider || 'API') : c.type === 'internal' ? 'In-house staff' : 'Manual'}</div></div></div></td>
      <td><span class="type-badge type-${c.type}">${c.type === 'api' ? 'API' : c.type === 'known' ? 'Known' : 'Internal'}</span></td>
      <td style="font-size:12px;font-family:var(--mono)">${esc(c.days)}${c.days && c.days !== 'n/a' ? ' days' : ''}</td>
      <td><div class="coverage-tags">${(c.coverage || []).map((z) => `<span class="coverage-tag">${esc(z)}</span>`).join('') || '<span style="color:var(--muted2)">-</span>'}</div></td>
      <td><span class="status-badge ${c.active ? 'status-active' : 'status-inactive'}">${c.active ? 'Active' : 'Inactive'}</span></td>
      <td><div class="action-btns">
        <div class="icon-btn primary" title="Edit" onclick="openEditCarrier('${c.id}')"><i class="ti ti-pencil"></i></div>
        <div class="icon-btn" title="Coverage" onclick="openCoverageEditor('${c.id}')"><i class="ti ti-map-pin"></i></div>
        <div class="icon-btn danger" title="Delete" onclick="deleteCarrier('${c.id}')"><i class="ti ti-trash"></i></div>
      </div></td>
    </tr>`
    )
    .join('');
}

function filterCarriers(type, el) {
  document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
  el.classList.add('active');
  carrierFilter = type;
  renderCarriers();
}

function getSelectedDeliveryDays() {
  const chip = document.querySelector('.day-chip.sel');
  return chip ? chip.textContent.trim() : '1-2';
}

function openAddCarrier() {
  editingCarrierId = null;
  coverageOnlyMode = false;
  document.getElementById('carrier-drawer-title').textContent = 'Add Carrier';
  document.getElementById('carrier-name').value = '';
  document.getElementById('carrier-code').value = '';
  document.getElementById('carrier-code').readOnly = false;
  document.getElementById('carrier-type-sel').value = 'known';
  document.getElementById('carrier-type-sel').disabled = false;
  document.getElementById('carrier-api-provider').value = 'bosta';
  document.getElementById('carrier-api-base-url').value =
    localStorage.getItem('oxxila_bosta_default_base') || 'https://app.bosta.co';
  document.getElementById('carrier-api-key').value = '';
  document.querySelectorAll('.day-chip').forEach((c, i) => c.classList.toggle('sel', i === 0));
  document.getElementById('carrier-active-toggle').classList.add('on');
  document.getElementById('coverage-chips').innerHTML = '';
  document.getElementById('coverage-govs-wrap').style.display = 'none';
  document.getElementById('coverage-empty-msg').style.display = 'none';
  document.getElementById('coverage-country-sel').value = '';
  onCarrierTypeChange();
  populateCoverageCountries();
  openDrawer('carrier-drawer');
}

async function openEditCarrier(id) {
  const c = carriers.find((x) => x.id === id);
  if (!c) return;
  editingCarrierId = id;
  coverageOnlyMode = false;
  document.getElementById('carrier-drawer-title').textContent = 'Edit Carrier';
  document.getElementById('carrier-name').value = c.name;
  document.getElementById('carrier-code').value = c.code;
  document.getElementById('carrier-code').readOnly = true;
  document.getElementById('carrier-type-sel').value = c.type;
  document.getElementById('carrier-type-sel').disabled = true;
  document.getElementById('carrier-api-key').value = '';
  document.getElementById('carrier-api-key').placeholder =
    c.type === 'api' ? 'New API key (optional)' : 'Paste API key';
  if (c.type === 'api' && c.provider) {
    document.getElementById('carrier-api-provider').value = c.provider;
  } else {
    document.getElementById('carrier-api-provider').value = 'bosta';
  }
  if (c.type === 'api') {
    document.getElementById('carrier-api-base-url').value =
      c.apiBaseUrl || localStorage.getItem('oxxila_bosta_default_base') || 'https://app.bosta.co';
  }
  document.getElementById('carrier-active-toggle').classList.toggle('on', c.active);
  document.querySelectorAll('.day-chip').forEach((chip) => {
    const d = (c.days || '').replace(/\s*days$/i, '').trim();
    chip.classList.toggle('sel', d ? chip.textContent.trim() === d : chip.textContent.trim() === '1-2');
  });
  onCarrierTypeChange();
  onApiProviderChange();
  if (c.type === 'api' && c.provider === 'bosta') {
    document.getElementById('carrier-api-base-url').value =
      c.apiBaseUrl || localStorage.getItem('oxxila_bosta_default_base') || 'https://app.bosta.co';
    hideCarrierInfoPanel();
    hidePickupInlineForm();
    await loadPickups(id);
    if (c.hasApiKey) ensureBostaDistrictsCache(id, false).catch(() => {});
  }
  openDrawer('carrier-drawer');
}

async function openCoverageEditor(id) {
  editingCarrierId = id;
  coverageOnlyMode = true;
  const c = carriers.find((x) => x.id === id);
  document.getElementById('carrier-drawer-title').textContent = 'Coverage - ' + (c?.name || '');
  document.getElementById('carrier-name').closest('.form-group').style.display = 'none';
  document.getElementById('carrier-code').closest('.form-group').style.display = 'none';
  document.getElementById('carrier-type-sel').closest('.form-group').style.display = 'none';
  document.getElementById('api-section').style.display = 'none';
  document.getElementById('manual-section').style.display = '';
  const delSec = document.getElementById('delivery-days-section');
  if (delSec) delSec.style.display = 'none';
  const activeGrp = document.querySelector('.toggle-row')?.closest('.form-group');
  if (activeGrp) activeGrp.style.display = 'none';
  populateCoverageCountries();
  onCarrierTypeChange();
  openDrawer('carrier-drawer');
}

async function saveCarrier() {
  try {
    if (coverageOnlyMode && editingCarrierId) {
      const govIds = [...document.querySelectorAll('#coverage-chips .cov-chip.sel')].map((c) => c.dataset.id);
      await api('PUT', '/admin/carriers/' + editingCarrierId + '/coverage', { governorateIds: govIds });
      closeAll();
      resetCarrierDrawerForm();
      await loadCarriers();
      toast('Coverage updated');
      return;
    }

    const type = document.getElementById('carrier-type-sel').value;
    const name = document.getElementById('carrier-name').value.trim();
    const code = document.getElementById('carrier-code').value.trim();
    const isActive = document.getElementById('carrier-active-toggle').classList.contains('on');
    const govIds = [...document.querySelectorAll('#coverage-chips .cov-chip.sel')].map((c) => c.dataset.id);

    let carrierId = editingCarrierId;
    if (editingCarrierId) {
      const put = { name, isActive };
      if (type !== 'api') put.deliveryDays = getSelectedDeliveryDays();
      const newKey = document.getElementById('carrier-api-key').value.trim();
      if (type === 'api') {
        put.apiBaseUrl = document.getElementById('carrier-api-base-url').value.trim();
        if (newKey) put.apiKey = newKey;
      }
      const updated = await api('PUT', '/admin/carriers/' + editingCarrierId, put);
      if (updated.data?.syncSummary) {
        toast(
          `Synced: ${updated.data.syncSummary.count ?? 0} governorates, ` +
            `${updated.data.syncSummary.districtsCreated ?? 0} new districts`
        );
      }
    } else {
      const payload = { name, code, type, isActive };
      if (type === 'api') {
        payload.apiProvider = document.getElementById('carrier-api-provider').value;
        payload.apiKey = document.getElementById('carrier-api-key').value.trim();
        payload.apiBaseUrl = document.getElementById('carrier-api-base-url').value.trim();
      } else {
        payload.deliveryDays = getSelectedDeliveryDays();
      }
      const created = await api('POST', '/admin/carriers', payload);
      carrierId = created.data?.carrier?._id ?? created.data?._id;
      if (created.data?.syncSummary) {
        toast(`Bosta sync: ${created.data.syncSummary.count ?? 0} governorates covered`);
      }
    }

    if (carrierId && govIds.length && type !== 'api') {
      await api('PUT', '/admin/carriers/' + carrierId + '/coverage', { governorateIds: govIds });
    }

    closeAll();
    resetCarrierDrawerForm();
    await loadCarriers();
    await loadZones();
    if (carrierId && document.getElementById('carrier-api-provider')?.value === 'bosta') {
      await ensureBostaDistrictsCache(carrierId, true).catch(() => {});
    }
    if (!editingCarrierId && carrierId) toast('Carrier created');
    else if (editingCarrierId) toast('Carrier updated');
  } catch (e) {
    toast(e.message, true);
  }
}

function resetCarrierDrawerForm() {
  editingCarrierId = null;
  coverageOnlyMode = false;
  document.getElementById('carrier-name').closest('.form-group').style.display = '';
  document.getElementById('carrier-code').closest('.form-group').style.display = '';
  document.getElementById('carrier-code').readOnly = false;
  document.getElementById('carrier-type-sel').closest('.form-group').style.display = '';
  document.getElementById('carrier-type-sel').disabled = false;
  document.getElementById('carrier-api-key').placeholder = 'Paste API key';
  const delSec = document.getElementById('delivery-days-section');
  if (delSec) delSec.style.display = '';
  const activeGrp = document.querySelector('.toggle-row')?.closest('.form-group');
  if (activeGrp) activeGrp.style.display = '';
  onCarrierTypeChange();
}

async function deleteCarrier(id) {
  if (!confirm('Delete this carrier?')) return;
  try {
    await api('DELETE', '/admin/carriers/' + id);
    await loadCarriers();
    toast('Carrier deleted');
  } catch (e) {
    toast(e.message, true);
  }
}

function onCarrierTypeChange() {
  const v = document.getElementById('carrier-type-sel').value;
  const isApi = v === 'api';
  document.getElementById('api-section').style.display = isApi && !coverageOnlyMode ? '' : 'none';
  document.getElementById('manual-section').style.display = coverageOnlyMode || !isApi ? '' : 'none';
  const delSec = document.getElementById('delivery-days-section');
  if (delSec) {
    const hideDays = coverageOnlyMode || isApi;
    delSec.style.display = hideDays ? 'none' : '';
  }
  onApiProviderChange();
  hideCarrierInfoPanel();
  hidePickupInlineForm();
}

function onApiProviderChange() {
  const provider = document.getElementById('carrier-api-provider')?.value;
  const isBosta = provider === 'bosta';
  const pickupsSec = document.getElementById('bosta-pickups-section');
  if (pickupsSec) {
    pickupsSec.style.display = isBosta && editingCarrierId ? '' : 'none';
  }
}

function hideCarrierInfoPanel() {
  const panel = document.getElementById('carrier-info-panel');
  if (panel) panel.classList.add('hidden');
}

function hidePickupInlineForm() {
  const form = document.getElementById('pickup-inline-form');
  if (form) form.classList.add('hidden');
}

async function ensureBostaDistrictsCache(carrierId, forceRefresh = false) {
  if (!forceRefresh && bostaDistrictsCache?.length) return bostaDistrictsCache;

  if (!forceRefresh) {
    const ts = localStorage.getItem(BOSTA_DISTRICTS_CACHE_TS);
    const raw = localStorage.getItem(BOSTA_DISTRICTS_CACHE_KEY);
    if (raw && ts && Date.now() - Number(ts) < BOSTA_DISTRICTS_TTL_MS) {
      try {
        bostaDistrictsCache = JSON.parse(raw);
        if (bostaDistrictsCache?.length) return bostaDistrictsCache;
      } catch {
        /* ignore */
      }
    }
    try {
      const res = await fetch('/data/bosta-districts.json');
      if (res.ok) {
        const fileData = await res.json();
        if (Array.isArray(fileData) && fileData.length) {
          bostaDistrictsCache = fileData;
          return bostaDistrictsCache;
        }
      }
    } catch {
      /* optional static cache */
    }
  }

  const { data } = await api('GET', '/admin/carriers/' + carrierId + '/bosta/districts-lookup');
  bostaDistrictsCache = Array.isArray(data) ? data : [];
  localStorage.setItem(BOSTA_DISTRICTS_CACHE_KEY, JSON.stringify(bostaDistrictsCache));
  localStorage.setItem(BOSTA_DISTRICTS_CACHE_TS, String(Date.now()));
  return bostaDistrictsCache;
}

function populatePickupCitySelect() {
  const sel = document.getElementById('pickup-city-sel');
  if (!sel) return;
  const cities = bostaDistrictsCache || [];
  sel.innerHTML =
    '<option value="">Select city</option>' +
    cities
      .map((c) => {
        const label = c.cityOtherName ? `${c.cityName} (${c.cityOtherName})` : c.cityName;
        return `<option value="${esc(c.cityId)}" data-name="${esc(c.cityName)}">${esc(label)}</option>`;
      })
      .join('');
  document.getElementById('pickup-district-sel').innerHTML =
    '<option value="">Select district</option>';
}

function onPickupCityChange() {
  const citySel = document.getElementById('pickup-city-sel');
  const distSel = document.getElementById('pickup-district-sel');
  if (!citySel || !distSel) return;
  const cityId = citySel.value;
  const city = (bostaDistrictsCache || []).find((c) => c.cityId === cityId);
  const districts = city?.districts || [];
  distSel.innerHTML =
    '<option value="">Select district</option>' +
    districts
      .map((d) => {
        const label = d.districtName || d.zoneName;
        return `<option value="${esc(d.districtId)}" data-zone-id="${esc(d.zoneId || '')}">${esc(label)}</option>`;
      })
      .join('');
}

async function togglePickupInlineForm(show) {
  const form = document.getElementById('pickup-inline-form');
  if (!form) return;
  const shouldShow = show === undefined ? form.classList.contains('hidden') : show;
  if (!shouldShow) {
    form.classList.add('hidden');
    return;
  }
  if (!editingCarrierId) {
    toast('Save carrier with API key first', true);
    return;
  }
  hideCarrierInfoPanel();
  try {
    await ensureBostaDistrictsCache(editingCarrierId);
    populatePickupCitySelect();
    form.classList.remove('hidden');
  } catch (e) {
    toast(e.message || 'Could not load Bosta districts', true);
  }
}

async function submitPickupInlineForm() {
  if (!editingCarrierId) return;
  const locationName = document.getElementById('pickup-name')?.value?.trim();
  const firstLine = document.getElementById('pickup-first-line')?.value?.trim();
  const citySel = document.getElementById('pickup-city-sel');
  const distSel = document.getElementById('pickup-district-sel');
  const cityId = citySel?.value;
  const cityName = citySel?.selectedOptions?.[0]?.dataset?.name || '';
  const districtId = distSel?.value;
  const zoneId = distSel?.selectedOptions?.[0]?.dataset?.zoneId || '';
  const districtName = distSel?.selectedOptions?.[0]?.textContent?.trim() || '';
  const contactName = document.getElementById('pickup-contact-name')?.value?.trim() || 'Warehouse';
  const contactPhone = document.getElementById('pickup-contact-phone')?.value?.trim();
  const isDefault = document.getElementById('pickup-is-default')?.checked;

  if (!locationName || !firstLine || !cityId || !districtId || !contactPhone) {
    toast('Fill location, address, city, district, and phone', true);
    return;
  }

  try {
    await api('POST', '/admin/carriers/' + editingCarrierId + '/pickups', {
      locationName,
      contactPerson: { name: contactName, phone: contactPhone, email: '' },
      address: {
        firstLine,
        city: cityName,
        cityId,
        zoneId,
        districtId,
        districtName,
      },
      isDefault: !!isDefault,
    });
    hidePickupInlineForm();
    document.getElementById('pickup-name').value = '';
    document.getElementById('pickup-first-line').value = '';
    document.getElementById('pickup-contact-phone').value = '';
    await loadPickups(editingCarrierId);
    toast('Pickup added');
  } catch (e) {
    toast(e.message, true);
  }
}

function toggleCarrierInfoPanel() {
  const panel = document.getElementById('carrier-info-panel');
  if (!panel) return;
  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    return;
  }
  hidePickupInlineForm();
  const c = carriers.find((x) => x.id === editingCarrierId);
  const coverage = c?.coverage?.length
    ? c.coverage.map((g) => `<li>${esc(g)}</li>`).join('')
    : '<li style="color:var(--muted)">No governorates in coverage yet — save API key to sync</li>';

  const pickups =
    pickupsReadOnly.length > 0
      ? pickupsReadOnly
          .map(
            (p) =>
              `<li><strong>${esc(p.locationName)}</strong>${p.isDefault ? ' (default)' : ''} — ${esc(p.address?.city || '')}</li>`
          )
          .join('')
      : '<li style="color:var(--muted)">No pickup locations</li>';

  panel.innerHTML = `
    <h4>Covered governorates (read-only)</h4>
    <ul class="carrier-info-readonly">${coverage}</ul>
    <h4>Pickup locations (read-only)</h4>
    <ul class="carrier-info-readonly">${pickups}</ul>`;
  panel.classList.remove('hidden');
}

async function loadPickups(carrierId) {
  const el = document.getElementById('pickups-list');
  if (!el) return;
  try {
    const { data } = await api('GET', '/admin/carriers/' + carrierId + '/pickups');
    pickupsReadOnly = data || [];
    if (!pickupsReadOnly.length) {
      el.innerHTML = '<span style="color:var(--muted2)">No pickups yet — use + to add</span>';
      return;
    }
    el.innerHTML = pickupsReadOnly
      .map(
        (p) => `
      <div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:6px">
        <div style="min-width:0"><strong style="font-size:12px">${esc(p.locationName)}</strong>${p.isDefault ? ' <span class="bosta-badge">Default</span>' : ''}<br><span style="color:var(--muted);font-size:10px">${esc(p.address?.city)}</span></div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${!p.isDefault ? `<button type="button" class="btn btn-secondary" style="font-size:10px;padding:3px 6px" onclick="setDefaultPickup('${carrierId}','${p._id}')">Default</button>` : ''}
          <button type="button" class="btn btn-secondary" style="font-size:10px;padding:3px 6px" onclick="deletePickup('${carrierId}','${p._id}')">Del</button>
        </div>
      </div>`
      )
      .join('');
  } catch (e) {
    el.textContent = e.message;
    pickupsReadOnly = [];
  }
}

async function setDefaultPickup(carrierId, pickupId) {
  try {
    await api('PUT', '/admin/carriers/' + carrierId + '/pickups/' + pickupId + '/default');
    await loadPickups(carrierId);
    toast('Default pickup updated');
  } catch (e) {
    toast(e.message, true);
  }
}

async function deletePickup(carrierId, pickupId) {
  if (!confirm('Delete this pickup?')) return;
  try {
    await api('DELETE', '/admin/carriers/' + carrierId + '/pickups/' + pickupId);
    await loadPickups(carrierId);
    toast('Pickup deleted');
  } catch (e) {
    toast(e.message, true);
  }
}

function populateCoverageCountries() {
  const sel = document.getElementById('coverage-country-sel');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">- Select a country -</option>' +
    countries.map((c) => `<option value="${c._id}">${esc(c.name)} (${esc(c.currency)})</option>`).join('');
}

async function onCoverageCountryChange() {
  const countryId = document.getElementById('coverage-country-sel').value;
  const chipsWrap = document.getElementById('coverage-govs-wrap');
  const emptyMsg = document.getElementById('coverage-empty-msg');
  const chips = document.getElementById('coverage-chips');

  if (!countryId) {
    chipsWrap.style.display = 'none';
    emptyMsg.style.display = 'none';
    chips.innerHTML = '';
    return;
  }

  try {
    const { data } = await api('GET', '/admin/countries/' + countryId + '/governorates');
    if (!data.length) {
      chipsWrap.style.display = 'none';
      emptyMsg.style.display = '';
      chips.innerHTML = '';
      return;
    }
    emptyMsg.style.display = 'none';
    chipsWrap.style.display = '';
    chips.innerHTML = data
      .map((g) => `<div class="cov-chip" data-id="${g._id}" onclick="this.classList.toggle('sel')">${esc(g.name)}</div>`)
      .join('');
  } catch (e) {
    toast(e.message, true);
  }
}

function selectDays(el) {
  document.querySelectorAll('.day-chip').forEach((c) => c.classList.remove('sel'));
  el.classList.add('sel');
}

// â”€â”€ Zones â”€â”€
async function loadZones() {
  const { data: countryList } = await api('GET', '/admin/countries');
  countries = countryList || [];
  governorates = [];
  districts = [];
  for (const c of countries) {
    const { data: govs } = await api('GET', '/admin/countries/' + c._id + '/governorates');
    for (const g of govs || []) {
      governorates.push({
        _id: g._id,
        country: c._id,
        name: g.name,
        price: g.shippingPrice,
        bostaApiCovered: g.bostaApiCovered === true,
      });
      const { data: dists } = await api('GET', '/admin/governorates/' + g._id + '/districts');
      for (const d of dists || []) {
        districts.push({
          _id: d._id,
          governorate: g._id,
          name: d.name,
          price: d.shippingPrice,
          covered: d.isCovered !== false,
          bostaApiCovered: d.bostaApiCovered === true,
        });
      }
    }
  }
  renderCountries();
  renderGovs();
  renderDistricts();
}

function renderCountries() {
  const el = document.getElementById('countries-col');
  el.innerHTML =
    countries
      .map(
        (c) => `
    <div class="zone-row ${selCountry === c._id ? 'sel' : ''}" onclick="selectCountry('${c._id}')">
      <span class="zone-flag">${c.flag || ''}</span>
      <div style="flex:1"><div class="zone-name">${esc(c.name)}</div><div class="zone-sub">${esc(c.code)} | ${esc(c.currency)} | ${governorates.filter((g) => g.country === c._id).length} gov</div></div>
      <i class="ti ti-trash zone-del" onclick="event.stopPropagation();deleteCountry('${c._id}')"></i>
    </div>`
      )
      .join('') + `<div class="add-zone-btn" onclick="openAddCountry()"><i class="ti ti-plus"></i> Add country</div>`;
}

function selectCountry(id) {
  selCountry = id;
  selGov = null;
  renderCountries();
  renderGovs();
  renderDistricts();
}

function renderGovs() {
  const el = document.getElementById('govs-col');
  const lbl = document.getElementById('gov-col-label');
  const btn = document.getElementById('add-gov-btn');
  if (!selCountry) {
    el.innerHTML = '<div class="empty-zone"> Select a country</div>';
    lbl.textContent = 'Governorates';
    btn.style.display = 'none';
    return;
  }
  const c = countries.find((x) => x._id === selCountry);
  lbl.textContent = c?.name || 'Governorates';
  btn.style.display = '';
  const govs = governorates.filter((g) => g.country === selCountry);
  el.innerHTML =
    govs
      .map(
        (g) => `
    <div class="zone-row ${selGov === g._id ? 'sel' : ''}" onclick="selectGov('${g._id}')">
      <div style="flex:1"><div class="zone-name">${esc(g.name)}</div><div class="zone-sub">${districts.filter((d) => d.governorate === g._id).length} districts</div></div>
      <span class="zone-price">${g.price} ${esc(selectedCurrency())}</span>
      <i class="ti ti-trash zone-del" onclick="event.stopPropagation();deleteGov('${g._id}')"></i>
    </div>`
      )
      .join('') + `<div class="add-zone-btn" onclick="openAddGov()"><i class="ti ti-plus"></i> Add governorate</div>`;
}

function selectGov(id) {
  selGov = id;
  renderGovs();
  renderDistricts();
}

function renderDistricts() {
  const el = document.getElementById('dists-col');
  const lbl = document.getElementById('dist-col-label');
  const btn = document.getElementById('add-dist-btn');
  if (!selGov) {
    el.innerHTML = '<div class="empty-zone"> Select a governorate</div>';
    lbl.textContent = 'Districts';
    btn.style.display = 'none';
    return;
  }
  const g = governorates.find((x) => x._id === selGov);
  lbl.textContent = 'Districts of ' + (g?.name || '');
  btn.style.display = '';
  const dists = districts.filter((d) => d.governorate === selGov);
  const rows = dists
    .map(
      (d) => `
    <div class="district-row">
      <span class="cov-badge ${d.covered ? 'cov-yes' : 'cov-no'}" onclick="toggleCovered('${d._id}')">${d.covered ? 'Covered' : 'Closed'}</span>
      <span style="flex:1;font-size:13px">${esc(d.name)}${d.bostaApiCovered ? '<span class="bosta-badge">Bosta API</span>' : ''}</span>
      <input class="price-inp" type="number" value="${d.price}" onchange="updateDistPrice('${d._id}',this.value)">
      <i class="ti ti-trash zone-del" onclick="deleteDistrict('${d._id}')"></i>
    </div>`
    )
    .join('');
  const other = g
    ? `<div class="other-row"><div style="flex:1"><div class="other-label">Other</div><div class="other-sub">All other areas - fallback price</div></div><input class="price-inp" type="number" value="${g.price}" onchange="updateGovPrice('${g._id}',this.value)"></div>`
    : '';
  el.innerHTML = rows + (dists.length ? other : '');
}

async function toggleCovered(id) {
  const d = districts.find((x) => x._id === id);
  if (!d) return;
  try {
    await api('PUT', '/admin/districts/' + id, { isCovered: !d.covered });
    d.covered = !d.covered;
    renderDistricts();
  } catch (e) {
    toast(e.message, true);
  }
}

async function updateDistPrice(id, v) {
  try {
    await api('PUT', '/admin/districts/' + id, { shippingPrice: +v });
    const d = districts.find((x) => x._id === id);
    if (d) d.price = +v;
  } catch (e) {
    toast(e.message, true);
    renderDistricts();
  }
}

async function updateGovPrice(id, v) {
  try {
    await api('PUT', '/admin/governorates/' + id, { shippingPrice: +v });
    const g = governorates.find((x) => x._id === id);
    if (g) g.price = +v;
  } catch (e) {
    toast(e.message, true);
    renderDistricts();
  }
}

async function deleteCountry(id) {
  if (!confirm('Delete country and all zones?')) return;
  try {
    await api('DELETE', '/admin/countries/' + id);
    if (selCountry === id) {
      selCountry = null;
      selGov = null;
    }
    await loadZones();
    await loadCarriers();
    toast('Country deleted');
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteGov(id) {
  if (!confirm('Delete governorate and districts?')) return;
  try {
    await api('DELETE', '/admin/governorates/' + id);
    if (selGov === id) selGov = null;
    await loadZones();
    toast('Governorate deleted');
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteDistrict(id) {
  if (!confirm('Delete district?')) return;
  try {
    await api('DELETE', '/admin/districts/' + id);
    await loadZones();
    toast('District deleted');
  } catch (e) {
    toast(e.message, true);
  }
}

// —— Orders ——
async function loadOrders() {
  try {
    let path = '/orders?limit=50&sort=-createdAt';
    if (orderFilter !== 'all') path += '&orderStatus=' + orderFilter;
    const { data } = await api('GET', path);
    orders = data || [];
    updateOrdersBadge();
    renderOrders();
  } catch (e) {
    orders = [];
    renderOrders();
    toast(e.message, true);
  }
}

function updateOrdersBadge() {
  const badge = document.querySelector('.nav-item .nav-badge');
  if (!badge) return;
  const n = orders.filter(
    (o) =>
      ['pending', 'processing'].includes(o.orderStatus) && !o.fulfillment?.carrier
  ).length;
  badge.textContent = n > 0 ? String(n) : '0';
}

function orderStatusClass(status) {
  if (status === 'shipped') return 'os-shipped';
  if (status === 'delivered') return 'os-delivered';
  if (status === 'processing') return 'os-assigned';
  return 'os-pending';
}

function shortId(id) {
  return String(id || '').slice(-6).toUpperCase();
}

function renderOrders() {
  const body = document.getElementById('orders-body');
  let list = orders;
  if (orderFilter !== 'all') {
    list = orders.filter((o) => o.orderStatus === orderFilter);
  }
  if (!list.length) {
    body.innerHTML =
      '<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:28px">No orders found</td></tr>';
    return;
  }
  body.innerHTML = list
    .map((o) => {
      const user = o.user || {};
      const zone = `${o.shippingAddress?.governorateName || ''} / ${o.shippingAddress?.districtName || ''}`;
      const carrier = o.fulfillment?.carrierName || '—';
      const tracking =
        o.fulfillment?.trackingNumber ||
        o.fulfillment?.driverName ||
        '—';
      const canAssign =
        ['pending', 'processing'].includes(o.orderStatus) && !o.fulfillment?.carrier;
      return `
    <tr>
      <td style="font-family:var(--mono);font-size:12px">#${shortId(o._id)}</td>
      <td><div style="font-size:13px">${esc(user.name || '—')}</div><div style="font-size:10px;color:var(--muted)">${esc(user.email || '')}</div></td>
      <td style="font-size:12px">${esc(zone)}</td>
      <td style="font-size:12px">${esc(carrier)}</td>
      <td><span class="order-status ${orderStatusClass(o.orderStatus)}">${esc(o.orderStatus)}</span></td>
      <td style="font-size:11px;font-family:var(--mono);color:var(--muted)">${esc(tracking)}</td>
      <td>${
        canAssign
          ? `<button class="btn btn-primary" style="font-size:11px;padding:5px 10px" onclick="openAssign('${o._id}')">Assign</button>`
          : '<span style="color:var(--muted2);font-size:11px">—</span>'
      }</td>
    </tr>`;
    })
    .join('');
}

function filterOrders(type, el) {
  document.querySelectorAll('.order-filter-btn').forEach((b) => b.classList.remove('active'));
  el.classList.add('active');
  orderFilter = type;
  loadOrders();
}

async function openAssign(orderId) {
  assigningOrderId = orderId;
  try {
    const { data } = await api('GET', '/admin/shipping/orders/' + orderId);
    assignDetail = data;
    renderAssignDrawer();
    openDrawer('assign-drawer');
  } catch (e) {
    toast(e.message, true);
  }
}

function renderAssignDrawer() {
  const body = document.getElementById('assign-body');
  if (!assignDetail) return;
  const o = assignDetail.order;
  const user = o.user || {};
  const carriersList = assignDetail.carriers || [];
  const bostaWarn =
    assignDetail.districtBosta && !assignDetail.districtBosta.bostaApiCovered
      ? '<p style="color:var(--amber);font-size:11px;margin-top:8px">This district is not Bosta API covered — Bosta assignment may fail.</p>'
      : '';

  const grouped = { api: [], known: [], internal: [] };
  carriersList.forEach((c) => {
    if (c.isActive === false) return;
    const t = c.type || 'known';
    if (grouped[t]) grouped[t].push(c);
  });

  const renderGroup = (label, list) => {
    if (!list.length) return '';
    return `
      <div class="form-divider">${label}</div>
      ${list
        .map((c) => {
          const noCoverage = !c.coversGovernorate;
          const noPickup =
            c.type === 'api' &&
            c.apiProvider === 'bosta' &&
            c.hasDefaultPickup === false;
          const disabled = noCoverage || noPickup;
          const id = c._id;
          const hint = noCoverage
            ? 'not in coverage'
            : noPickup
              ? 'no default pickup'
              : '';
          return `
        <label style="display:flex;align-items:center;gap:8px;padding:8px 0;opacity:${disabled ? 0.45 : 1};cursor:${disabled ? 'not-allowed' : 'pointer'}">
          <input type="radio" name="assign-carrier" value="${id}" ${disabled ? 'disabled' : ''} onchange="onAssignCarrierChange('${c.type}','${c.apiProvider || ''}')">
          <span>${esc(c.name)} <span style="color:var(--muted);font-size:10px">(${esc(c.code)})</span></span>
          ${hint ? `<span style="font-size:10px;color:var(--muted)">— ${hint}</span>` : ''}
        </label>`;
        })
        .join('')}`;
  };

  body.innerHTML = `
    <div class="assign-order-info">
      <p>Order <strong>#${shortId(o._id)}</strong></p>
      <p>Customer: <strong>${esc(user.name)}</strong> · ${esc(user.phone || 'no phone')}</p>
      <p>Zone: <strong>${esc(o.shippingAddress?.governorateName)} / ${esc(o.shippingAddress?.districtName)}</strong></p>
      <p>Total: <strong>${o.totalPrice} EGP</strong> · ${esc(o.paymentMethod)}</p>
    </div>
    ${bostaWarn}
    <div id="assign-carriers-list">
      ${renderGroup('API (Bosta / Mylerz)', grouped.api)}
      ${renderGroup('Known carriers', grouped.known)}
      ${renderGroup('Internal delivery', grouped.internal)}
    </div>
    <div id="manual-assign-fields" style="display:none;margin-top:12px">
      <div class="form-group"><label class="form-label">Driver name</label><input class="form-input" id="assign-driver-name"></div>
      <div class="form-group"><label class="form-label">Driver phone</label><input class="form-input" id="assign-driver-phone"></div>
      <div class="form-group"><label class="form-label">Tracking number (optional)</label><input class="form-input" id="assign-tracking"></div>
      <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="assign-notes"></div>
    </div>`;
}

function onAssignCarrierChange(type, provider) {
  const manual = document.getElementById('manual-assign-fields');
  if (!manual) return;
  const showManual = type === 'known' || type === 'internal';
  manual.style.display = showManual ? '' : 'none';
}

async function confirmAssign() {
  const selected = document.querySelector('input[name="assign-carrier"]:checked');
  if (!selected) {
    toast('Select a carrier', true);
    return;
  }
  const carrierId = selected.value;
  const carrier = assignDetail?.carriers?.find((c) => c._id === carrierId);
  const payload = {
    carrierId,
    driverName: document.getElementById('assign-driver-name')?.value?.trim(),
    driverPhone: document.getElementById('assign-driver-phone')?.value?.trim(),
    trackingNumber: document.getElementById('assign-tracking')?.value?.trim(),
    notes: document.getElementById('assign-notes')?.value?.trim(),
    markShipped: carrier?.type === 'api' && carrier?.apiProvider === 'bosta',
  };
  try {
    await api('POST', '/admin/shipping/orders/' + assigningOrderId + '/assign', payload);
    closeAll();
    assigningOrderId = null;
    assignDetail = null;
    await loadOrders();
    toast('Carrier assigned');
  } catch (e) {
    toast(e.message, true);
  }
}

// â”€â”€ Drawers â”€â”€
function openDrawer(id) {
  document.getElementById('overlay').classList.add('open');
  document.getElementById(id).classList.add('open');
}

function closeAll() {
  document.getElementById('overlay').classList.remove('open');
  document.querySelectorAll('.drawer').forEach((d) => d.classList.remove('open'));
}

function openAddCountry() {
  zoneMode = 'country';
  document.getElementById('zone-drawer-title').textContent = 'Add Country';
  document.getElementById('zone-drawer-body').innerHTML = `
    <div class="form-group"><label class="form-label">Country name</label><input class="form-input" placeholder="Egypt" id="zf-name"></div>
    <div class="form-group"><label class="form-label">Country code (ISO 2)</label><input class="form-input" placeholder="EG" maxlength="2" id="zf-code"></div>
    <div class="form-group"><label class="form-label">Currency (ISO 3)</label><input class="form-input" placeholder="EGP" maxlength="3" id="zf-currency"></div>
    <div class="form-group"><label class="form-label">Flag emoji (optional)</label><input class="form-input" placeholder="" id="zf-flag"></div>`;
  openDrawer('zone-drawer');
}

function openAddGov() {
  if (!selCountry) return;
  const c = countries.find((x) => x._id === selCountry);
  zoneMode = 'gov';
  document.getElementById('zone-drawer-title').textContent = 'Add Governorate - ' + (c?.name || '');
  document.getElementById('zone-drawer-body').innerHTML = `
    <div class="form-group"><label class="form-label">Governorate name</label><input class="form-input" placeholder="Cairo" id="zf-name"></div>
    <div class="form-group"><label class="form-label">Base shipping price (${esc(selectedCurrency())})</label><input class="form-input" type="number" placeholder="35" id="zf-price"></div>`;
  openDrawer('zone-drawer');
}

function openAddDistrict() {
  if (!selGov) return;
  const g = governorates.find((x) => x._id === selGov);
  zoneMode = 'district';
  document.getElementById('zone-drawer-title').textContent = 'Add District - ' + (g?.name || '');
  document.getElementById('zone-drawer-body').innerHTML = `
    <div class="form-group"><label class="form-label">District name</label><input class="form-input" placeholder="Nasr City" id="zf-name"></div>
    <div class="form-group"><label class="form-label">Shipping price (${esc(selectedCurrency())})</label><input class="form-input" type="number" placeholder="35" id="zf-price"></div>`;
  openDrawer('zone-drawer');
}

async function saveZoneForm() {
  const name = document.getElementById('zf-name')?.value?.trim();
  if (!name) {
    toast('Name is required', true);
    return;
  }
  try {
    if (zoneMode === 'country') {
      const code = document.getElementById('zf-code')?.value?.trim();
      const currency = document.getElementById('zf-currency')?.value?.trim().toUpperCase();
      if (!code || code.length !== 2) {
        toast('Country code must be 2 letters', true);
        return;
      }
      if (!currency || currency.length !== 3) {
        toast('Currency must be a 3-letter ISO code (e.g. EGP)', true);
        return;
      }
      await api('POST', '/admin/countries', {
        name,
        code,
        currency,
        flag: document.getElementById('zf-flag')?.value?.trim() || '',
      });
    } else if (zoneMode === 'gov') {
      await api('POST', '/admin/governorates', {
        country: selCountry,
        name,
        shippingPrice: +(document.getElementById('zf-price')?.value || 35),
      });
    } else if (zoneMode === 'district') {
      await api('POST', '/admin/districts', {
        governorate: selGov,
        name,
        shippingPrice: +(document.getElementById('zf-price')?.value || 35),
      });
    }
    closeAll();
    await loadZones();
    await loadCarriers();
    toast('Saved');
  } catch (e) {
    toast(e.message, true);
  }
}

// â”€â”€ Init â”€â”€
document.getElementById('api-section').style.display = 'none';
document.getElementById('manual-section').style.display = '';
onCarrierTypeChange();

if (token) {
  document.getElementById('login-overlay').classList.add('hidden');
  const savedBase = localStorage.getItem('oxxila_api_base');
  if (savedBase) document.getElementById('api-base').value = savedBase;
  const savedBosta = localStorage.getItem('oxxila_bosta_default_base');
  const bostaEl = document.getElementById('bosta-default-base');
  if (savedBosta && bostaEl) bostaEl.value = savedBosta;
  loadAll().catch(() => {
    token = '';
    localStorage.removeItem('oxxila_admin_token');
    document.getElementById('login-overlay').classList.remove('hidden');
  });
}

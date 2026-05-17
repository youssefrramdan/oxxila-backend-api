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
  await Promise.all([loadSettings(), loadCarriers(), loadZones()]);
  renderOrders();
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
        ${c.type !== 'api' ? `<div class="icon-btn primary" title="Edit" onclick="openEditCarrier('${c.id}')"><i class="ti ti-pencil"></i></div>` : ''}
        <div class="icon-btn" title="Coverage" onclick="openCoverageEditor('${c.id}')"><i class="ti ti-map-pin"></i></div>
        ${c.type !== 'api' ? `<div class="icon-btn danger" title="Delete" onclick="deleteCarrier('${c.id}')"><i class="ti ti-trash"></i></div>` : ''}
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
  document.getElementById('carrier-type-sel').value = 'known';
  document.querySelectorAll('.day-chip').forEach((c, i) => c.classList.toggle('sel', i === 0));
  document.getElementById('carrier-active-toggle').classList.add('on');
  document.getElementById('coverage-chips').innerHTML = '';
  document.getElementById('coverage-govs-wrap').style.display = 'none';
  document.getElementById('coverage-empty-msg').style.display = 'none';
  onCarrierTypeChange();
  populateCoverageCountries();
  openDrawer('carrier-drawer');
}

async function openEditCarrier(id) {
  const c = carriers.find((x) => x.id === id);
  if (!c || c.type === 'api') return;
  editingCarrierId = id;
  coverageOnlyMode = false;
  document.getElementById('carrier-drawer-title').textContent = 'Edit Carrier';
  document.getElementById('carrier-name').value = c.name;
  document.getElementById('carrier-code').value = c.code;
  document.getElementById('carrier-type-sel').value = c.type;
  document.getElementById('carrier-active-toggle').classList.toggle('on', c.active);
  document.querySelectorAll('.day-chip').forEach((chip) => {
    chip.classList.toggle('sel', chip.textContent.trim() === (c.days || '').replace(/\s*days$/, ''));
  });
  onCarrierTypeChange();
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
  document.querySelector('.form-group:has(#carrier-active-toggle)')?.closest('.form-group')?.style && (document.querySelector('.toggle-row').closest('.form-group').style.display = 'none');
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

    const payload = {
      name: document.getElementById('carrier-name').value.trim(),
      code: document.getElementById('carrier-code').value.trim(),
      type: document.getElementById('carrier-type-sel').value,
      deliveryDays: getSelectedDeliveryDays(),
      isActive: document.getElementById('carrier-active-toggle').classList.contains('on'),
    };
    const govIds = [...document.querySelectorAll('#coverage-chips .cov-chip.sel')].map((c) => c.dataset.id);

    let carrierId = editingCarrierId;
    if (editingCarrierId) {
      await api('PUT', '/admin/carriers/' + editingCarrierId, {
        name: payload.name,
        deliveryDays: payload.deliveryDays,
        isActive: payload.isActive,
      });
    } else {
      const created = await api('POST', '/admin/carriers', payload);
      carrierId = created.data._id;
    }

    if (carrierId && govIds.length) {
      await api('PUT', '/admin/carriers/' + carrierId + '/coverage', { governorateIds: govIds });
    }

    closeAll();
    resetCarrierDrawerForm();
    await loadCarriers();
    toast(editingCarrierId ? 'Carrier updated' : 'Carrier created');
  } catch (e) {
    toast(e.message, true);
  }
}

function resetCarrierDrawerForm() {
  editingCarrierId = null;
  coverageOnlyMode = false;
  document.getElementById('carrier-name').closest('.form-group').style.display = '';
  document.getElementById('carrier-code').closest('.form-group').style.display = '';
  document.getElementById('carrier-type-sel').closest('.form-group').style.display = '';
  document.querySelector('.toggle-row')?.closest('.form-group') && (document.querySelector('.toggle-row').closest('.form-group').style.display = '');
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
  document.getElementById('api-section').style.display = 'none';
  document.getElementById('manual-section').style.display = coverageOnlyMode || v !== 'api' ? '' : 'none';
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
      });
      const { data: dists } = await api('GET', '/admin/governorates/' + g._id + '/districts');
      for (const d of dists || []) {
        districts.push({
          _id: d._id,
          governorate: g._id,
          name: d.name,
          price: d.shippingPrice,
          covered: d.isCovered !== false,
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
      <span style="flex:1;font-size:13px">${esc(d.name)}</span>
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

// â”€â”€ Orders (placeholder - no orders API yet) â”€â”€
function renderOrders() {
  const body = document.getElementById('orders-body');
  body.innerHTML = `<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:28px">Orders shipping API is not connected yet.<br><span style="font-size:11px">Use Carriers + Zone Manager above.</span></td></tr>`;
}

function filterOrders(type, el) {
  document.querySelectorAll('.order-filter-btn').forEach((b) => b.classList.remove('active'));
  el.classList.add('active');
  orderFilter = type;
  renderOrders();
}

function openAssign() {
  toast('Orders API coming soon', true);
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
  loadAll().catch(() => {
    token = '';
    localStorage.removeItem('oxxila_admin_token');
    document.getElementById('login-overlay').classList.remove('hidden');
  });
}

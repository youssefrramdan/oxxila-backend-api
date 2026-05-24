// public/js/shipping-admin.app.js
const { api, toast, esc, getApiBase: apiBase } = window.OxxilaShippingAdmin;

let token = localStorage.getItem("oxxila_admin_token") || "";
let carriers = [];
let countries = [];
let governorates = [];
let districts = [];
let selCountry = null;
let selGov = null;
let carrierFilter = "all";
let orderFilter = "all";
let zoneMode = null;
let editingCarrierId = null;
let coverageOnlyMode = false;
let orders = [];
let assigningOrderId = null;
let assignDetail = null;

function selectedCountry() {
  return countries.find((c) => c._id === selCountry);
}

function selectedCurrency() {
  return selectedCountry()?.currency || "EGP";
}

// â”€â”€ Auth â”€â”€
async function doLogin() {
  const errEl = document.getElementById("login-err");
  errEl.style.display = "none";
  try {
    const base = document.getElementById("api-base").value.trim();
    localStorage.setItem("oxxila_api_base", base);
    const bostaBase = document
      .getElementById("bosta-default-base")
      ?.value?.trim();
    if (bostaBase) localStorage.setItem("oxxila_bosta_default_base", bostaBase);
    const data = await api("POST", "/auth/login", {
      email: document.getElementById("login-email").value,
      password: document.getElementById("login-pass").value,
    });
    token = data.data.accessToken;
    localStorage.setItem("oxxila_admin_token", token);
    document.getElementById("login-overlay").classList.add("hidden");
    await loadAll();
    toast("Logged in");
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = "block";
  }
}

async function loadAll() {
  await Promise.all([loadCarriers(), loadZones(), loadOrders()]);
}

async function loadSettings() {
  /* ShippingSettings removed — carriers use isActive only */
}

async function toggleMethodSetting() {
  toast("Use carrier Active/Inactive toggles in the Carriers tab", true);
}

// â”€â”€ Carriers â”€â”€
async function loadCarriers() {
  const { data } = await api("GET", "/admin/carriers");
  carriers = (data || []).map((c) => ({
    id: c._id,
    name: c.name,
    code: c.code,
    type: c.type,
    provider: c.apiProvider,
    days: c.deliveryDays || "n/a",
    coverage: c.coverage || [],
    active: c.isActive !== false,
    apiBaseUrl: c.apiBaseUrl || "",
    hasApiKey: c.hasApiKey === true,
  }));
  renderCarriers();
  syncApiCarrierTypeOption();
  populateCoverageCountries();
}

function renderCarriers() {
  const body = document.getElementById("carriers-body");
  const list =
    carrierFilter === "all"
      ? carriers
      : carriers.filter((c) => c.type === carrierFilter);
  if (!list.length) {
    body.innerHTML =
      '<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:24px">No carriers yet</td></tr>';
    return;
  }
  body.innerHTML = list
    .map(
      (c) => `
    <tr>
      <td><div class="carrier-name-cell"><div class="carrier-logo">${esc(c.code)}</div><div><div style="font-size:13px;font-weight:500">${esc(c.name)}</div><div style="font-size:10px;color:var(--muted)">${c.type === "api" ? "via " + esc(c.provider || "API") : c.type === "internal" ? "In-house staff" : "Manual"}</div></div></div></td>
      <td><span class="type-badge type-${c.type}">${c.type === "api" ? "API" : c.type === "known" ? "Known" : "Internal"}</span></td>
      <td style="font-size:12px;font-family:var(--mono)">${esc(c.days)}${c.days && c.days !== "n/a" ? " days" : ""}</td>
      <td><div class="coverage-tags">${(c.coverage || []).map((z) => `<span class="coverage-tag">${esc(z)}</span>`).join("") || '<span style="color:var(--muted2)">-</span>'}</div></td>
      <td><span class="status-badge ${c.active ? "status-active" : "status-inactive"}">${c.active ? "Active" : "Inactive"}</span></td>
      <td><div class="action-btns">
        <div class="icon-btn primary" title="Edit" onclick="openEditCarrier('${c.id}')"><i class="ti ti-pencil"></i></div>
        <div class="icon-btn" title="Coverage" onclick="openCoverageEditor('${c.id}')"><i class="ti ti-map-pin"></i></div>
        <div class="icon-btn danger" title="Delete" onclick="deleteCarrier('${c.id}')"><i class="ti ti-trash"></i></div>
      </div></td>
    </tr>`,
    )
    .join("");
}

function filterCarriers(type, el) {
  document
    .querySelectorAll(".filter-tab")
    .forEach((t) => t.classList.remove("active"));
  el.classList.add("active");
  carrierFilter = type;
  renderCarriers();
}

function getSelectedDeliveryDays() {
  const chip = document.querySelector(".day-chip.sel");
  return chip ? chip.textContent.trim() : "1-2";
}

function hasBostaApiCarrier() {
  return carriers.some((c) => c.type === "api" && c.provider === "bosta");
}

function syncApiCarrierTypeOption() {
  const sel = document.getElementById("carrier-type-sel");
  const apiOpt = sel?.querySelector('option[value="api"]');
  if (!apiOpt) return;
  const blocked = hasBostaApiCarrier() && !editingCarrierId;
  apiOpt.disabled = blocked;
  apiOpt.textContent = blocked
    ? "API Carrier (Bosta) — already configured"
    : "API Carrier (Bosta)";
}

function openAddCarrier() {
  editingCarrierId = null;
  coverageOnlyMode = false;
  document.getElementById("carrier-drawer-title").textContent = "Add Carrier";
  document.getElementById("carrier-name").value = "";
  document.getElementById("carrier-code").value = "";
  document.getElementById("carrier-code").readOnly = false;
  document.getElementById("carrier-type-sel").value = "known";
  document.getElementById("carrier-type-sel").disabled = false;
  syncApiCarrierTypeOption();
  const providerEl = document.getElementById("carrier-api-provider");
  if (providerEl) providerEl.value = "bosta";
  document.getElementById("carrier-api-base-url").value =
    localStorage.getItem("oxxila_bosta_default_base") || "https://app.bosta.co";
  document.getElementById("carrier-api-key").value = "";
  document
    .querySelectorAll(".day-chip")
    .forEach((c, i) => c.classList.toggle("sel", i === 0));
  document.getElementById("carrier-active-toggle").classList.add("on");
  document.getElementById("coverage-chips").innerHTML = "";
  document.getElementById("coverage-govs-wrap").style.display = "none";
  document.getElementById("coverage-empty-msg").style.display = "none";
  document.getElementById("coverage-country-sel").value = "";
  onCarrierTypeChange();
  populateCoverageCountries();
  openDrawer("carrier-drawer");
}

async function openEditCarrier(id) {
  const c = carriers.find((x) => x.id === id);
  if (!c) return;
  editingCarrierId = id;
  coverageOnlyMode = false;
  document.getElementById("carrier-drawer-title").textContent = "Edit Carrier";
  document.getElementById("carrier-name").value = c.name;
  document.getElementById("carrier-code").value = c.code;
  document.getElementById("carrier-code").readOnly = true;
  document.getElementById("carrier-type-sel").value = c.type;
  document.getElementById("carrier-type-sel").disabled = true;
  document.getElementById("carrier-api-key").value = "";
  document.getElementById("carrier-api-key").placeholder =
    c.type === "api" ? "New API key (optional)" : "Paste API key";
  const providerEl = document.getElementById("carrier-api-provider");
  if (providerEl) providerEl.value = "bosta";
  if (c.type === "api") {
    document.getElementById("carrier-api-base-url").value =
      c.apiBaseUrl ||
      localStorage.getItem("oxxila_bosta_default_base") ||
      "https://app.bosta.co";
  }
  document
    .getElementById("carrier-active-toggle")
    .classList.toggle("on", c.active);
  document.querySelectorAll(".day-chip").forEach((chip) => {
    const d = (c.days || "").replace(/\s*days$/i, "").trim();
    chip.classList.toggle(
      "sel",
      d ? chip.textContent.trim() === d : chip.textContent.trim() === "1-2",
    );
  });
  syncApiCarrierTypeOption();
  onCarrierTypeChange();
  onApiProviderChange();
  if (c.type === "api" && c.provider === "bosta") {
    document.getElementById("carrier-api-base-url").value =
      c.apiBaseUrl ||
      localStorage.getItem("oxxila_bosta_default_base") ||
      "https://app.bosta.co";
    BostaPickups.hideForm();
    await BostaPickups.load(id);
  }
  openDrawer("carrier-drawer");
}

async function openCoverageEditor(id) {
  editingCarrierId = id;
  coverageOnlyMode = true;
  const c = carriers.find((x) => x.id === id);
  document.getElementById("carrier-drawer-title").textContent =
    "Coverage - " + (c?.name || "");
  document.getElementById("carrier-name").closest(".form-group").style.display =
    "none";
  document.getElementById("carrier-code").closest(".form-group").style.display =
    "none";
  document
    .getElementById("carrier-type-sel")
    .closest(".form-group").style.display = "none";
  document.getElementById("api-section").style.display = "none";
  document.getElementById("manual-section").style.display = "";
  const delSec = document.getElementById("delivery-days-section");
  if (delSec) delSec.style.display = "none";
  const activeGrp = document
    .querySelector(".toggle-row")
    ?.closest(".form-group");
  if (activeGrp) activeGrp.style.display = "none";
  populateCoverageCountries();
  onCarrierTypeChange();
  openDrawer("carrier-drawer");
}

async function saveCarrier() {
  try {
    if (coverageOnlyMode && editingCarrierId) {
      const govIds = [
        ...document.querySelectorAll("#coverage-chips .cov-chip.sel"),
      ].map((c) => c.dataset.id);
      await api("PUT", "/admin/carriers/" + editingCarrierId + "/coverage", {
        governorateIds: govIds,
      });
      closeAll();
      resetCarrierDrawerForm();
      await loadCarriers();
      toast("Coverage updated");
      return;
    }

    const type = document.getElementById("carrier-type-sel").value;
    if (type === "api" && !editingCarrierId && hasBostaApiCarrier()) {
      toast("A Bosta API carrier already exists. Edit it instead.", true);
      return;
    }
    const name = document.getElementById("carrier-name").value.trim();
    const code = document.getElementById("carrier-code").value.trim();
    const isActive = document
      .getElementById("carrier-active-toggle")
      .classList.contains("on");
    const govIds = [
      ...document.querySelectorAll("#coverage-chips .cov-chip.sel"),
    ].map((c) => c.dataset.id);

    let carrierId = editingCarrierId;
    if (editingCarrierId) {
      const put = { name, isActive };
      if (type !== "api") put.deliveryDays = getSelectedDeliveryDays();
      const newKey = document.getElementById("carrier-api-key").value.trim();
      if (type === "api") {
        put.apiBaseUrl = document
          .getElementById("carrier-api-base-url")
          .value.trim();
        if (newKey) put.apiKey = newKey;
      }
      const updated = await api(
        "PUT",
        "/admin/carriers/" + editingCarrierId,
        put,
      );
    } else {
      const payload = { name, code, type, isActive };
      if (type === "api") {
        payload.apiProvider = "bosta";
        payload.apiKey = document
          .getElementById("carrier-api-key")
          .value.trim();
        payload.apiBaseUrl = document
          .getElementById("carrier-api-base-url")
          .value.trim();
      } else {
        payload.deliveryDays = getSelectedDeliveryDays();
      }
      const created = await api("POST", "/admin/carriers", payload);
      carrierId = created.data?.carrier?._id ?? created.data?._id;
    }

    if (carrierId && govIds.length && type !== "api") {
      await api("PUT", "/admin/carriers/" + carrierId + "/coverage", {
        governorateIds: govIds,
      });
    }

    closeAll();
    resetCarrierDrawerForm();
    await loadCarriers();
    await loadZones();
    if (
      carrierId &&
      document.getElementById("carrier-api-provider")?.value === "bosta"
    ) {
      BostaPickups.resetDistrictsCache();
    }
    if (!editingCarrierId && carrierId) toast("Carrier created");
    else if (editingCarrierId) toast("Carrier updated");
  } catch (e) {
    toast(e.message, true);
  }
}

function resetCarrierDrawerForm() {
  editingCarrierId = null;
  coverageOnlyMode = false;
  document.getElementById("carrier-name").closest(".form-group").style.display =
    "";
  document.getElementById("carrier-code").closest(".form-group").style.display =
    "";
  document.getElementById("carrier-code").readOnly = false;
  document
    .getElementById("carrier-type-sel")
    .closest(".form-group").style.display = "";
  document.getElementById("carrier-type-sel").disabled = false;
  document.getElementById("carrier-api-key").placeholder = "Paste API key";
  const delSec = document.getElementById("delivery-days-section");
  if (delSec) delSec.style.display = "";
  const activeGrp = document
    .querySelector(".toggle-row")
    ?.closest(".form-group");
  if (activeGrp) activeGrp.style.display = "";
  onCarrierTypeChange();
}

async function deleteCarrier(id) {
  if (!confirm("Delete this carrier?")) return;
  try {
    await api("DELETE", "/admin/carriers/" + id);
    await loadCarriers();
    toast("Carrier deleted");
  } catch (e) {
    toast(e.message, true);
  }
}

function onCarrierTypeChange() {
  const v = document.getElementById("carrier-type-sel").value;
  const isApi = v === "api";
  document.getElementById("api-section").style.display =
    isApi && !coverageOnlyMode ? "" : "none";
  document.getElementById("manual-section").style.display =
    coverageOnlyMode || !isApi ? "" : "none";
  const delSec = document.getElementById("delivery-days-section");
  if (delSec) {
    const hideDays = coverageOnlyMode || isApi;
    delSec.style.display = hideDays ? "none" : "";
  }
  onApiProviderChange();
  BostaPickups.hideForm();
}

function onApiProviderChange() {
  const isBosta =
    document.getElementById("carrier-api-provider")?.value === "bosta";
  const showBostaExtras = isBosta && !!editingCarrierId;
  BostaPickups.setSectionVisible(showBostaExtras);
  const syncSec = document.getElementById("bosta-sync-section");
  if (syncSec) syncSec.style.display = showBostaExtras ? "" : "none";
}

async function syncBostaZonesManual() {
  if (!editingCarrierId) {
    toast("Save carrier first", true);
    return;
  }
  try {
    const { data } = await api(
      "POST",
      "/admin/carriers/" + editingCarrierId + "/bosta/sync-zones",
    );
    toast(
      `Synced: ${data?.governoratesCreated ?? 0} new govs, ${data?.districtsCreated ?? 0} new districts, ${data?.coverageGovernorates ?? 0} covered`,
    );
    await loadZones();
  } catch (e) {
    toast(e.message, true);
  }
}

function populateCoverageCountries() {
  const sel = document.getElementById("coverage-country-sel");
  if (!sel) return;
  sel.innerHTML =
    '<option value="">- Select a country -</option>' +
    countries
      .map(
        (c) =>
          `<option value="${c._id}">${esc(c.name)} (${esc(c.currency)})</option>`,
      )
      .join("");
}

async function onCoverageCountryChange() {
  const countryId = document.getElementById("coverage-country-sel").value;
  const chipsWrap = document.getElementById("coverage-govs-wrap");
  const emptyMsg = document.getElementById("coverage-empty-msg");
  const chips = document.getElementById("coverage-chips");

  if (!countryId) {
    chipsWrap.style.display = "none";
    emptyMsg.style.display = "none";
    chips.innerHTML = "";
    return;
  }

  try {
    const { data } = await api(
      "GET",
      "/admin/countries/" + countryId + "/governorates",
    );
    if (!data.length) {
      chipsWrap.style.display = "none";
      emptyMsg.style.display = "";
      chips.innerHTML = "";
      return;
    }
    emptyMsg.style.display = "none";
    chipsWrap.style.display = "";
    chips.innerHTML = data
      .map(
        (g) =>
          `<div class="cov-chip" data-id="${g._id}" onclick="this.classList.toggle('sel')">${esc(g.name)}</div>`,
      )
      .join("");
  } catch (e) {
    toast(e.message, true);
  }
}

function selectDays(el) {
  document
    .querySelectorAll(".day-chip")
    .forEach((c) => c.classList.remove("sel"));
  el.classList.add("sel");
}

// â”€â”€ Zones â”€â”€
const loadedGovDistricts = new Set();

async function loadDistrictsForGov(govId) {
  if (loadedGovDistricts.has(govId)) return;
  const { data: dists } = await api(
    "GET",
    "/admin/governorates/" + govId + "/districts",
  );
  districts = districts.filter((d) => d.governorate !== govId);
  for (const d of dists || []) {
    districts.push({
      _id: d._id,
      governorate: govId,
      name: d.name,
      price: d.shippingPrice,
      covered: d.isCovered !== false,
    });
  }
  loadedGovDistricts.add(govId);
}

async function loadZones() {
  const { data: countryList } = await api("GET", "/admin/countries");
  countries = countryList || [];
  governorates = [];
  districts = [];
  loadedGovDistricts.clear();
  for (const c of countries) {
    const { data: govs } = await api(
      "GET",
      "/admin/countries/" + c._id + "/governorates",
    );
    for (const g of govs || []) {
      governorates.push({
        _id: g._id,
        country: c._id,
        name: g.name,
        price: g.shippingPrice,
        districtCount: g.districtCount ?? 0,
      });
    }
  }
  renderCountries();
  renderGovs();
  renderDistricts();
}

function renderCountries() {
  const el = document.getElementById("countries-col");
  el.innerHTML =
    countries
      .map(
        (c) => `
    <div class="zone-row ${selCountry === c._id ? "sel" : ""}" onclick="selectCountry('${c._id}')">
      <span class="zone-flag">${c.flag || ""}</span>
      <div style="flex:1"><div class="zone-name">${esc(c.name)}</div><div class="zone-sub">${esc(c.code)} | ${esc(c.currency)} | ${governorates.filter((g) => g.country === c._id).length} gov</div></div>
      <i class="ti ti-trash zone-del" onclick="event.stopPropagation();deleteCountry('${c._id}')"></i>
    </div>`,
      )
      .join("") +
    `<div class="add-zone-btn" onclick="openAddCountry()"><i class="ti ti-plus"></i> Add country</div>`;
}

function selectCountry(id) {
  selCountry = id;
  selGov = null;
  renderCountries();
  renderGovs();
  renderDistricts();
}

function renderGovs() {
  const el = document.getElementById("govs-col");
  const lbl = document.getElementById("gov-col-label");
  const btn = document.getElementById("add-gov-btn");
  if (!selCountry) {
    el.innerHTML = '<div class="empty-zone"> Select a country</div>';
    lbl.textContent = "Governorates";
    btn.style.display = "none";
    return;
  }
  const c = countries.find((x) => x._id === selCountry);
  lbl.textContent = c?.name || "Governorates";
  btn.style.display = "";
  const govs = governorates.filter((g) => g.country === selCountry);
  el.innerHTML =
    govs
      .map(
        (g) => `
    <div class="zone-row ${selGov === g._id ? "sel" : ""}" onclick="selectGov('${g._id}')">
      <div style="flex:1"><div class="zone-name">${esc(g.name)}</div><div class="zone-sub">${g.districtCount ?? districts.filter((d) => d.governorate === g._id).length} districts</div></div>
      <span class="zone-price">${g.price} ${esc(selectedCurrency())}</span>
      <i class="ti ti-trash zone-del" onclick="event.stopPropagation();deleteGov('${g._id}')"></i>
    </div>`,
      )
      .join("") +
    `<div class="add-zone-btn" onclick="openAddGov()"><i class="ti ti-plus"></i> Add governorate</div>`;
}

async function selectGov(id) {
  selGov = id;
  renderGovs();
  const el = document.getElementById("dists-col");
  if (el) el.innerHTML = '<div class="empty-zone">Loading districts…</div>';
  try {
    await loadDistrictsForGov(id);
    renderDistricts();
  } catch (e) {
    if (el) el.innerHTML = '<div class="empty-zone">' + esc(e.message) + "</div>";
    toast(e.message, true);
  }
}

function renderDistricts() {
  const el = document.getElementById("dists-col");
  const lbl = document.getElementById("dist-col-label");
  const btn = document.getElementById("add-dist-btn");
  if (!selGov) {
    el.innerHTML = '<div class="empty-zone"> Select a governorate</div>';
    lbl.textContent = "Districts";
    btn.style.display = "none";
    return;
  }
  const g = governorates.find((x) => x._id === selGov);
  lbl.textContent = "Districts of " + (g?.name || "");
  btn.style.display = "";
  const dists = districts.filter((d) => d.governorate === selGov);
  const rows = dists
    .map(
      (d) => `
    <div class="district-row">
      <span class="cov-badge ${d.covered ? "cov-yes" : "cov-no"}" onclick="toggleCovered('${d._id}')">${d.covered ? "Covered" : "Closed"}</span>
      <span style="flex:1;font-size:13px">${esc(d.name)}</span>
      <input class="price-inp" type="number" value="${d.price}" onchange="updateDistPrice('${d._id}',this.value)">
      <i class="ti ti-trash zone-del" onclick="deleteDistrict('${d._id}')"></i>
    </div>`,
    )
    .join("");
  const other = g
    ? `<div class="other-row"><div style="flex:1"><div class="other-label">Other</div><div class="other-sub">All other areas - fallback price</div></div><input class="price-inp" type="number" value="${g.price}" onchange="updateGovPrice('${g._id}',this.value)"></div>`
    : "";
  el.innerHTML = rows + (dists.length ? other : "");
}

async function toggleCovered(id) {
  const d = districts.find((x) => x._id === id);
  if (!d) return;
  try {
    await api("PUT", "/admin/districts/" + id, { isCovered: !d.covered });
    d.covered = !d.covered;
    renderDistricts();
  } catch (e) {
    toast(e.message, true);
  }
}

async function updateDistPrice(id, v) {
  try {
    await api("PUT", "/admin/districts/" + id, { shippingPrice: +v });
    const d = districts.find((x) => x._id === id);
    if (d) d.price = +v;
  } catch (e) {
    toast(e.message, true);
    renderDistricts();
  }
}

async function updateGovPrice(id, v) {
  try {
    await api("PUT", "/admin/governorates/" + id, { shippingPrice: +v });
    const g = governorates.find((x) => x._id === id);
    if (g) g.price = +v;
  } catch (e) {
    toast(e.message, true);
    renderDistricts();
  }
}

async function deleteCountry(id) {
  if (!confirm("Delete country and all zones?")) return;
  try {
    await api("DELETE", "/admin/countries/" + id);
    if (selCountry === id) {
      selCountry = null;
      selGov = null;
    }
    await loadZones();
    await loadCarriers();
    toast("Country deleted");
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteGov(id) {
  if (!confirm("Delete governorate and districts?")) return;
  try {
    await api("DELETE", "/admin/governorates/" + id);
    if (selGov === id) selGov = null;
    await loadZones();
    toast("Governorate deleted");
  } catch (e) {
    toast(e.message, true);
  }
}

async function deleteDistrict(id) {
  if (!confirm("Delete district?")) return;
  try {
    await api("DELETE", "/admin/districts/" + id);
    await loadZones();
    toast("District deleted");
  } catch (e) {
    toast(e.message, true);
  }
}

// —— Orders ——
async function loadOrders() {
  try {
    let path = "/orders?limit=50&sort=-createdAt";
    if (orderFilter !== "all") path += "&orderStatus=" + orderFilter;
    const { data } = await api("GET", path);
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
  const badge = document.querySelector(".nav-item .nav-badge");
  if (!badge) return;
  const n = orders.filter(
    (o) =>
      ["confirmed", "pending", "processing"].includes(o.orderStatus) &&
      !o.shipment?.carrier,
  ).length;
  badge.textContent = n > 0 ? String(n) : "0";
}

function orderStatusClass(status) {
  if (window.OxxilaTracking) return OxxilaTracking.orderStatusClass(status);
  if (status === "shipped") return "os-shipped";
  if (status === "delivered") return "os-delivered";
  if (status === "partially_returned") return "os-partial-return";
  if (status === "returned") return "os-product-returned";
  if (status === "processing") return "os-assigned";
  if (status === "confirmed") return "os-confirmed";
  return "os-pending";
}

function orderStatusLabel(orderOrStatus) {
  if (orderOrStatus && typeof orderOrStatus === "object") {
    return (
      orderOrStatus.orderStatusLabel ||
      (window.OxxilaTracking
        ? OxxilaTracking.orderStatusLabel(orderOrStatus.orderStatus)
        : orderOrStatus.orderStatus)
    );
  }
  const status = orderOrStatus;
  return window.OxxilaTracking
    ? OxxilaTracking.orderStatusLabel(status)
    : status;
}

function paymentStatusLabel(order) {
  return (
    order?.paymentStatusLabel ??
    (order?.paymentStatus === "paid" ? "Paid" : "Not paid")
  );
}

async function confirmOrder(orderId) {
  try {
    await api("PATCH", "/orders/" + orderId + "/status", {
      orderStatus: "confirmed",
    });
    await loadOrders();
    toast("Order confirmed");
  } catch (e) {
    toast(e.message, true);
  }
}

function shortId(id) {
  return String(id || "")
    .slice(-6)
    .toUpperCase();
}

function renderOrders() {
  const body = document.getElementById("orders-body");
  let list = orders;
  if (orderFilter !== "all") {
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
      const zone = `${o.shippingAddress?.governorateName || ""} / ${o.shippingAddress?.districtName || ""}`;
      const carrier = o.shipment?.carrierName || "—";
      const trackingNum =
        o.tracking?.trackingNumber ||
        o.shipment?.trackingNumber ||
        o.shipment?.driverName ||
        "";
      const tracking = trackingNum ? esc(trackingNum) : "—";
      const canAssign = window.OxxilaTracking
        ? OxxilaTracking.canAssignOrder(o)
        : ["confirmed", "pending", "processing"].includes(o.orderStatus) &&
          !(o.shipment?.carrier && (o.shipment?.externalDeliveryId || o.shipment?.trackingNumber));
      const needsConfirm = window.OxxilaTracking?.needsConfirmOrder(o);
      const showReturns =
        o.orderStatus === "partially_returned" || o.orderStatus === "returned";
      const actions = [
        needsConfirm
          ? `<button class="btn btn-secondary" style="font-size:11px;padding:5px 10px;margin-right:4px" onclick="confirmOrder('${o._id}')">Confirm</button>`
          : "",
        canAssign
          ? `<button class="btn btn-primary" style="font-size:11px;padding:5px 10px" onclick="openAssign('${o._id}')">Assign</button>`
          : "",
        showReturns
          ? `<a class="btn btn-secondary" style="font-size:11px;padding:5px 10px;text-decoration:none" href="/returns-admin.html?orderId=${o._id}">Returns</a>`
          : "",
      ]
        .filter(Boolean)
        .join("") || '<span style="color:var(--muted2);font-size:11px">—</span>';
      return `
    <tr>
      <td style="font-family:var(--mono);font-size:12px">#${shortId(o._id)}</td>
      <td><div style="font-size:13px">${esc(user.name || "—")}</div><div style="font-size:10px;color:var(--muted)">${esc(user.email || "")}</div></td>
      <td style="font-size:12px">${esc(zone)}</td>
      <td style="font-size:12px">${esc(carrier)}</td>
      <td><span class="order-status ${orderStatusClass(o.orderStatus)}">${esc(orderStatusLabel(o.orderStatus))}</span></td>
      <td style="font-size:11px;font-family:var(--mono);color:var(--muted)">${esc(tracking)}</td>
      <td style="white-space:nowrap">${actions}</td>
    </tr>`;
    })
    .join("");
}

function filterOrders(type, el) {
  document
    .querySelectorAll(".order-filter-btn")
    .forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
  orderFilter = type;
  loadOrders();
}

async function openAssign(orderId) {
  assigningOrderId = orderId;
  try {
    const { data } = await api("GET", "/admin/shipping/orders/" + orderId);
    assignDetail = data;
    renderAssignDrawer();
    openDrawer("assign-drawer");
  } catch (e) {
    toast(e.message, true);
  }
}

function renderAssignDrawer() {
  const body = document.getElementById("assign-body");
  if (!assignDetail) return;
  const o = assignDetail.order;
  const user = o.user || {};
  const carriersList = assignDetail.carriers || [];
  const bostaWarn =
    assignDetail.zoneMapping === null && o.shippingAddress?.districtId
      ? '<p style="color:var(--amber);font-size:11px;margin-top:8px">No Bosta zone mapping for this district — run zone sync first.</p>'
      : "";

  const grouped = { api: [], known: [], internal: [] };
  carriersList.forEach((c) => {
    if (c.isActive === false) return;
    const t = c.type || "known";
    if (grouped[t]) grouped[t].push(c);
  });

  const renderGroup = (label, list) => {
    if (!list.length) return "";
    return `
      <div class="form-divider">${label}</div>
      ${list
        .map((c) => {
          const noCoverage = !c.coversGovernorate;
          const noPickups =
            c.type === "api" &&
            c.apiProvider === "bosta" &&
            c.hasPickups === false;
          const disabled = noCoverage || noPickups;
          const id = c._id;
          const hint = noCoverage
            ? "not in coverage"
            : noPickups
              ? "no pickups in DB — import in carrier"
              : "";
          return `
        <label style="display:flex;align-items:center;gap:8px;padding:8px 0;opacity:${disabled ? 0.45 : 1};cursor:${disabled ? "not-allowed" : "pointer"}">
          <input type="radio" name="assign-carrier" value="${id}" ${disabled ? "disabled" : ""} onchange="onAssignCarrierChange('${c.type}','${c.apiProvider || ""}')">
          <span>${esc(c.name)} <span style="color:var(--muted);font-size:10px">(${esc(c.code)})</span></span>
          ${hint ? `<span style="font-size:10px;color:var(--muted)">— ${hint}</span>` : ""}
        </label>`;
        })
        .join("")}`;
  };

  const tracker = window.OxxilaTracking
    ? OxxilaTracking.renderOrderTracker(o)
    : "";
  const banner = window.OxxilaTracking
    ? OxxilaTracking.renderOrderStatusBanner(o)
    : "";

  body.innerHTML = `
    <div class="assign-order-info">
      <p>Order <strong>#${shortId(o._id)}</strong>
        <span class="order-status ${orderStatusClass(o.orderStatus)}" style="margin-left:8px;font-size:10px">${esc(orderStatusLabel(o.orderStatus))}</span>
      </p>
      <p>Customer: <strong>${esc(user.name)}</strong> · ${esc(user.phone || "no phone")}</p>
      <p>Zone: <strong>${esc(o.shippingAddress?.governorateName)} / ${esc(o.shippingAddress?.districtName)}</strong></p>
      <p>Total: <strong>${o.totalPrice} EGP</strong> · ${esc(o.paymentMethod)}</p>
    </div>
    ${tracker}
    ${banner}
    ${bostaWarn}

    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label">Package size</label>
      <select class="form-select" id="assign-size">
        <option value="SMALL">Small</option>
        <option value="MEDIUM" selected>Medium</option>
        <option value="LARGE">Large</option>
        <option value="XLARGE">X-Large</option>
      </select>
    </div>

    <div id="assign-carriers-list">
      ${renderGroup("API (Bosta)", grouped.api)}
      ${renderGroup("Known carriers", grouped.known)}
      ${renderGroup("Internal delivery", grouped.internal)}
    </div>
    <div id="bosta-assign-pickup" style="display:none;margin-top:12px">
      <div class="form-group">
        <label class="form-label">Pickup location (required)</label>
        <select class="form-select" id="assign-pickup-id">
          <option value="">— Select pickup —</option>
        </select>
        <p style="font-size:11px;color:var(--muted);margin-top:6px">Pickups are loaded from your database (import once in carrier settings).</p>
      </div>
    </div>
    <div id="manual-assign-fields" style="display:none;margin-top:12px">
      <div class="form-group"><label class="form-label">Driver name</label><input class="form-input" id="assign-driver-name"></div>
      <div class="form-group"><label class="form-label">Driver phone</label><input class="form-input" id="assign-driver-phone"></div>
      <div class="form-group"><label class="form-label">Tracking number (optional — auto-generated if empty)</label><input class="form-input" id="assign-tracking" placeholder="Leave blank to auto-generate"></div>
      <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="assign-notes"></div>
    </div>`;
}

function fillAssignPickupSelect(carrierId) {
  const sel = document.getElementById("assign-pickup-id");
  if (!sel) return;
  const list = assignDetail?.pickupsByCarrier?.[carrierId] || [];
  sel.innerHTML =
    '<option value="">— Select pickup —</option>' +
    list
      .map((p) => {
        const sub = [p.city, p.districtName].filter(Boolean).join(" · ");
        const def = p.isDefault ? " (default)" : "";
        return `<option value="${p._id}">${esc(p.locationName)}${def}${sub ? " — " + esc(sub) : ""}</option>`;
      })
      .join("");
  if (list.length === 1) sel.value = list[0]._id;
}

function onAssignCarrierChange(type, provider) {
  const manual = document.getElementById("manual-assign-fields");
  const bostaPickup = document.getElementById("bosta-assign-pickup");
  const isBosta = type === "api" && provider === "bosta";
  if (bostaPickup) bostaPickup.style.display = isBosta ? "" : "none";
  if (manual) manual.style.display = type === "known" || type === "internal" ? "" : "none";
  if (isBosta) {
    const carrierId = document.querySelector('input[name="assign-carrier"]:checked')?.value;
    if (carrierId) fillAssignPickupSelect(carrierId);
  }
}

async function confirmAssign() {
  const selected = document.querySelector(
    'input[name="assign-carrier"]:checked',
  );
  if (!selected) {
    toast("Select a carrier", true);
    return;
  }
  const carrierId = selected.value;
  const carrier = assignDetail?.carriers?.find((c) => c._id === carrierId);
  const isBosta =
    carrier?.type === "api" && carrier?.apiProvider === "bosta";
  const pickupId = document.getElementById("assign-pickup-id")?.value?.trim();
  if (isBosta && !pickupId) {
    toast("Select a pickup location", true);
    return;
  }
  const payload = {
    carrierId,
    driverName: document.getElementById("assign-driver-name")?.value?.trim(),
    driverPhone: document.getElementById("assign-driver-phone")?.value?.trim(),
    trackingNumber: document.getElementById("assign-tracking")?.value?.trim(),
    notes: document.getElementById("assign-notes")?.value?.trim(),
    size: document.getElementById("assign-size")?.value || "MEDIUM",
    pickupId: isBosta ? pickupId : undefined,
    markShipped:
      isBosta || carrier?.type === "known" || carrier?.type === "internal",
  };
  try {
    const res = await api(
      "POST",
      "/admin/shipping/orders/" + assigningOrderId + "/assign",
      payload,
    );
    closeAll();
    assigningOrderId = null;
    assignDetail = null;
    await loadOrders();
    toast("Carrier assigned");
  } catch (e) {
    toast(e.message, true);
    await loadOrders();
  }
}

// â”€â”€ Drawers â”€â”€
function openDrawer(id) {
  document.getElementById("overlay").classList.add("open");
  document.getElementById(id).classList.add("open");
}

function closeAll() {
  document.getElementById("overlay").classList.remove("open");
  document
    .querySelectorAll(".drawer")
    .forEach((d) => d.classList.remove("open"));
}

function openAddCountry() {
  zoneMode = "country";
  document.getElementById("zone-drawer-title").textContent = "Add Country";
  document.getElementById("zone-drawer-body").innerHTML = `
    <div class="form-group"><label class="form-label">Country name</label><input class="form-input" placeholder="Egypt" id="zf-name"></div>
    <div class="form-group"><label class="form-label">Country code (ISO 2)</label><input class="form-input" placeholder="EG" maxlength="2" id="zf-code"></div>
    <div class="form-group"><label class="form-label">Currency (ISO 3)</label><input class="form-input" placeholder="EGP" maxlength="3" id="zf-currency"></div>
    <div class="form-group"><label class="form-label">Flag emoji (optional)</label><input class="form-input" placeholder="" id="zf-flag"></div>`;
  openDrawer("zone-drawer");
}

function openAddGov() {
  if (!selCountry) return;
  const c = countries.find((x) => x._id === selCountry);
  zoneMode = "gov";
  document.getElementById("zone-drawer-title").textContent =
    "Add Governorate - " + (c?.name || "");
  document.getElementById("zone-drawer-body").innerHTML = `
    <div class="form-group"><label class="form-label">Governorate name</label><input class="form-input" placeholder="Cairo" id="zf-name"></div>
    <div class="form-group"><label class="form-label">Base shipping price (${esc(selectedCurrency())})</label><input class="form-input" type="number" placeholder="35" id="zf-price"></div>`;
  openDrawer("zone-drawer");
}

function openAddDistrict() {
  if (!selGov) return;
  const g = governorates.find((x) => x._id === selGov);
  zoneMode = "district";
  document.getElementById("zone-drawer-title").textContent =
    "Add District - " + (g?.name || "");
  document.getElementById("zone-drawer-body").innerHTML = `
    <div class="form-group"><label class="form-label">District name</label><input class="form-input" placeholder="Nasr City" id="zf-name"></div>
    <div class="form-group"><label class="form-label">Shipping price (${esc(selectedCurrency())})</label><input class="form-input" type="number" placeholder="35" id="zf-price"></div>`;
  openDrawer("zone-drawer");
}

async function saveZoneForm() {
  const name = document.getElementById("zf-name")?.value?.trim();
  if (!name) {
    toast("Name is required", true);
    return;
  }
  try {
    if (zoneMode === "country") {
      const code = document.getElementById("zf-code")?.value?.trim();
      const currency = document
        .getElementById("zf-currency")
        ?.value?.trim()
        .toUpperCase();
      if (!code || code.length !== 2) {
        toast("Country code must be 2 letters", true);
        return;
      }
      if (!currency || currency.length !== 3) {
        toast("Currency must be a 3-letter ISO code (e.g. EGP)", true);
        return;
      }
      await api("POST", "/admin/countries", {
        name,
        code,
        currency,
        flag: document.getElementById("zf-flag")?.value?.trim() || "",
      });
    } else if (zoneMode === "gov") {
      await api("POST", "/admin/governorates", {
        country: selCountry,
        name,
        shippingPrice: +(document.getElementById("zf-price")?.value || 35),
      });
    } else if (zoneMode === "district") {
      await api("POST", "/admin/districts", {
        governorate: selGov,
        name,
        shippingPrice: +(document.getElementById("zf-price")?.value || 35),
      });
    }
    closeAll();
    await loadZones();
    await loadCarriers();
    toast("Saved");
  } catch (e) {
    toast(e.message, true);
  }
}

// â”€â”€ Init â”€â”€
document.getElementById("api-section").style.display = "none";
document.getElementById("manual-section").style.display = "";
onCarrierTypeChange();

if (token) {
  document.getElementById("login-overlay").classList.add("hidden");
  const savedBase = localStorage.getItem("oxxila_api_base");
  if (savedBase) document.getElementById("api-base").value = savedBase;
  const savedBosta = localStorage.getItem("oxxila_bosta_default_base");
  const bostaEl = document.getElementById("bosta-default-base");
  if (savedBosta && bostaEl) bostaEl.value = savedBosta;
  loadAll().catch(() => {
    token = "";
    localStorage.removeItem("oxxila_admin_token");
    document.getElementById("login-overlay").classList.remove("hidden");
  });
}

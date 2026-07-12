// public/js/shipping-admin.pickups.js

const BostaPickups = (() => {
  let districtsCache = null;
  let formWired = false;
  const DISTRICTS_TTL_MS = 5 * 60 * 1000;
  const LS_KEY = 'oxxila_bosta_districts';
  const LS_TS = 'oxxila_bosta_districts_ts';

  const $ = (id) => document.getElementById(id);

  const loadDistricts = async (carrierId) => {
    if (districtsCache?.length) return districtsCache;

    const ts = localStorage.getItem(LS_TS);
    const raw = localStorage.getItem(LS_KEY);
    if (raw && ts && Date.now() - Number(ts) < DISTRICTS_TTL_MS) {
      try {
        districtsCache = JSON.parse(raw);
        if (districtsCache?.length) return districtsCache;
      } catch {
        districtsCache = null;
      }
    }

    const { data } = await api('GET', '/admin/carriers/' + carrierId + '/bosta/districts-lookup');
    districtsCache = Array.isArray(data) ? data : [];
    localStorage.setItem(LS_KEY, JSON.stringify(districtsCache));
    localStorage.setItem(LS_TS, String(Date.now()));
    return districtsCache;
  };

  const resetDistrictsCache = () => {
    districtsCache = null;
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_TS);
  };

  const fillCitySelect = () => {
    const citySel = $('pickup-city-sel');
    if (!citySel) return;
    citySel.innerHTML =
      '<option value="">Select city</option>' +
      (districtsCache || [])
        .map((c) => {
          const label = c.cityOtherName ? `${c.cityName} (${c.cityOtherName})` : c.cityName;
          return `<option value="${esc(c.cityId)}" data-name="${esc(c.cityName)}">${esc(label)}</option>`;
        })
        .join('');
    const distSel = $('pickup-district-sel');
    if (distSel) distSel.innerHTML = '<option value="">Select district</option>';
    updateSaveEnabled();
  };

  const onCityChange = () => {
    const citySel = $('pickup-city-sel');
    const distSel = $('pickup-district-sel');
    if (!citySel || !distSel) return;
    const city = (districtsCache || []).find((c) => c.cityId === citySel.value);
    distSel.innerHTML =
      '<option value="">Select district</option>' +
      (city?.districts || [])
        .map((d) => {
          const label = d.districtName || d.zoneName;
          return `<option value="${esc(d.districtId)}" data-zone-id="${esc(d.zoneId || '')}">${esc(label)}</option>`;
        })
        .join('');
    updateSaveEnabled();
  };

  const hideForm = () => $('pickup-inline-form')?.classList.add('hidden');

  const clearForm = () => {
    ['pickup-name', 'pickup-first-line', 'pickup-contact-phone'].forEach((id) => {
      const input = $(id);
      if (input) input.value = '';
    });
    const contactName = $('pickup-contact-name');
    if (contactName && !contactName.value.trim()) contactName.value = '';
    const def = $('pickup-is-default');
    if (def) def.checked = true;
    fillCitySelect();
    updateSaveEnabled();
  };

  const isFormValid = () => {
    const locationName = $('pickup-name')?.value?.trim();
    const firstLine = $('pickup-first-line')?.value?.trim();
    const cityId = $('pickup-city-sel')?.value;
    const distSel = $('pickup-district-sel');
    const districtId = distSel?.value;
    const zoneId = distSel?.selectedOptions?.[0]?.dataset?.zoneId || '';
    const contactPhone = $('pickup-contact-phone')?.value?.trim();
    return Boolean(locationName && firstLine && cityId && zoneId && districtId && contactPhone);
  };

  const updateSaveEnabled = () => {
    const btn = $('pickup-save-btn');
    if (btn) btn.disabled = !isFormValid();
  };

  const wireFormValidation = () => {
    if (formWired) return;
    formWired = true;
    ['pickup-name', 'pickup-first-line', 'pickup-contact-phone'].forEach((id) => {
      $(id)?.addEventListener('input', updateSaveEnabled);
    });
    $('pickup-city-sel')?.addEventListener('change', updateSaveEnabled);
    $('pickup-district-sel')?.addEventListener('change', updateSaveEnabled);
  };

  const renderList = (carrierId, pickups) => {
    const listEl = $('pickups-list');
    if (!listEl) return;
    if (!pickups.length) {
      listEl.innerHTML =
        '<span style="color:var(--muted2)">No pickups — import from Bosta or add manually</span>';
      return;
    }
    listEl.innerHTML = pickups
      .map((p) => {
        const sub = [p.address?.city, p.address?.districtName].filter(Boolean).join(' · ');
        const row =
          'padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:6px';
        const defaultBtn = p.isDefault
          ? ''
          : `<button type="button" class="btn btn-secondary" style="font-size:10px;padding:3px 6px" onclick="BostaPickups.setDefault('${carrierId}','${p._id}')">Default</button>`;
        return `<div style="${row}">
          <div style="min-width:0"><strong style="font-size:12px">${esc(p.locationName)}</strong>${p.isDefault ? ' <span class="bosta-badge">Default</span>' : ''}<br><span style="color:var(--muted);font-size:10px">${esc(sub)}</span></div>
          <div style="display:flex;gap:4px;flex-shrink:0">${defaultBtn}<button type="button" class="btn btn-secondary" style="font-size:10px;padding:3px 6px" onclick="BostaPickups.remove('${carrierId}','${p._id}')">Del</button></div>
        </div>`;
      })
      .join('');
  };

  const syncFromBosta = async () => {
    if (!editingCarrierId) {
      toast('Save carrier with API key first', true);
      return;
    }
    const listEl = $('pickups-list');
    const syncBtn = $('pickups-sync-btn');
    if (syncBtn?.disabled) return;
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.dataset.prevHtml = syncBtn.innerHTML;
      syncBtn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i>';
    }
    if (listEl) listEl.textContent = 'Syncing from Bosta…';
    try {
      const { data } = await api(
        'POST',
        '/admin/carriers/' + editingCarrierId + '/bosta/sync-pickups',
      );
      renderList(editingCarrierId, data || []);
      toast('Pickups imported from Bosta');
    } catch (e) {
      if (listEl) listEl.textContent = e.message;
      toast(e.message, true);
    } finally {
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = syncBtn.dataset.prevHtml || '<i class="ti ti-download"></i>';
        delete syncBtn.dataset.prevHtml;
      }
    }
  };

  const load = async (carrierId) => {
    const listEl = $('pickups-list');
    if (!listEl) return;
    try {
      const { data } = await api('GET', '/admin/carriers/' + carrierId + '/pickups');
      renderList(carrierId, data || []);
    } catch (e) {
      listEl.textContent = e.message;
    }
  };

  const toggleForm = async (show) => {
    const form = $('pickup-inline-form');
    if (!form) return;
    wireFormValidation();
    const shouldShow = show === undefined ? form.classList.contains('hidden') : show;
    if (!shouldShow) {
      hideForm();
      return;
    }
    if (!editingCarrierId) {
      toast('Save carrier with API key first', true);
      return;
    }
    try {
      await loadDistricts(editingCarrierId);
      fillCitySelect();
      form.classList.remove('hidden');
      updateSaveEnabled();
    } catch (e) {
      toast(e.message || 'Could not load Bosta districts', true);
    }
  };

  const submit = async () => {
    if (!editingCarrierId) return;
    const locationName = $('pickup-name')?.value?.trim();
    const firstLine = $('pickup-first-line')?.value?.trim();
    const citySel = $('pickup-city-sel');
    const distSel = $('pickup-district-sel');
    const cityId = citySel?.value;
    const cityName = citySel?.selectedOptions?.[0]?.dataset?.name || '';
    const districtId = distSel?.value;
    const zoneId = distSel?.selectedOptions?.[0]?.dataset?.zoneId || '';
    const districtName = distSel?.selectedOptions?.[0]?.textContent?.trim() || '';
    const contactName = $('pickup-contact-name')?.value?.trim() || 'Warehouse';
    const contactPhone = $('pickup-contact-phone')?.value?.trim();
    const isDefault = $('pickup-is-default')?.checked;
    const saveBtn = $('pickup-save-btn');

    if (!isFormValid()) {
      toast('Fill all fields including city and district', true);
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
    }

    try {
      await api('POST', '/admin/carriers/' + editingCarrierId + '/pickups', {
        locationName,
        contactPerson: { name: contactName, phone: contactPhone, email: '' },
        address: { firstLine, city: cityName, cityId, zoneId, districtId, districtName },
        isDefault: !!isDefault,
      });
      hideForm();
      clearForm();
      await load(editingCarrierId);
      toast(isDefault ? 'Pickup added as default' : 'Pickup added');
    } catch (e) {
      toast(e.message, true);
      updateSaveEnabled();
    } finally {
      if (saveBtn) saveBtn.textContent = 'Save pickup';
      updateSaveEnabled();
    }
  };

  const setDefault = async (carrierId, pickupId) => {
    try {
      await api('PUT', '/admin/carriers/' + carrierId + '/pickups/' + pickupId + '/default');
      await load(carrierId);
      toast('Default pickup updated');
    } catch (e) {
      toast(e.message, true);
    }
  };

  const remove = async (carrierId, pickupId) => {
    if (!confirm('Delete this pickup?')) return;
    try {
      await api('DELETE', '/admin/carriers/' + carrierId + '/pickups/' + pickupId);
      await load(carrierId);
      toast('Pickup deleted');
    } catch (e) {
      toast(e.message, true);
    }
  };

  const setSectionVisible = (visible) => {
    const sec = $('bosta-pickups-section');
    if (sec) sec.style.display = visible ? '' : 'none';
  };

  return {
    load,
    syncFromBosta,
    toggleForm,
    hideForm,
    submit,
    onCityChange,
    setDefault,
    remove,
    setSectionVisible,
    resetDistrictsCache,
  };
})();

function onPickupCityChange() {
  BostaPickups.onCityChange();
}

function togglePickupInlineForm(show) {
  BostaPickups.toggleForm(show);
}

function submitPickupInlineForm() {
  BostaPickups.submit();
}

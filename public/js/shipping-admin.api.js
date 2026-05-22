// public/js/shipping-admin.api.js
(function () {
  const getApiBase = () =>
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
      .replace(/"/g, '&quot;');
  }

  async function api(method, path, body) {
    const token = localStorage.getItem('oxxila_admin_token') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(getApiBase() + path, {
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

  window.OxxilaShippingAdmin = { getApiBase, toast, esc, api };
})();

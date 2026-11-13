// VECTOR — server bilan aloqa va umumiy yordamchilar
(function () {
  'use strict';
  const TOKEN = 'vx_token', ADMIN = 'vx_admin', THEME = 'vx_theme', PUB = 'vx_public';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
    sget(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    sset(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (_) {} }
  };

  /** Serverga so'rov. text/plain — Apps Script uchun (CORS oldindan so'rovisiz ishlaydi). */
  async function call(action, data, opts) {
    opts = opts || {};
    const body = Object.assign({ action }, data || {});
    const tok = opts.admin ? store.sget(ADMIN) : store.get(TOKEN);
    if (tok && !body.token) body.token = tok;
    if (!window.VECTOR_API || /BU_YERGA/.test(window.VECTOR_API)) throw apiErr("Sayt hali serverga ulanmagan: assets/js/config.js faylida VECTOR_API manzilini yozing.", 'config');
    let res;
    // faqat o'qish so'rovlari qayta yuboriladi (xarid yoki to'lov ikki marta bajarilmasligi uchun)
    const tries = /^(public|me|courses|lesson|coins|shop|orders|plans|payments|a\.(stats|users|courses|products|orders|payments|plans|settings|coinlog))$/.test(action) ? 3 : 1;
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        const r = await fetch(window.VECTOR_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
        res = await r.json();
        break;
      } catch (e) {
        if (attempt === tries - 1) throw apiErr("Internet yoki server bilan aloqa yo'q. Qayta urinib ko'ring.", 'network');
        await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
      }
    }
    if (!res || !res.ok) {
      const err = apiErr((res && res.error) || 'Xatolik yuz berdi.', res && res.code);
      if (err.code === 'auth') { if (opts.admin) store.sset(ADMIN, null); else store.set(TOKEN, null); }
      if (err.code === 'busy' && !opts.retried) { await new Promise(r => setTimeout(r, 1500)); return call(action, data, Object.assign({}, opts, { retried: true })); }
      throw err;
    }
    return res;
  }
  function apiErr(msg, code) { const e = new Error(msg); e.code = code; return e; }

  /** Bosh sahifa ma'lumotlari: brauzerda 10 daqiqa eslab qolinadi (tez ochilishi uchun) */
  async function publicData(force) {
    const raw = store.get(PUB);
    if (raw && !force) { try { const j = JSON.parse(raw); if (Date.now() - j.t < 600000) return j.d; } catch (_) {} }
    const d = await call('public');
    store.set(PUB, JSON.stringify({ t: Date.now(), d }));
    return d;
  }
  function cachedPublic() { try { return JSON.parse(store.get(PUB)).d; } catch (_) { return null; } }

  // ---------- yordamchilar ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => Number(n || 0).toLocaleString('ru-RU').replace(/ /g, ' ') + " so'm";
  const num = n => Number(n || 0).toLocaleString('ru-RU').replace(/ /g, ' ');
  const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  const date = s => { const d = new Date(s); return isNaN(d) ? '' : d.getDate() + '-' + MONTHS[d.getMonth()] + ', ' + d.getFullYear(); };
  const dateTime = s => { const d = new Date(s); return isNaN(d) ? '' : date(s) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const daysLeft = s => Math.max(0, Math.ceil((Date.parse(s) - Date.now()) / 864e5));
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const safeUrl = u => { u = String(u || ''); return /^(https:\/\/|assets\/|\.\/assets\/)/.test(u) ? u : ''; };
  const avatarHtml = (u, size) => {
    const s = size ? ` style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px"` : '';
    return `<span class="avatar"${s}>${safeUrl(u && u.avatar) ? `<img src="${esc(u.avatar)}" alt="">` : esc(initials(u && u.name))}</span>`;
  };

  function toast(msg, type) {
    let box = document.querySelector('.toast-box');
    if (!box) { box = document.createElement('div'); box.className = 'toast-box'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), type === 'error' ? 5000 : 3200);
  }

  /** Modal oyna. html — ichki qism; qaytaradi: {el, close} */
  function modal(html, opts) {
    opts = opts || {};
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    const prev = document.activeElement;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); opts.onClose && opts.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    bg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    const f = bg.querySelector('input, select, textarea, button:not([data-close])'); if (f) setTimeout(() => f.focus(), 30);
    return { el: bg.querySelector('.modal'), close };
  }
  function confirmBox(text, okText, danger) {
    return new Promise(res => {
      const m = modal(`<h2>Tasdiqlang</h2><p class="muted" style="margin:6px 0 20px">${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn btn-plain" data-close>Bekor qilish</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText || 'Ha')}</button></div>`, { onClose: () => res(false) });
      m.el.querySelector('[data-ok]').addEventListener('click', () => { res(true); m.close(); });
    });
  }

  /** Tugma bosilganda kutish holati */
  async function busy(btn, fn) {
    if (btn && btn.classList.contains('is-busy')) return;
    const txt = btn ? btn.innerHTML : '';
    if (btn) { btn.classList.add('is-busy'); btn.disabled = true; btn.innerHTML = '<span class="spin" aria-hidden="true"></span>' + txt; }
    try { return await fn(); } finally { if (btn) { btn.classList.remove('is-busy'); btn.disabled = false; btn.innerHTML = txt; } }
  }

  /** Rasmni brauzerda kichraytirish (yuklashdan oldin) */
  function resizeImage(file, max, quality) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('Rasm faylini tanlang.'));
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', quality || 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Rasmni o'qib bo'lmadi.")); };
      img.src = url;
    });
  }

  // ---------- mavzu (yorug'/qorong'i) ----------
  function applyTheme(t) {
    t = t || store.get(THEME) || 'light';
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    store.set(THEME, t);
  }
  applyTheme();

  // ---------- ikonkalar (SVG) ----------
  const P = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    play: 'M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7',
    shop: 'M4 7h16l-1.5 12.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5zM8 7a4 4 0 0 1 8 0',
    coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v10m-3-7.5c0-1 1.3-1.5 3-1.5s3 .7 3 2-1.3 1.6-3 2-3 .8-3 2 1.3 2 3 2 3-.5 3-1.5',
    card: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h3',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
    users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4.5-6.5',
    logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3',
    lock: 'M6 10V8a6 6 0 1 1 12 0v2M5 10h14v11H5z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6 6 18',
    plus: 'M12 5v14M5 12h14',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-2-4-6-4-6-1.5S9 7 12 7zm0 0c2-4 6-4 6-1.5S15 7 12 7z',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z',
    box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    arrowL: 'M15 18l-6-6 6-6', arrowR: 'M9 6l6 6-6 6',
    cake: 'M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2zM4 16c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0M12 7v4M12 3c1 1.2 1 2.4 0 3-1-.6-1-1.8 0-3z',
    tg: 'M21.5 4.5 2.8 11.7c-.9.4-.9 1.6.1 1.9l4.6 1.4 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.7 3.5c.6.4 1.4.1 1.6-.6L22.9 5.8c.2-.9-.6-1.6-1.4-1.3zM8 14.6l9.2-6.3',
    shield: 'M12 3l8 3v6c0 4.8-3.4 8.5-8 9-4.6-.5-8-4.2-8-9V6z',
    video: 'M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM17 10l4-2.5v9L17 14',
    quiz: 'M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9V15M12 19h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
    insta: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm5.5-1.5h.01',
    pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    camera: 'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    flame: 'M12 22c4 0 7-2.8 7-6.8 0-3.4-2.2-5.6-3.6-7.2-.4 1.8-1.4 3-2.6 3.4.4-3.4-1-6.6-4.3-8.4.3 3-1 4.8-2.6 6.6C4.6 11.1 5 12.6 5 15.2 5 19.2 8 22 12 22z',
    crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 19h14',
    trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6'
  };
  const icon = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || ''}"/></svg>`;

  // aylanadigan belgi (tugmalarda)
  const st = document.createElement('style');
  st.textContent = '.spin{width:16px;height:16px;border-radius:50%;border:2.5px solid currentColor;border-right-color:transparent;animation:spin .7s linear infinite;flex:none}@keyframes spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(st);

  window.VX = {
    call, publicData, cachedPublic, store, esc, money, num, date, dateTime, daysLeft, initials, safeUrl, avatarHtml, toast, modal, confirmBox, busy, resizeImage, applyTheme, icon,
    token: () => store.get(TOKEN), setToken: t => store.set(TOKEN, t),
    adminToken: () => store.sget(ADMIN), setAdminToken: t => store.sset(ADMIN, t),
    clearPublic: () => store.set(PUB, null)
  };
})();

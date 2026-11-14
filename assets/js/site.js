// VECTOR — ommaviy sahifalarning umumiy qismi: header (menyu, kirish tugmalari, mobil menyu), footer, animatsiyalar
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAV = [['index.html', 'Asosiy'], ['dokon.html', "Do'kon"], ['kurslar.html', 'Kurslar'], ['elchilar.html', 'Elchilar']];
  const here = (location.pathname.split('/').pop() || 'index.html');
  const loggedIn = (() => { try { return !!localStorage.getItem('vx_token'); } catch (_) { return false; } })();

  // Kirgan o'quvchi uchun menyu (vectortalim kabinetidagi kabi)
  const NAV_IN = [['kabinet.html#premium', 'Premium', 'prem'], ['index.html', 'Asosiy'], ['kabinet.html#dokon', "Do'kon"], ['kabinet.html#kurslar', 'Kurslar'], ['kabinet.html#liderlar', 'Liderlar']];
  const CROWN = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" fill="#FFC21A" stroke="#E08A00" stroke-width="1.2" stroke-linejoin="round"/><circle cx="7" cy="14" r="1.2" fill="#E5484D"/><circle cx="12" cy="14" r="1.2" fill="#1E63F0"/><circle cx="17" cy="14" r="1.2" fill="#12A150"/></svg>';
  const meCache = () => { try { return JSON.parse(localStorage.getItem('vx_me') || 'null'); } catch (_) { return null; } };
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 1).map(w => w[0]).join('').toUpperCase();
  function paintMe(u) {
    const box = document.getElementById('vuMe'); if (!box || !u) return;
    const first = String(u.name || '').trim().split(/\s+/)[0] || '';
    const ava = /^https:\/\//.test(u.avatar || '') ? `<img src="${esc(u.avatar)}" alt="">` : esc(initials(u.name));
    box.innerHTML = `<span class="vu-ava">${ava}</span><span class="vu-nm"><b>${esc(first)}</b><small>Coin ${Number(u.coins || 0).toLocaleString('en-US').replace(/,/g, '.')}</small></span>`;
  }
  function markActive() {
    const cur = here + (location.hash || '').split('/')[0];
    document.querySelectorAll('[data-vu]').forEach(a => { const on = a.dataset.vu === cur || (cur === 'kabinet.html#kurs' || cur === 'kabinet.html#dars') && a.dataset.vu === 'kabinet.html#kurslar'; if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function headerUser() {
    const el = document.getElementById('vh');
    const pub = (window.VX && VX.cachedPublic()) || {}, mini = (pub.settings || {}).mini_app || '';
    const link = ([h, t, k]) => `<a href="${h}" data-vu="${h}"${k === 'prem' ? ' class="vu-prem"' : ''}>${k === 'prem' ? CROWN : ''}${t}</a>`;
    el.className = 'vh vu';
    el.innerHTML = `<div class="vu-in">
        <div class="vu-bar">
          <a class="vh-logo" href="index.html" aria-label="VECTOR bosh sahifa"><img src="assets/img/vector-logo.png" alt="" width="40" height="40"><span>VECTOR</span></a>
          <nav class="vu-nav" aria-label="Asosiy menyu">${NAV_IN.map(link).join('')}${/^https:\/\//.test(mini) ? `<a href="${esc(mini)}" target="_blank" rel="noopener">Mini app</a>` : '<span class="vu-off" title="Tez orada">Mini app</span>'}</nav>
          <a class="vu-bell" href="kabinet.html#bildirishnoma" aria-label="Bildirishnomalar"><span class="ms">notifications</span></a>
          <button class="vh-burger ms" type="button" aria-label="Menyu" aria-expanded="false">menu</button>
        </div>
        <a class="vu-me" id="vuMe" href="kabinet.html#profil" aria-label="Profil"></a>
      </div>`;
    paintMe(meCache());
    const dr = document.createElement('div');
    dr.className = 'vh-drawer';
    dr.innerHTML = `<div class="ov"></div><div class="panel" role="dialog" aria-label="Menyu">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><a class="vh-logo" href="index.html"><img src="assets/img/vector-logo.png" alt=""><span>VECTOR</span></a><button type="button" class="vh-burger ms" data-x aria-label="Yopish" style="display:grid">close</button></div>
        ${NAV_IN.map(([h, t]) => `<a class="lnk" href="${h}" data-vu="${h}">${t}</a>`).join('')}
        <a class="lnk" href="kabinet.html#bildirishnoma" data-vu="kabinet.html#bildirishnoma">Bildirishnomalar</a>
        <a class="lnk" href="kabinet.html#profil" data-vu="kabinet.html#profil">Profil</a></div>`;
    document.body.appendChild(dr);
    const b = el.querySelector('.vh-burger');
    const set = o => { dr.classList.toggle('open', o); b.setAttribute('aria-expanded', o); };
    b.onclick = () => set(true);
    dr.querySelector('.ov').onclick = () => set(false);
    dr.querySelector('[data-x]').onclick = () => set(false);
    dr.querySelectorAll('a').forEach(a => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
    markActive(); window.addEventListener('hashchange', markActive);
    // kabinetdan tashqarida ism va coinlarni yangilab olamiz
    if (here !== 'kabinet.html' && window.VX) VX.call('me', { lite: 1 }).then(r => { try { localStorage.setItem('vx_me', JSON.stringify({ name: r.user.name, coins: r.user.coins, avatar: r.user.avatar })); } catch (_) {} paintMe(r.user); }).catch(() => {});
  }

  function header() {
    const el = document.getElementById('vh');
    if (!el) return;
    if (loggedIn) return headerUser();
    const nav = NAV.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${t}</a>`).join('');
    const auth = loggedIn
      ? `<a class="btn-blue vh-auth" href="kabinet.html"><span class="ms" style="font-size:20px">person</span>Kabinet</a>`
      : `<a class="btn-out vh-auth" href="kirish.html">Kirish</a><a class="btn-blue vh-auth" href="kirish.html?mode=register">Ro'yxatdan o'tish</a>`;
    el.className = 'vh';
    el.innerHTML = `<div class="vh-in">
        <a class="vh-logo" href="index.html" aria-label="VECTOR bosh sahifa"><img src="assets/img/vector-logo.png" alt="" width="36" height="36"><span>VECTOR</span></a>
        <nav class="vh-nav" aria-label="Asosiy menyu">${nav}</nav>
        <div class="vh-right">${auth}<button class="vh-burger ms" type="button" aria-label="Menyu" aria-expanded="false">menu</button></div>
      </div>`;
    const dr = document.createElement('div');
    dr.className = 'vh-drawer';
    dr.innerHTML = `<div class="ov"></div><div class="panel" role="dialog" aria-label="Menyu">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><a class="vh-logo" href="index.html"><img src="assets/img/vector-logo.png" alt=""><span>VECTOR</span></a><button type="button" class="vh-burger ms" data-x aria-label="Yopish" style="display:grid">close</button></div>
        ${NAV.map(([h, t]) => `<a class="lnk" href="${h}"${h === here ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
        <div class="acts">${loggedIn ? '<a class="btn-blue" href="kabinet.html">Kabinetga o\'tish</a>' : '<a class="btn-out" href="kirish.html">Kirish</a><a class="btn-blue" href="kirish.html?mode=register">Ro\'yxatdan o\'tish</a>'}</div></div>`;
    document.body.appendChild(dr);
    const b = el.querySelector('.vh-burger');
    const set = o => { dr.classList.toggle('open', o); b.setAttribute('aria-expanded', o); };
    b.onclick = () => set(true);
    dr.querySelector('.ov').onclick = () => set(false);
    dr.querySelector('[data-x]').onclick = () => set(false);
    dr.querySelectorAll('a').forEach(a => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  }

  function footer(s) {
    const el = document.getElementById('vf');
    if (!el) return;
    s = s || {};
    const tg = String(s.telegram || 'vectoradminn').replace(/^@/, ''), ig = String(s.instagram || '').replace(/^@/, '');
    const soc = [
      ['send', 'Telegram', tg ? 'https://t.me/' + tg : ''], ['photo_camera', 'Instagram', ig ? 'https://instagram.com/' + ig : ''],
      ['play_arrow', 'YouTube', s.youtube], ['thumb_up', 'Facebook', s.facebook]
    ].filter(x => /^https:\/\//.test(x[2] || ''));
    el.className = 'vf';
    el.innerHTML = `<div class="vf-grid">
        <div class="col" style="gap:14px"><span class="vh-logo" style="color:#fff"><img src="assets/img/vector-logo.png" alt=""><span>VECTOR</span></span>
          <p style="margin:0;color:rgba(255,255,255,.75);font-size:14px;line-height:1.6;max-width:260px">IT sohasini noldan boshlab, professionallik sari qadam qo'ying.</p></div>
        <nav class="col" aria-label="Sayt xaritasi"><h3>Sayt xaritasi</h3>${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
        <div class="col"><h3>Aloqa</h3>
          ${s.phone ? `<a href="tel:${esc(String(s.phone).replace(/[^+\d]/g, ''))}"><span class="ms" style="font-size:18px">call</span>${esc(s.phone)}</a>` : ''}
          <a href="https://t.me/${esc(tg)}" target="_blank" rel="noopener"><span class="ms" style="font-size:18px">send</span>@${esc(tg)}</a>
          ${s.address ? `<span class="t"><span class="ms" style="font-size:18px">location_on</span>${esc(s.address)}</span>` : ''}</div>
        <div class="col"><h3>Ijtimoiy tarmoqlar</h3><div class="soc">${soc.map(([i, n, u]) => `<a class="ms" href="${esc(u)}" target="_blank" rel="noopener" aria-label="${n}">${i}</a>`).join('')}</div></div>
      </div>
      <div class="copy">© ${new Date().getFullYear()} Vector ta'lim platformasi. Barcha huquqlar himoyalangan.</div>`;
  }

  function reveal() {
    const els = document.querySelectorAll('[data-reveal]:not(.in)');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(e => { e.style.transitionDelay = (e.dataset.delay || 0) + 'ms'; io.observe(e); });
  }

  /** Mehmon uchun "ro'yxatdan o'ting" oynasi */
  function gate(title, text) {
    const bg = document.createElement('div');
    bg.className = 'vm-bg';
    bg.innerHTML = `<div class="vm" role="dialog" aria-modal="true" aria-labelledby="gate-h"><button class="x ms" type="button" aria-label="Yopish">close</button>
      <img src="assets/img/vector-logo.png" alt="" width="64" height="64" style="width:64px;height:64px;border-radius:18px">
      <h2 id="gate-h">${esc(title)}</h2><p>${esc(text)}</p>
      <a class="btn-orange" style="width:100%;margin-top:8px;font-size:16px;padding:14px" href="kirish.html?mode=register">Ro'yxatdan o'tish</a>
      <p style="font-size:14px">Akkauntingiz bormi? <a href="kirish.html" style="font-weight:600">Kirish</a></p></div>`;
    const close = () => bg.remove();
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    bg.querySelector('.x').onclick = close;
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    document.body.appendChild(bg);
    bg.querySelector('a').focus();
  }

  header();
  footer((window.VX && VX.cachedPublic() || {}).settings);
  window.VSite = { footer, reveal, gate, loggedIn, esc, paintMe };
  if (window.VX) VX.publicData().then(d => footer(d.settings)).catch(() => {});
  reveal();
})();

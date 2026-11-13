// VECTOR — ommaviy sahifalarning umumiy qismi: header (menyu, kirish tugmalari, mobil menyu), footer, animatsiyalar
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAV = [['index.html', 'Asosiy'], ['dokon.html', "Do'kon"], ['kurslar.html', 'Kurslar'], ['elchilar.html', 'Elchilar']];
  const here = (location.pathname.split('/').pop() || 'index.html');
  const loggedIn = (() => { try { return !!localStorage.getItem('vx_token'); } catch (_) { return false; } })();

  function header() {
    const el = document.getElementById('vh');
    if (!el) return;
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
  window.VSite = { footer, reveal, gate, loggedIn, esc };
  if (window.VX) VX.publicData().then(d => footer(d.settings)).catch(() => {});
  reveal();
})();

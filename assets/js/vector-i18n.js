// Vector: UZ / RU / EN tarjima dvigateli. Sahifadagi matnlarni lug'at (vector-i18n-dict.js) bo'yicha almashtiradi.
(function () {
  if (window.__vectorI18n) return; window.__vectorI18n = true;
  var KEY = 'vector_lang', LANGS = ['uz', 'ru', 'en'], LABEL = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };
  var lang = 'uz'; try { lang = localStorage.getItem(KEY) || 'uz'; } catch (e) {}
  if (LANGS.indexOf(lang) < 0) lang = 'uz';
  var map = null, frag = null, TXT = new WeakMap(), ATT = new WeakMap(), ATTRS = ['placeholder', 'aria-label', 'alt', 'title'];
  var norm = function (s) { return s.replace(/\s+/g, ' ').trim(); };
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var RULES = [
    [/^(\d+)-sinf$/, ['$1 класс', 'Grade $1']],
    [/^(\d+)-savol$/, ['Вопрос $1', 'Question $1']],
    [/^(\d+) ta kurs$/, ['Курсов: $1', '$1 courses']],
    [/^(\d+) ta sharh$/, ['Отзывов: $1', '$1 reviews']],
    [/^(\d+) ta do'stga$/, ['за $1 друзей', 'for $1 friends']],
    [/^(\d+) ta$/, ['$1', '$1']],
    [/^Kod (\d+) soatdan keyin yangilanadi$/, ['Код обновится через $1 ч', 'Code refreshes in $1 h']],
    [/^Keyingi o'ringa (\S+) coin qoldi$/, ['До следующего места: $1 coin', '$1 coins to the next place']],
    [/^Obunangiz (\d+) kundan so'ng tugaydi$/, ['Подписка закончится через $1 дн.', 'Your plan ends in $1 days']],
    [/^([\d.,\s]+) so'm$/, ['$1 сум', '$1 UZS']],
    [/^([\d.,\s]+) coin$/, ['$1 coin', '$1 coins']],
    [/^(\d+) \/ (\d+)$/, ['$1 / $2', '$1 / $2']]
  ];
  function build() {
    var D = window.VECTOR_DICT || [], keys = []; map = new Map();
    D.forEach(function (r) { map.set(norm(r[0]), r); if (r[0].length >= 3 && (r[0] !== r[1] || r[0] !== r[2])) keys.push(r[0]); });
    keys.sort(function (a, b) { return b.length - a.length; });
    try { frag = new RegExp("(?<![\\p{L}'’])(" + keys.map(esc).join('|') + ")(?![\\p{L}'’])", 'gu'); } catch (e) { frag = null; }
  }
  function tr(s) {
    if (lang === 'uz' || !map) return s;
    var i = lang === 'ru' ? 1 : 2, k = norm(s); if (!k) return s;
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], r = map.get(k);
    if (r) return lead + r[i] + trail;
    for (var j = 0; j < RULES.length; j++) if (RULES[j][0].test(k)) return lead + k.replace(RULES[j][0], RULES[j][1][i - 1]) + trail;
    if (/^[a-z_0-9]+$/.test(k) || !frag || k.length > 700) return s;
    var out = k.replace(frag, function (m) { var e = map.get(m); return e ? e[i] : m; });
    return lead + out + trail;
  }
  function skip(el) { for (; el && el.nodeType === 1; el = el.parentNode) { var t = el.tagName; if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA' || t === 'CODE' || el.hasAttribute('data-no-i18n')) return true; } return false; }
  function doText(n) {
    if (!n.parentNode || skip(n.parentNode)) return;
    var cur = n.nodeValue, st = TXT.get(n);
    if (!st || cur !== st.out) st = { src: cur };
    st.out = tr(st.src); TXT.set(n, st);
    if (st.out !== cur) n.nodeValue = st.out;
  }
  function doAttrs(el) {
    if (skip(el)) return;
    var bag = ATT.get(el) || {};
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var cur = el.getAttribute(a), st = bag[a];
      if (!st || cur !== st.out) st = { src: cur };
      st.out = tr(st.src); bag[a] = st;
      if (st.out !== cur) el.setAttribute(a, st.out);
    });
    ATT.set(el, bag);
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) n.nodeType === 3 ? doText(n) : doAttrs(n);
  }
  var queue = new Set(), raf = 0;
  function flush() { raf = 0; var q = Array.from(queue); queue.clear(); q.forEach(walk); mountSwitch(); }
  function push(n) { queue.add(n); if (!raf) raf = requestAnimationFrame(flush); }
  var titleSrc = null, titleOut = null;
  function doTitle() { var t = document.title; if (titleSrc === null || t !== titleOut) titleSrc = t; titleOut = tr(titleSrc); if (titleOut !== t) document.title = titleOut; }

  // Til tanlagich (headerga joylashadi)
  var sw = null, menuOpen = false;
  function swBtnStyle(el) { el.style.cssText = "height:40px;min-width:56px;padding:0 10px;border:1.5px solid #D5DEEC;border-radius:12px;background:#fff;color:#0B1E4F;font:600 14px Inter,Manrope,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;gap:4px;cursor:pointer;flex:none"; }
  function buildSwitch() {
    var wrap = document.createElement('div'); wrap.setAttribute('data-no-i18n', ''); wrap.setAttribute('data-vector-lang', '');
    wrap.style.cssText = 'position:relative;flex:none;display:flex;align-items:center';
    var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-label', 'Til / Язык / Language'); swBtnStyle(b);
    var m = document.createElement('div'); m.setAttribute('role', 'menu');
    m.style.cssText = 'position:absolute;right:0;top:calc(100% + 8px);z-index:200;min-width:160px;background:#fff;border-radius:14px;box-shadow:0 18px 40px rgba(11,30,79,.22);padding:6px;display:none;flex-direction:column;gap:2px';
    LANGS.forEach(function (L) {
      var o = document.createElement('button'); o.type = 'button'; o.setAttribute('role', 'menuitemradio'); o.dataset.l = L;
      o.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;height:40px;padding:0 12px;border:0;border-radius:10px;background:transparent;cursor:pointer;font:500 15px Inter,Manrope,system-ui,sans-serif;color:#0F172A;text-align:left';
      o.onmouseenter = function () { o.style.background = '#F1F5FB'; }; o.onmouseleave = function () { o.style.background = o.dataset.l === lang ? '#EAF2FF' : 'transparent'; };
      o.onclick = function (e) { e.stopPropagation(); setLang(L); toggle(false); };
      m.appendChild(o);
    });
    b.onclick = function (e) { e.stopPropagation(); toggle(!menuOpen); };
    wrap.appendChild(b); wrap.appendChild(m); sw = { wrap: wrap, b: b, m: m }; paintSwitch();
    document.addEventListener('click', function () { if (menuOpen) toggle(false); });
    return wrap;
  }
  function toggle(v) { menuOpen = v; if (sw) { sw.m.style.display = v ? 'flex' : 'none'; sw.b.setAttribute('aria-expanded', v ? 'true' : 'false'); } }
  function paintSwitch() {
    if (!sw) return;
    sw.b.innerHTML = '<span aria-hidden="true" style="font-family:\'Material Symbols Rounded\';font-size:18px;color:#1E63F0">language</span>' + lang.toUpperCase();
    Array.prototype.forEach.call(sw.m.children, function (o) { var on = o.dataset.l === lang; o.setAttribute('aria-checked', on ? 'true' : 'false'); o.style.background = on ? '#EAF2FF' : 'transparent'; o.style.color = on ? '#1E63F0' : '#0F172A'; o.innerHTML = '<span>' + LABEL[o.dataset.l] + '</span><span style="font-size:12px;color:#94A3B8">' + o.dataset.l.toUpperCase() + '</span>'; });
  }
  function mountSwitch() {
    var h = document.querySelector('header'); if (!h) return;
    if (sw && h.contains(sw.wrap)) return;
    var bell = h.querySelector('[aria-label="Bildirishnomalar"],[aria-label="Уведомления"],[aria-label="Notifications"]');
    if (bell && bell.offsetParent !== null) { var wb = sw ? sw.wrap : buildSwitch(); bell.parentNode.insertBefore(wb, bell); var pd = getComputedStyle(bell.parentNode); if (pd.display.indexOf('flex') < 0) { bell.parentNode.style.display = 'flex'; bell.parentNode.style.alignItems = 'center'; bell.parentNode.style.gap = '10px'; } return; }
    var row = h.firstElementChild && getComputedStyle(h).display !== 'flex' ? h.firstElementChild : h;
    var last = row.lastElementChild; if (!last) return;
    var wrap = sw ? sw.wrap : buildSwitch();
    if (getComputedStyle(last).display.indexOf('flex') >= 0) last.insertBefore(wrap, last.firstChild); else row.insertBefore(wrap, last);
  }

  function setLang(L) {
    lang = L; try { localStorage.setItem(KEY, L); } catch (e) {}
    document.documentElement.lang = L === 'uz' ? 'uz' : L;
    paintSwitch(); walk(document.body); doTitle();
    window.dispatchEvent(new CustomEvent('vector-lang', { detail: L }));
  }
  window.vectorSetLang = setLang; window.vectorLang = function () { return lang; };

  // Profil menyusidagi "Ilova tili" bandi til tanlash oynasini ochadi
  var RX = /^(Ilova tili|Язык приложения|App language)/;
  function picker() {
    var ov = document.createElement('div'); ov.setAttribute('data-no-i18n', ''); ov.setAttribute('data-vector-lang', '');
    ov.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(11,30,79,.55);display:grid;place-items:center;padding:16px';
    var box = document.createElement('div'); box.setAttribute('role', 'dialog');
    box.style.cssText = 'width:min(100%,360px);background:#fff;border-radius:22px;box-shadow:0 30px 60px rgba(11,30,79,.3);padding:20px;display:flex;flex-direction:column;gap:8px;font-family:Inter,Manrope,system-ui,sans-serif';
    var T = { uz: 'Ilova tili', ru: 'Язык приложения', en: 'App language' };
    box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><strong style="font-size:19px;color:#0F172A">' + T[lang] + '</strong><button type="button" data-x style="width:34px;height:34px;border:0;border-radius:10px;background:#F1F5FB;cursor:pointer;font-family:\'Material Symbols Rounded\';font-size:20px;color:#334155">close</button></div>';
    LANGS.forEach(function (L) {
      var on = L === lang, o = document.createElement('button'); o.type = 'button';
      o.style.cssText = 'display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 16px;border:1.5px solid ' + (on ? '#1E63F0' : '#E2E8F0') + ';border-radius:14px;background:' + (on ? '#EAF2FF' : '#fff') + ';cursor:pointer;font:600 16px Inter,Manrope,system-ui,sans-serif;color:' + (on ? '#1E63F0' : '#0F172A');
      o.innerHTML = '<span>' + LABEL[L] + '</span><span style="font-family:\'Material Symbols Rounded\';font-size:22px;color:#1E63F0">' + (on ? 'check_circle' : '') + '</span>';
      o.onclick = function () { setLang(L); close(); };
      box.appendChild(o);
    });
    function close() { ov.remove(); }
    ov.onclick = function (e) { if (e.target === ov) close(); };
    box.querySelector('[data-x]').onclick = close;
    ov.appendChild(box); document.body.appendChild(ov);
  }
  document.addEventListener('click', function (e) {
    var el = e.target; if (!el || !el.closest || el.closest('[data-vector-lang]')) return;
    for (var d = 0; el && d < 5; d++, el = el.parentElement) {
      var t = norm((el.textContent || '').replace(/^\s*language\s*/, ''));
      if (RX.test(t) && t.length < 60) { e.preventDefault(); e.stopPropagation(); picker(); return; }
    }
  }, true);

  // Tungi rejim: butun sahifa ranglari teskari qilinadi, rasmlar asl holida qoladi
  var dark = false; try { dark = localStorage.getItem('vector_dark') === '1'; } catch (e) {}
  (function () {
    var st = document.createElement('style'); st.id = 'vector-dark-css';
    var P = function (prop, rgb) { return 'html.vdark [style^="' + prop + ': ' + rgb + '"],html.vdark [style*="; ' + prop + ': ' + rgb + '"]'; };
    var BG = [['rgb(255, 255, 255)', '#121B2F'], ['rgb(241, 245, 251)', '#0B1222'], ['rgb(244, 246, 250)', '#0B1222'], ['rgb(248, 250, 253)', '#0F172A'], ['rgb(234, 242, 255)', '#17274D'], ['rgb(245, 249, 255)', '#15213D'], ['rgb(241, 246, 255)', '#15213D'], ['rgb(240, 253, 244)', '#0F2A1C'], ['rgb(236, 253, 243)', '#0F2A1C'], ['rgb(247, 254, 249)', '#0F2A1C'], ['rgb(220, 252, 231)', '#14391F'], ['rgb(255, 247, 237)', '#2A1D0E'], ['rgb(241, 246, 255)', '#15213D'], ['rgb(226, 232, 240)', '#243049'], ['rgb(241, 245, 249)', '#172036'], ['rgb(247, 245, 240)', '#172036'], ['rgb(244, 247, 252)', '#1A2440'], ['rgb(213, 222, 236)', '#243049'], ['rgba(255, 255, 255, 0.9', 'rgba(11,18,34,.9)'], ['rgba(255, 255, 255, 0.95', 'rgba(11,18,34,.95)'], ['rgba(255, 255, 255, 0.85', 'rgba(11,18,34,.88)'], ['rgba(255, 255, 255, 0.92', 'rgba(11,18,34,.92)']];
    var FG = [['rgb(15, 23, 42)', '#E6ECF5'], ['rgb(51, 65, 85)', '#CBD5E1'], ['rgb(71, 85, 105)', '#B6C2D3'], ['rgb(100, 116, 139)', '#94A3B8'], ['rgb(11, 30, 79)', '#C9D8FF'], ['rgb(11, 42, 138)', '#C9D8FF'], ['rgb(10, 63, 184)', '#9DBBFF'], ['rgb(220, 38, 38)', '#F87171']];
    var BD = ['rgb(203, 213, 225)', 'rgb(226, 232, 240)', 'rgb(212, 217, 226)', 'rgb(213, 222, 236)'];
    var css = 'html.vdark,html.vdark body{background:#0B1222;color-scheme:dark;color:#E6ECF5}html.vdark body *{color:inherit}';
    BG.forEach(function (x) { css += P('background', x[0]) + ',' + P('background-color', x[0]) + '{background:' + x[1] + ' !important}'; });
    FG.forEach(function (x) { css += P('color', x[0]) + '{color:' + x[1] + ' !important}'; });
    BD.forEach(function (c) { css += 'html.vdark [style*="solid ' + c + '"]{border-color:#2A3753 !important}'; });
    css += 'html.vdark [style*="box-shadow"]:not(button){box-shadow:0 8px 24px rgba(0,0,0,.35) !important}';
    css += 'html.vdark input,html.vdark textarea,html.vdark select{color:#E6ECF5;caret-color:#E6ECF5}html.vdark input::placeholder,html.vdark textarea::placeholder{color:#64748B}';
    css += 'html.vdark :has(> [style*="mix-blend-mode: multiply"]){background:#EEF2F8 !important}html.vdark [style*="mix-blend-mode: multiply"] *{color:#0F172A}';
    css += 'html.vdark [data-vector-lang] button{background:#121B2F !important;color:#E6ECF5 !important;border-color:#2A3753 !important}html.vdark [data-vector-lang] [role="menu"],html.vdark [data-vector-lang] [role="dialog"]{background:#121B2F !important}html.vdark [data-vector-lang] strong{color:#E6ECF5 !important}';
    css += '';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
    if (dark) document.documentElement.classList.add('vdark');
  })();
  function setDark(v) {
    dark = !!v; try { localStorage.setItem('vector_dark', dark ? '1' : '0'); } catch (e) {}
    document.documentElement.classList.toggle('vdark', dark);
    window.dispatchEvent(new CustomEvent('vector-dark', { detail: dark }));
  }
  window.vectorSetDark = setDark; window.vectorDark = function () { return dark; };
  window.addEventListener('storage', function (e) { if (e.key === 'vector_dark') { dark = e.newValue === '1'; document.documentElement.classList.toggle('vdark', dark); } });

  function start() {
    build(); document.documentElement.lang = lang;
    walk(document.body); doTitle(); mountSwitch();
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'characterData') push(m.target);
        else if (m.type === 'attributes') push(m.target);
        else m.addedNodes.forEach(push);
      });
      if (!raf) raf = requestAnimationFrame(flush);
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    var t = document.querySelector('title'); if (t) new MutationObserver(doTitle).observe(t, { childList: true, characterData: true, subtree: true });
  }
  function ready() { if (document.body) start(); else document.addEventListener('DOMContentLoaded', start); }
  if (window.VECTOR_DICT) ready(); else window.VECTOR_I18N_READY = ready;
})();

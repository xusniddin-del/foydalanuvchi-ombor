/**
 * VECTOR — to'lov serveri (Cloudflare Worker, bepul tarif yetarli).
 * Click (SHOP API) va Payme (Merchant API) to'lov xabarlarini qabul qiladi va Google Sheets'dagi
 * Payments jadvalini Apps Script orqali yangilaydi. To'lov o'tgach obuna avtomatik ochiladi.
 *
 * Manzillar (Click/Payme kabinetiga kiritiladi):
 *   Click Prepare:  https://<worker>.workers.dev/click/prepare
 *   Click Complete: https://<worker>.workers.dev/click/complete
 *   Payme:          https://<worker>.workers.dev/payme
 *   Telegram bot:   https://<worker>.workers.dev/tg  (Google jadvaldagi "4. Telegram botni ulash" o'zi ulaydi)
 *
 * Muhit o'zgaruvchilari (Settings → Variables, "Encrypt" bilan):
 *   GAS_URL           — Apps Script /exec manzili
 *   GAS_SECRET        — Google Sheets → Vector → "3. To'lov serveri kalitini yaratish" bergan kalit
 *   CLICK_SECRET_KEY  — Click bergan secret key
 *   CLICK_SERVICE_ID  — Click service_id
 *   PAYME_KEY         — Payme kassa kaliti (test paytida test kaliti)
 */

const PAYME_TIMEOUT = 12 * 3600 * 1000; // Payme: tranzaksiya 12 soatda bajarilmasa bekor qilinadi

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Telegram bot xabarlari: darhol 200 qaytaramiz, xabarni Apps Script'ga orqa fonda uzatamiz.
    // (Apps Script to'g'ridan-to'g'ri 302 qaytaradi va Telegram xabarni qayta-qayta yuboradi.)
    if (url.pathname === '/tg' && request.method === 'POST') {
      const key = url.searchParams.get('tg') || '';
      if (env.GAS_URL && /^[A-Za-z0-9]{16,64}$/.test(key)) {
        const body = await request.text();
        const job = fetch(env.GAS_URL + '?tg=' + key, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'application/json' }, body })
          .catch(e => console.error('tg relay: ' + e));
        if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
      }
      return new Response('ok');
    }
    if (request.method === 'GET') return json({ ok: true, name: 'Vector payments' });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    try {
      if (url.pathname === '/click/prepare') return await clickHandler(request, env, 0);
      if (url.pathname === '/click/complete') return await clickHandler(request, env, 1);
      if (url.pathname === '/payme') return await paymeHandler(request, env);
    } catch (e) {
      console.error(e && e.stack || e);
      if (url.pathname === '/payme') return json({ error: { code: -32400, message: msg('Ichki xatolik') }, id: null });
      return json({ error: -8, error_note: 'Internal error' });
    }
    return new Response('Not found', { status: 404 });
  }
};

// ---------- Apps Script bilan aloqa ----------
async function gas(env, action, data) {
  const r = await fetch(env.GAS_URL, {
    method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action, secret: env.GAS_SECRET }, data || {}))
  });
  const j = await r.json();
  if (!j.ok) throw new Error('GAS: ' + (j.error || 'xato'));
  return j;
}
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// =================== CLICK ===================
async function clickHandler(request, env, stage) {
  const f = Object.fromEntries(await request.formData());
  const reply = (error, note, extra) => json(Object.assign({ click_trans_id: f.click_trans_id, merchant_trans_id: f.merchant_trans_id, error, error_note: note }, extra || {}));
  const action = Number(f.action);
  if (action !== stage) return reply(-3, 'Action not found');
  const signSrc = f.click_trans_id + f.service_id + env.CLICK_SECRET_KEY + f.merchant_trans_id + (stage === 1 ? f.merchant_prepare_id : '') + f.amount + f.action + f.sign_time;
  if (!f.sign_string || md5(signSrc) !== String(f.sign_string).toLowerCase() || String(f.service_id) !== String(env.CLICK_SERVICE_ID)) return reply(-1, 'SIGN CHECK FAILED!');

  const p = (await gas(env, 'pay.get', { id: f.merchant_trans_id })).payment;
  if (!p) return reply(-5, 'User does not exist');
  if (Math.abs(Number(f.amount) - p.amount) > 0.01) return reply(-2, 'Incorrect parameter amount');
  if (p.status === 'paid') return reply(-4, 'Already paid');
  if (p.status === 'cancelled') return reply(-9, 'Transaction cancelled');

  if (stage === 0) {
    const prepareId = Math.floor(Date.now() / 1000);
    await gas(env, 'pay.update', { id: p.id, fields: { provider: 'click', extId: 'click:' + f.click_trans_id, extState: 'prepared', extCreate: String(prepareId) } });
    return reply(0, 'Success', { merchant_prepare_id: prepareId });
  }
  // Complete
  if (p.extId !== 'click:' + f.click_trans_id || String(p.extCreate) !== String(f.merchant_prepare_id)) return reply(-6, 'Transaction does not exist');
  if (Number(f.error) < 0) {
    // Click tomonida to'lov o'tmadi — to'lovni bekor qilmaymiz, o'quvchi qayta urinishi mumkin
    await gas(env, 'pay.update', { id: p.id, fields: { extState: 'failed', extReason: String(f.error) } });
    return reply(-9, 'Transaction cancelled');
  }
  await gas(env, 'pay.paid', { id: p.id, provider: 'click', extId: 'click:' + f.click_trans_id, fields: { extState: 'done', extPerform: String(Date.now()) } });
  return reply(0, 'Success', { merchant_confirm_id: Number(f.merchant_prepare_id) });
}

// =================== PAYME ===================
const msg = t => ({ uz: t, ru: t, en: t });
class PaymeError extends Error { constructor(code, text, data) { super(text); this.code = code; this.text = text; this.data = data; } }

async function paymeHandler(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: { code: -32700, message: msg('Parse error') }, id: null }); }
  const id = body.id;
  const auth = request.headers.get('Authorization') || '';
  const expected = 'Basic ' + btoa('Paycom:' + env.PAYME_KEY);
  if (!env.PAYME_KEY || auth !== expected) return json({ error: { code: -32504, message: msg("Ruxsat yo'q") }, id });
  const m = { CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction, GetStatement }[body.method];
  if (!m) return json({ error: { code: -32601, message: msg('Method not found') }, id });
  try {
    return json({ result: await m(env, body.params || {}), id });
  } catch (e) {
    if (e instanceof PaymeError) return json({ error: { code: e.code, message: msg(e.text), data: e.data }, id });
    throw e;
  }
}

async function orderFor(env, params) {
  const orderId = params.account && params.account.order_id;
  const p = orderId ? (await gas(env, 'pay.get', { id: String(orderId) })).payment : null;
  if (!p || p.status === 'cancelled') throw new PaymeError(-31050, "Buyurtma topilmadi", 'order_id');
  if (p.status === 'paid') throw new PaymeError(-31051, "Buyurtma allaqachon to'langan", 'order_id');
  if (Number(params.amount) !== p.amount * 100) throw new PaymeError(-31001, "Noto'g'ri summa");
  return p;
}

const txView = p => ({
  create_time: Number(p.extCreate) || 0, perform_time: Number(p.extPerform) || 0, cancel_time: Number(p.extCancel) || 0,
  transaction: p.id, state: Number(p.extState) || 0, reason: p.extReason ? Number(p.extReason) : null
});
async function byTx(env, txId) {
  const p = (await gas(env, 'pay.findExt', { extId: 'payme:' + txId })).payment;
  if (!p) throw new PaymeError(-31003, 'Tranzaksiya topilmadi');
  return p;
}

async function CheckPerformTransaction(env, params) {
  await orderFor(env, params);
  return { allow: true };
}

async function CreateTransaction(env, params) {
  const existing = (await gas(env, 'pay.findExt', { extId: 'payme:' + params.id })).payment;
  if (existing) {
    if (Number(existing.extState) !== 1) throw new PaymeError(-31008, "Amalni bajarib bo'lmaydi");
    if (Date.now() - Number(existing.extCreate) > PAYME_TIMEOUT) {
      await gas(env, 'pay.update', { id: existing.id, fields: { extState: '-1', extCancel: String(Date.now()), extReason: '4' } });
      throw new PaymeError(-31008, 'Tranzaksiya muddati tugagan');
    }
    return { create_time: Number(existing.extCreate), transaction: existing.id, state: 1 };
  }
  const p = await orderFor(env, params);
  // bitta buyurtmada boshqa faol tranzaksiya bo'lsa — rad etamiz
  if (p.extId && p.extId.startsWith('payme:') && Number(p.extState) === 1) throw new PaymeError(-31050, "Buyurtma bo'yicha boshqa to'lov kutilmoqda", 'order_id');
  const now = Date.now();
  await gas(env, 'pay.update', { id: p.id, fields: { provider: 'payme', extId: 'payme:' + params.id, extState: '1', extCreate: String(now), extPerform: '', extCancel: '', extReason: '' } });
  return { create_time: now, transaction: p.id, state: 1 };
}

async function PerformTransaction(env, params) {
  const p = await byTx(env, params.id);
  const state = Number(p.extState);
  if (state === 2) return { transaction: p.id, perform_time: Number(p.extPerform), state: 2 };
  if (state !== 1) throw new PaymeError(-31008, "Amalni bajarib bo'lmaydi");
  if (Date.now() - Number(p.extCreate) > PAYME_TIMEOUT) {
    await gas(env, 'pay.update', { id: p.id, fields: { extState: '-1', extCancel: String(Date.now()), extReason: '4' } });
    throw new PaymeError(-31008, 'Tranzaksiya muddati tugagan');
  }
  const now = Date.now();
  await gas(env, 'pay.paid', { id: p.id, provider: 'payme', fields: { extState: '2', extPerform: String(now) } });
  return { transaction: p.id, perform_time: now, state: 2 };
}

async function CancelTransaction(env, params) {
  const p = await byTx(env, params.id);
  const state = Number(p.extState);
  if (state === 1 || state === 2) {
    const now = Date.now(), ns = state === 1 ? -1 : -2;
    await gas(env, 'pay.cancel', { id: p.id, fields: { extState: String(ns), extCancel: String(now), extReason: String(params.reason || '') } });
    return { transaction: p.id, cancel_time: now, state: ns };
  }
  return { transaction: p.id, cancel_time: Number(p.extCancel), state };
}

async function CheckTransaction(env, params) {
  return txView(await byTx(env, params.id));
}

async function GetStatement(env, params) {
  const list = (await gas(env, 'pay.list', { provider: 'payme', from: params.from, to: params.to })).payments;
  return { transactions: list.filter(p => p.extId && p.extId.startsWith('payme:')).map(p => Object.assign({
    id: p.extId.slice(6), time: Number(p.extCreate), amount: p.amount * 100, account: { order_id: p.id }
  }, txView(p))) };
}

// ---------- MD5 (Click imzosi uchun; Workers'da MD5 yo'q) ----------
function md5(str) {
  const s = unescape(encodeURIComponent(str));
  const k = [], r = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  const words = []; for (let i = 0; i < s.length; i++) words[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8);
  const bitLen = s.length * 8; words[bitLen >> 5] |= 0x80 << (bitLen % 32); words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    const [oa, ob, oc, od] = [a, b, c, d];
    for (let j = 0; j < 64; j++) {
      let f, g; const q = j >> 4;
      if (q === 0) { f = (b & c) | (~b & d); g = j; } else if (q === 1) { f = (d & b) | (~d & c); g = (5 * j + 1) % 16; }
      else if (q === 2) { f = b ^ c ^ d; g = (3 * j + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * j) % 16; }
      const t = d; d = c; c = b;
      const x = (a + f + k[j] + (words[i + g] | 0)) | 0, sh = r[q * 4 + (j % 4)];
      b = (b + ((x << sh) | (x >>> (32 - sh)))) | 0; a = t;
    }
    a = (a + oa) | 0; b = (b + ob) | 0; c = (c + oc) | 0; d = (d + od) | 0;
  }
  return [a, b, c, d].map(n => { let h = ''; for (let i = 0; i < 4; i++) h += ((n >> (i * 8)) & 255).toString(16).padStart(2, '0'); return h; }).join('');
}

export { md5 }; // testlar uchun

// To'lov serveri testlari: node tests/worker.test.mjs
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const { createGas } = require('./gas-mock.js');
const dir = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(os.tmpdir(), 'vector-worker-' + process.pid + '.mjs');
fs.copyFileSync(path.join(dir, '..', 'payments', 'worker.js'), tmp);
const { default: worker, md5 } = await import(pathToFileURL(tmp).href);

const g = createGas(); g.ctx.setup(); g.ctx.setAdminPasswordValue('admin-parol-123');
const SECRET = 's'.repeat(64); g.props.set('WORKER_SECRET', SECRET);
const env = { GAS_URL: 'https://gas.test/exec', GAS_SECRET: SECRET, CLICK_SECRET_KEY: 'clicksecret', CLICK_SERVICE_ID: '777', PAYME_KEY: 'paymekey' };
globalThis.fetch = async (url, opts) => {
  if (url !== env.GAS_URL) throw new Error('unexpected fetch ' + url);
  return { json: async () => g.call(JSON.parse(opts.body)) };
};
let pass = 0; const fails = [];
const t = (n, c) => { if (c) pass++; else fails.push(n); console.log((c ? 'PASS ' : 'FAIL ') + n); };

t('md5 matches node', ['', 'abc', "Vector o'quvchi 123", 'x'.repeat(200)].every(s => md5(s) === crypto.createHash('md5').update(s).digest('hex')));

// o'quvchi va to'lov
g.call({ action: 'a.settings.save', token: g.call({ action: 'admin.login', password: 'admin-parol-123' }).token, settings: { payment_mode: 'live', click_service_id: '777', click_merchant_id: '1', payme_merchant_id: 'm1' } });
const U = g.call({ action: 'register', phone: '901112233', name: 'Ali Valiyev', password: 'parol123' }).token;
const plan = g.call({ action: 'plans', token: U }).plans[0];
const P = g.call({ action: 'pay.create', token: U, planId: plan.id, provider: 'click' }).payment;
t('live payment created for click', P.provider === 'click' && P.amount === 69000);

// ---- CLICK ----
const click = async (stage, f) => {
  const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, String(v)));
  const r = await worker.fetch(new Request('https://w.test/click/' + (stage ? 'complete' : 'prepare'), { method: 'POST', body: fd }), env);
  return r.json();
};
const sign = (f, stage) => md5(String(f.click_trans_id) + f.service_id + env.CLICK_SECRET_KEY + f.merchant_trans_id + (stage ? f.merchant_prepare_id : '') + f.amount + f.action + f.sign_time);
const base = { click_trans_id: 555, service_id: 777, click_paydoc_id: 1, merchant_trans_id: P.id, amount: '69000.00', action: 0, error: 0, error_note: 'ok', sign_time: '2026-11-14 10:00:00' };
let r = await click(0, Object.assign({}, base, { sign_string: 'bad' }));
t('click bad sign → -1', r.error === -1);
r = await click(0, Object.assign({}, base, { amount: '1000.00', sign_string: sign(Object.assign({}, base, { amount: '1000.00' }), 0) }));
t('click wrong amount → -2', r.error === -2);
r = await click(0, Object.assign({}, base, { merchant_trans_id: 'NOPE', sign_string: sign(Object.assign({}, base, { merchant_trans_id: 'NOPE' }), 0) }));
t('click unknown order → -5', r.error === -5);
r = await click(0, Object.assign({}, base, { sign_string: sign(base, 0) }));
t('click prepare ok', r.error === 0 && r.merchant_prepare_id > 0);
const comp = Object.assign({}, base, { action: 1, merchant_prepare_id: r.merchant_prepare_id });
r = await click(1, Object.assign({}, comp, { merchant_prepare_id: 1, sign_string: sign(Object.assign({}, comp, { merchant_prepare_id: 1 }), 1) }));
t('click complete wrong prepare id → -6', r.error === -6);
r = await click(1, Object.assign({}, comp, { sign_string: sign(comp, 1) }));
let me = g.call({ action: 'me', token: U }).user;
t('click complete ok → subscription active', r.error === 0 && me.active && me.plan === 'START');
r = await click(1, Object.assign({}, comp, { sign_string: sign(comp, 1) }));
t('click complete repeated → -4 already paid', r.error === -4);

// ---- PAYME ----
const P2 = g.call({ action: 'pay.create', token: U, planId: plan.id, provider: 'payme' }).payment;
const payme = async (method, params, key) => {
  const r = await worker.fetch(new Request('https://w.test/payme', { method: 'POST', headers: { Authorization: 'Basic ' + btoa('Paycom:' + (key || env.PAYME_KEY)), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 1, method, params }) }), env);
  return r.json();
};
r = await payme('CheckPerformTransaction', { amount: 6900000, account: { order_id: P2.id } }, 'wrong');
t('payme wrong key → -32504', r.error && r.error.code === -32504);
r = await payme('CheckPerformTransaction', { amount: 100, account: { order_id: P2.id } });
t('payme wrong amount → -31001', r.error && r.error.code === -31001);
r = await payme('CheckPerformTransaction', { amount: 6900000, account: { order_id: 'NOPE' } });
t('payme unknown order → -31050', r.error && r.error.code === -31050);
r = await payme('CheckPerformTransaction', { amount: 6900000, account: { order_id: P2.id } });
t('payme check ok', r.result && r.result.allow === true);
r = await payme('CreateTransaction', { id: 'tx1', time: Date.now(), amount: 6900000, account: { order_id: P2.id } });
t('payme create ok state 1', r.result && r.result.state === 1 && r.result.transaction === P2.id);
const ct = r.result.create_time;
r = await payme('CreateTransaction', { id: 'tx1', time: Date.now(), amount: 6900000, account: { order_id: P2.id } });
t('payme create idempotent', r.result && r.result.create_time === ct);
r = await payme('CreateTransaction', { id: 'tx2', time: Date.now(), amount: 6900000, account: { order_id: P2.id } });
t('payme second tx for same order → -31050', r.error && r.error.code === -31050);
const before = Date.parse(g.call({ action: 'me', token: U }).user.subEnd);
r = await payme('PerformTransaction', { id: 'tx1' });
const after = Date.parse(g.call({ action: 'me', token: U }).user.subEnd);
t('payme perform → +30 days', r.result && r.result.state === 2 && Math.round((after - before) / 864e5) === 30);
r = await payme('PerformTransaction', { id: 'tx1' });
t('payme perform idempotent', r.result && r.result.state === 2 && Math.round((Date.parse(g.call({ action: 'me', token: U }).user.subEnd) - before) / 864e5) === 30);
r = await payme('CheckTransaction', { id: 'tx1' });
t('payme check transaction', r.result && r.result.state === 2 && r.result.perform_time > 0);
r = await payme('GetStatement', { from: 0, to: Date.now() + 1000 });
t('payme statement', r.result && r.result.transactions.length === 1 && r.result.transactions[0].id === 'tx1');
r = await payme('CancelTransaction', { id: 'tx1', reason: 5 });
t('payme cancel after perform → -2 and days revoked', r.result && r.result.state === -2 && Math.round((Date.parse(g.call({ action: 'me', token: U }).user.subEnd) - before) / 864e5) === 0);
r = await payme('PerformTransaction', { id: 'tx1' });
t('payme perform cancelled → -31008', r.error && r.error.code === -31008);
r = await payme('PerformTransaction', { id: 'unknown' });
t('payme unknown tx → -31003', r.error && r.error.code === -31003);

fs.unlinkSync(tmp);
console.log(`\n${pass} passed, ${fails.length} failed`, fails);
process.exit(fails.length ? 1 : 0);

// Saytni kompyuterda sinash: node tests/server.js → http://127.0.0.1:8787
// Google Sheets o'rniga xotiradagi taqlid ishlatiladi. Admin paroli: admin-parol-123
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGas } = require('./gas-mock');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);
const g = createGas();
g.ctx.setup();
g.ctx.setAdminPasswordValue('admin-parol-123');
{ const t = g.call({ action: 'admin.login', password: 'admin-parol-123' }).token; g.call({ action: 'a.settings.save', token: t, settings: { card_number: '5614681403666906', card_holder: 'SHAROFIDDINOV XUSNIDDIN', phone: '+998 90 832 44 36' } }); }
// Telegram bot taqlidi (o'chirish: NOTG=1). Bot xabarlari: GET /dev/tg-out, botga yozish: POST /dev/tg {chat, text | phone}
if (!process.env.NOTG) g.ctx.connectTelegramValue('123456:' + 'A'.repeat(35), 'https://script.google.com/macros/s/TEST/exec');
// TezCheck taqlidi (TC=1): to'lov rejimi «tezcheck». Chekni to'langan qilish: POST /dev/tc-pay {bill?} (bo'sh bo'lsa — oxirgi chek)
if (process.env.TC) g.ctx.connectTezcheckValue('aps_testkey12345', 'cdk_desk01');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api') {
    if (req.method !== 'POST') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(g.ctx.doGet().content); }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const out = g.ctx.doPost({ postData: { contents: body } }).content;
      // LAG=1200 — Google Apps Script kabi sekin javobni taqlid qilish (tezlikni o'lchash uchun)
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out); }, Number(process.env.LAG || 0));
    });
    return;
  }
  if (url.pathname === '/dev/tc-pay' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const id = JSON.parse(body || '{}').bill || 'bill_' + g.tc.n, bill = g.tc.bills.get(id);
      if (bill) { bill.paid = true; bill.state = 'paid'; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: !!bill, bill: id }));
    });
    return;
  }
  if (url.pathname === '/dev/tg-out') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(g.tgOut.slice(-20))); }
  if (url.pathname === '/dev/tg' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      if (b.phone) g.tgContact(b.chat, b.phone); else g.tgMsg(b.chat, b.text);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(g.tgOut.slice(-3)));
    });
    return;
  }
  if (url.pathname === '/assets/js/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end("window.VECTOR_API = '/api';"); }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('Vector test server: http://127.0.0.1:' + PORT));

module.exports = { g };

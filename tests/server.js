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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api') {
    if (req.method !== 'POST') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(g.ctx.doGet().content); }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const out = g.ctx.doPost({ postData: { contents: body } }).content;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out);
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

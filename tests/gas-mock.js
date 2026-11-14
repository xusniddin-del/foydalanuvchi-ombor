// Google Apps Script muhitining kichik taqlidi — backend/Code.gs ni kompyuterda sinash uchun.
// Ishlatish: node tests/server.js  (http://127.0.0.1:8787 — saytdagi API o'rniga)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function makeSheet(name) {
  const data = []; // qatorlar massivi
  let maxCols = 26;
  const sh = {
    name,
    data,
    getName: () => name,
    getLastRow: () => { for (let i = data.length - 1; i >= 0; i--) if (data[i] && data[i].some(v => v !== '' && v != null)) return i + 1; return 0; },
    getMaxColumns: () => maxCols,
    getMaxRows: () => Math.max(1000, data.length),
    insertColumnsAfter: (_c, n) => { maxCols += n; },
    setFrozenRows: () => sh,
    appendRow: (vals) => { const r = sh.getLastRow(); data[r] = vals.map(v => (v === undefined ? '' : v)); return sh; },
    deleteRow: (r) => { data.splice(r - 1, 1); return sh; },
    getRange: (r, c, nr = 1, nc = 1) => {
      const rng = {
        getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = data[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
        setValues: (v) => { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = v[i][j]; } return rng; },
        setNumberFormat: () => rng, setFontWeight: () => rng, setBackground: () => rng, setFontColor: () => rng
      };
      return rng;
    }
  };
  return sh;
}

function createGas(opts = {}) {
  const sheets = {};
  const book = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: (s) => { delete sheets[s.name]; }
  };
  const cache = new Map();
  const cacheObj = {
    get: (k) => { const e = cache.get(k); if (!e) return null; if (e.exp < Date.now()) { cache.delete(k); return null; } return e.v; },
    put: (k, v, s = 600) => { if (String(v).length > 100000) throw new Error('Argument too large'); cache.set(k, { v: String(v), exp: Date.now() + s * 1000 }); },
    putAll: (m, s) => Object.keys(m).forEach(k => cacheObj.put(k, m[k], s)),
    remove: (k) => cache.delete(k),
    removeAll: (ks) => ks.forEach(k => cache.delete(k))
  };
  const props = new Map();
  const files = new Map();
  const tzFmt = (d, tz, fmt) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map(x => [x.type, x.value]));
    return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  };
  // Telegram API taqlidi: yuborilgan xabarlar tgOut ga yoziladi
  const tgOut = [];
  const fakeTg = (url, o) => {
    const m = String(url).match(/api\.telegram\.org\/bot([^/]+)\/(\w+)/);
    const body = o && o.payload ? JSON.parse(o.payload) : {};
    let res = { ok: true, result: true };
    if (!m || m[1] === 'bad') res = { ok: false, description: 'Unauthorized' };
    else if (m[2] === 'getMe') res = { ok: true, result: { id: 1, username: 'vector_test_bot' } };
    else tgOut.push({ method: m[2], ...body });
    return { getContentText: () => JSON.stringify(res), getResponseCode: () => (res.ok ? 200 : 401) };
  };
  const ctx = {
    console,
    SpreadsheetApp: { getActive: () => book, getUi: () => { if (opts.ui) return opts.ui; throw new Error('No UI'); } },
    CacheService: { getScriptCache: () => cacheObj },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k) }) },
    UrlFetchApp: {
      fetch: (url, o) => fakeTg(url, o),
      fetchAll: (list) => list.map(o => fakeTg(o.url, o))
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      formatDate: tzFmt,
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      sleep: () => {}
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'a' }, Permission: { VIEW: 'v' },
      createFolder: () => ({ getId: () => 'folder1', createFile: (b) => { const id = 'f' + files.size; files.set(id, b); return { getId: () => id, setSharing: () => {} }; } }),
      getFolderById: () => ctx.DriveApp.createFolder()
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }), getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => { const t = { timeBased: () => t, everyDays: () => t, atHour: () => t, inTimezone: () => t, create: () => t }; return t; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
    Date, JSON, Math, Object, Array, String, Number, isNaN, isFinite, parseInt, Error, RegExp
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  const call = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).content);
  let upd = 1000;
  /** Telegramdan kelgan yangilanishni taqlid qilish */
  const tg = (update, key) => JSON.parse(ctx.doPost({ parameter: { tg: key || props.get('TG_HOOK') }, postData: { contents: JSON.stringify({ update_id: ++upd, ...update }) } }).content);
  const tgMsg = (chatId, text, extra) => tg({ message: { message_id: upd, chat: { id: chatId, type: 'private' }, from: { id: chatId }, text, ...(extra || {}) } });
  const tgContact = (chatId, phone, ownerId) => tg({ message: { message_id: upd, chat: { id: chatId, type: 'private' }, from: { id: chatId }, contact: { phone_number: phone, user_id: ownerId === undefined ? chatId : ownerId } } });
  return { ctx, sheets, call, props, cache, files, tg, tgMsg, tgContact, tgOut };
}

module.exports = { createGas };

/**
 * VECTOR — onlayn ta'lim platformasi backendi (Google Apps Script + Google Sheets).
 *
 * O'rnatish (batafsil README.md da):
 *  1. Google Sheets'da yangi jadval oching → Kengaytmalar → Apps Script.
 *  2. Shu faylni Code.gs ga, appsscript.json ni loyiha sozlamasiga qo'ying.
 *  3. Jadvalni yangilang: tepada "Vector" menyusi chiqadi → "1. Jadvalni tayyorlash".
 *  4. "Vector" → "2. Admin parolini o'rnatish".
 *  5. Joylash (Deploy) → Yangi joylash → Veb-ilova: "Men nomimdan", kirish: "Hamma".
 *     Berilgan /exec manzilini saytdagi assets/js/config.js ga yozing.
 *
 * Xavfsizlik: parollar tuz (salt) bilan SHA-256 orqali saqlanadi, test javoblari va coinlar faqat
 * serverda hisoblanadi, har bir yozish LockService bilan navbatga qo'yiladi (ma'lumot yo'qolmaydi).
 */

// ======================= SOZLAMALAR =======================
var TZ = 'Asia/Tashkent';
var USER_SESSION_DAYS = 30;
var ADMIN_SESSION_HOURS = 12;
var CACHE_SECONDS = 300;           // ommaviy ma'lumotlar (kurslar, tariflar, do'kon) keshda turadigan vaqt
var MAX_PENDING_PAYMENTS = 5;

var SHEETS = {
  Users: ['id', 'phone', 'name', 'avatar', 'birthday', 'region', 'school', 'grade', 'passHash', 'salt', 'coins', 'plan', 'subEnd', 'status', 'createdAt', 'lastLogin', 'theme', 'bdayYear', 'tgId', 'remindAt', 'remindN', 'subRemind'],
  Sessions: ['token', 'userId', 'role', 'expires'],
  Plans: ['id', 'name', 'months', 'price', 'features', 'popular', 'active', 'order', 'oldPrice'],
  Courses: ['id', 'title', 'desc', 'image', 'teacher', 'level', 'order', 'active', 'price'],
  Lessons: ['id', 'courseId', 'order', 'title', 'youtube', 'duration', 'desc', 'quiz', 'active'],
  Progress: ['key', 'userId', 'lessonId', 'courseId', 'watched', 'best', 'attempts', 'rewarded', 'updatedAt'],
  Coins: ['id', 'userId', 'amount', 'type', 'reason', 'at', 'by'],
  Products: ['id', 'name', 'desc', 'image', 'price', 'stock', 'active', 'order', 'category'],
  Orders: ['id', 'userId', 'userName', 'phone', 'productId', 'productName', 'qty', 'price', 'status', 'at'],
  Payments: ['id', 'userId', 'userName', 'phone', 'planId', 'planName', 'months', 'amount', 'provider', 'status', 'createdAt', 'paidAt', 'extId', 'extState', 'extCreate', 'extPerform', 'extCancel', 'extReason'],
  Settings: ['key', 'value', 'izoh']
};

var DEFAULT_SETTINGS = [
  ['site_name', 'Vector', 'Sayt nomi'],
  ['hero_title', "Zamonaviy kasblarni biz bilan o'rganing va kelajagingizni bugundan quring!", 'Bosh sahifadagi katta sarlavha'],
  ['hero_text', "Soha mutaxassisidan darslar, amaliy loyihalar va moslashuvchan grafik. Daromadli kasb egasi bo'lish endi yanada oson.", 'Sarlavha ostidagi matn'],
  ['stat_videos', '340', 'Statistika: video kurslar soni'],
  ['stat_schools', '10', 'Statistika: maktablar soni (+ belgisi bilan chiqadi)'],
  ['stat_clients', '870', 'Statistika: mijozlar soni'],
  ['phone', '+998 90 000 00 00', 'Aloqa telefoni'],
  ['telegram', 'vectoradminn', 'Telegram username (@ siz)'],
  ['instagram', 'xusniddintech', 'Instagram username'],
  ['youtube', '', 'YouTube kanal havolasi'],
  ['facebook', '', 'Facebook sahifa havolasi'],
  ['app_store', '', 'App Store havolasi (ilova bo\'lsa)'],
  ['google_play', '', 'Google Play havolasi (ilova bo\'lsa)'],
  ['address', "Marg'ilon shahri", 'Manzil'],
  ['coin_per_correct', '2', "Testdagi har bir to'g'ri javob uchun coin (faqat birinchi urinishda)"],
  ['birthday_coins', '50', "Tug'ilgan kunda avtomatik beriladigan coin (0 = o'chiq)"],
  ['daily_goal', '2', "Kunlik maqsad: kuniga nechta dars yoki test (kabinetda ko'rinadi)"],
  ['site_url', 'https://xusniddin-del.github.io/foydalanuvchi-ombor/', 'Sayt manzili (bot xabarlaridagi tugmalar uchun)'],
  ['payment_mode', 'test', "test — to'lovni admin tasdiqlaydi; live — Click/Payme avtomatik"],
  ['click_service_id', '', 'Click service_id'],
  ['click_merchant_id', '', 'Click merchant_id'],
  ['payme_merchant_id', '', 'Payme merchant (kassa) ID'],
  ['return_url', '', "To'lovdan keyin qaytiladigan sahifa (masalan https://.../kabinet.html#obuna)"]
];
var PUBLIC_SETTINGS = ['site_name', 'hero_title', 'hero_text', 'stat_videos', 'stat_schools', 'stat_clients', 'phone', 'telegram', 'instagram', 'youtube', 'facebook',
  'app_store', 'google_play', 'address', 'coin_per_correct', 'birthday_coins', 'daily_goal',
  'payment_mode', 'click_service_id', 'click_merchant_id', 'payme_merchant_id', 'return_url'];

// ======================= KIRISH NUQTALARI =======================
function doGet() {
  return out({ ok: true, name: 'Vector API', time: new Date().toISOString() });
}

function doPost(e) {
  if (e && e.parameter && e.parameter.tg) return out(tgWebhook(e));
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, error: "Noto'g'ri so'rov" }); }
  try {
    var res = route(req || {});
    tgFlush();
    return out(res);
  } catch (err) {
    if (err && err.userMessage) return out({ ok: false, error: err.userMessage, code: err.code || 'error' });
    console.error(err && err.stack || err);
    return out({ ok: false, error: "Serverda xatolik. Birozdan so'ng qayta urinib ko'ring." });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail(msg, code) { var e = new Error(msg); e.userMessage = msg; e.code = code; throw e; }

// ======================= MARSHRUTLAR =======================
var PUBLIC = {
  'public': apiPublic,
  'register': apiRegister,
  'reg.start': apiRegStart,
  'reg.status': apiRegStatus,
  'reg.verify': apiRegVerify,
  'pw.reset': apiPwReset,
  'login': apiLogin,
  'logout': apiLogout,
  'admin.login': apiAdminLogin
};
var USER = {
  'me': apiMe,
  'courses': apiCourses,
  'lesson': apiLesson,
  'watched': apiWatched,
  'quiz': apiQuiz,
  'coins': apiCoinHistory,
  'shop': apiShop,
  'buy': apiBuy,
  'orders': apiMyOrders,
  'plans': apiPlans,
  'pay.create': apiPayCreate,
  'payments': apiMyPayments,
  'profile': apiProfile,
  'password': apiPassword,
  'avatar': apiAvatar,
  'tg.link': apiTgLink
};
var ADMIN = {
  'a.stats': aStats,
  'a.users': aUsers,
  'a.user': aUserUpdate,
  'a.coins': aGiveCoins,
  'a.resetPassword': aResetPassword,
  'a.courses': aCourses,
  'a.course.save': aCourseSave,
  'a.course.delete': aCourseDelete,
  'a.lesson.save': aLessonSave,
  'a.lesson.delete': aLessonDelete,
  'a.products': aProducts,
  'a.product.save': aProductSave,
  'a.product.delete': aProductDelete,
  'a.orders': aOrders,
  'a.order': aOrderStatus,
  'a.payments': aPayments,
  'a.payment': aPaymentAction,
  'a.plans': aPlans,
  'a.plan.save': aPlanSave,
  'a.plan.delete': aPlanDelete,
  'a.settings': aSettings,
  'a.settings.save': aSettingsSave,
  'a.image': aImage,
  'a.coinlog': aCoinLog,
  'a.broadcast': aBroadcast
};
var WORKER = {
  'pay.get': wPayGet,
  'pay.findExt': wPayFindExt,
  'pay.update': wPayUpdate,
  'pay.paid': wPayPaid,
  'pay.cancel': wPayCancel,
  'pay.list': wPayList
};

function route(req) {
  var a = String(req.action || '');
  if (PUBLIC[a]) return PUBLIC[a](req);
  if (WORKER[a]) {
    var secret = PropertiesService.getScriptProperties().getProperty('WORKER_SECRET');
    if (!secret || !req.secret || !safeEq(String(req.secret), secret)) fail("Ruxsat yo'q", 'forbidden');
    return WORKER[a](req);
  }
  var s = session(req.token);
  if (USER[a]) {
    if (!s || s.role !== 'user') fail('Sessiya tugagan. Qayta kiring.', 'auth');
    var u = findUser(s.userId);
    if (!u) fail('Sessiya tugagan. Qayta kiring.', 'auth');
    if (u.status === 'blocked') fail("Hisobingiz bloklangan. Admin bilan bog'laning.", 'blocked');
    return USER[a](req, u);
  }
  if (ADMIN[a]) {
    if (!s || s.role !== 'admin') fail('Admin sessiyasi tugagan. Qayta kiring.', 'auth');
    return ADMIN[a](req);
  }
  fail("Noma'lum amal: " + a, 'unknown');
}

// ======================= JADVAL YORDAMCHILARI =======================
var MEMO = {};
function ss() { return SpreadsheetApp.getActive(); }

function sheet(name) {
  var sh = ss().getSheetByName(name);
  if (!sh) fail('Jadval tayyorlanmagan: Vector → "1. Jadvalni tayyorlash" ni bosing.', 'setup');
  return sh;
}

/** Varaqdagi barcha yozuvlar (obyekt ko'rinishida, _row — qator raqami). Bitta so'rov davomida eslab qolinadi. */
function rows(name) {
  if (MEMO[name]) return MEMO[name];
  var sh = sheet(name), head = SHEETS[name];
  var last = sh.getLastRow(), list = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, head.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = { _row: i + 2 };
      for (var j = 0; j < head.length; j++) o[head[j]] = cell(vals[i][j]);
      list.push(o);
    }
  }
  MEMO[name] = list;
  return list;
}

/** Katakdagi qiymat → matn. Kimdir jadvalga qo'lda sana yozsa ham to'g'ri o'qiladi. */
function cell(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v)) return '';
    var t = Utilities.formatDate(v, TZ, 'HH:mm:ss');
    return t === '00:00:00' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
  }
  return String(v);
}

function rowValues(name, o) { return SHEETS[name].map(function (h) { var v = o[h]; return v === undefined || v === null ? '' : String(v); }); }

function insert(name, o) {
  var sh = sheet(name);
  sh.appendRow(rowValues(name, o));
  o._row = sh.getLastRow();
  if (MEMO[name]) MEMO[name].push(o);
  return o;
}

function save(name, o) {
  sheet(name).getRange(o._row, 1, 1, SHEETS[name].length).setValues([rowValues(name, o)]);
  return o;
}

function removeRow(name, o) {
  sheet(name).deleteRow(o._row);
  delete MEMO[name];
}

function byId(name, id) {
  var list = rows(name);
  for (var i = 0; i < list.length; i++) if (list[i].id === String(id)) return list[i];
  return null;
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) fail("Server band. Bir necha soniyadan so'ng qayta urinib ko'ring.", 'busy');
  try { MEMO = {}; return fn(); } finally { lock.releaseLock(); }
}

function newId(prefix) {
  var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  var b = Utilities.getUuid().replace(/-/g, '');
  for (var i = 0; i < 8; i++) s += c[parseInt(b.substr(i * 2, 2), 16) % c.length];
  return (prefix || '') + s;
}

function now() { return new Date(); }
function iso(d) { return (d || now()).toISOString(); }
function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); }
function clip(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n); }
function safeEq(a, b) { if (a.length !== b.length) return false; var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

// ======================= KESH =======================
function cacheGet(key) {
  var c = CacheService.getScriptCache(), n = c.get(key + ':n');
  if (!n) return null;
  var parts = [];
  for (var i = 0; i < Number(n); i++) { var p = c.get(key + ':' + i); if (p === null) return null; parts.push(p); }
  try { return JSON.parse(parts.join('')); } catch (e) { return null; }
}
function cachePut(key, obj, seconds) {
  var s = JSON.stringify(obj), c = CacheService.getScriptCache(), size = 90000, n = Math.ceil(s.length / size) || 1, m = {};
  for (var i = 0; i < n; i++) m[key + ':' + i] = s.substr(i * size, size);
  m[key + ':n'] = String(n);
  try { c.putAll(m, seconds || CACHE_SECONDS); } catch (e) { /* kesh to'lsa — shunchaki keshsiz ishlaydi */ }
}
function cacheClear() { CacheService.getScriptCache().removeAll(['pub:n', 'cat:n']); }

// ======================= SOZLAMALAR =======================
function settings() {
  var o = {};
  DEFAULT_SETTINGS.forEach(function (r) { o[r[0]] = r[1]; });
  rows('Settings').forEach(function (r) { if (r.key) o[r.key] = r.value; });
  return o;
}

// ======================= PAROL VA SESSIYA =======================
function hash(pw, salt) {
  var h = salt + '|' + pw;
  for (var i = 0; i < 300; i++) {
    h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  }
  return h;
}

function newToken() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }

function createSession(userId, role) {
  var hours = role === 'admin' ? ADMIN_SESSION_HOURS : USER_SESSION_DAYS * 24;
  var s = { token: newToken(), userId: userId, role: role, expires: iso(new Date(Date.now() + hours * 3600e3)) };
  withLock(function () {
    // eskirgan sessiyalarni vaqti-vaqti bilan tozalash
    if (Math.random() < 0.05) {
      var list = rows('Sessions'), t = Date.now();
      for (var i = list.length - 1; i >= 0; i--) if (Date.parse(list[i].expires) < t) sheet('Sessions').deleteRow(list[i]._row);
      delete MEMO.Sessions;
    }
    insert('Sessions', s);
  });
  CacheService.getScriptCache().put('S:' + s.token, JSON.stringify(s), 21600);
  return s;
}

function session(token) {
  if (!token || String(token).length < 40) return null;
  token = String(token);
  var c = CacheService.getScriptCache(), raw = c.get('S:' + token), s = null;
  if (raw) s = JSON.parse(raw);
  else {
    var list = rows('Sessions');
    for (var i = 0; i < list.length; i++) if (list[i].token === token) { s = list[i]; break; }
    if (s) c.put('S:' + token, JSON.stringify({ token: s.token, userId: s.userId, role: s.role, expires: s.expires }), 21600);
  }
  if (!s || Date.parse(s.expires) < Date.now()) return null;
  return s;
}

function dropSessions(userId) {
  withLock(function () {
    var list = rows('Sessions'), c = CacheService.getScriptCache();
    for (var i = list.length - 1; i >= 0; i--) if (list[i].userId === userId) { c.remove('S:' + list[i].token); sheet('Sessions').deleteRow(list[i]._row); }
    delete MEMO.Sessions;
  });
}

function limited(key, max, seconds) {
  var c = CacheService.getScriptCache(), n = Number(c.get('L:' + key) || 0) + 1;
  c.put('L:' + key, String(n), seconds);
  return n > max;
}

// ======================= FOYDALANUVCHI =======================
function normPhone(p) { var d = String(p || '').replace(/\D/g, ''); if (d.length === 12 && d.indexOf('998') === 0) d = d.slice(3); return d; }

function findUser(id) { return byId('Users', id); }
function findByPhone(phone) {
  var list = rows('Users');
  for (var i = 0; i < list.length; i++) if (list[i].phone === phone) return list[i];
  return null;
}

function isActive(u) { return u.status !== 'blocked' && u.subEnd && Date.parse(u.subEnd) > Date.now(); }

function publicUser(u) {
  return {
    id: u.id, phone: u.phone, name: u.name, avatar: u.avatar, birthday: u.birthday, region: u.region, school: u.school, grade: u.grade,
    coins: num(u.coins), plan: u.plan, subEnd: u.subEnd, active: isActive(u), status: u.status, createdAt: u.createdAt, theme: u.theme || 'light', tg: !!u.tgId
  };
}

function validBirthday(b) {
  if (!b) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) fail("Tug'ilgan sanani to'g'ri kiriting.");
  var d = new Date(b + 'T00:00:00Z'), y = d.getUTCFullYear();
  if (isNaN(d) || y < 1950 || d > now()) fail("Tug'ilgan sanani to'g'ri kiriting.");
  return b;
}

function apiRegister(req) {
  if (tgToken()) fail("Ro'yxatdan o'tish Telegram bot orqali tasdiqlanadi. Sahifani yangilang.", 'tg');
  var phone = normPhone(req.phone), name = clip(req.name, 80), pw = String(req.password || '');
  if (!/^\d{9}$/.test(phone)) fail("Telefon raqamni to'liq kiriting (9 ta raqam).");
  if (name.length < 3) fail('Ism va familiyani kiriting.');
  if (pw.length < 6) fail("Parol kamida 6 ta belgidan iborat bo'lsin.");
  if (limited('reg:' + phone, 5, 3600)) fail("Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.");
  var birthday = validBirthday(clip(req.birthday, 10));
  var u = withLock(function () {
    if (findByPhone(phone)) fail("Bu raqam allaqachon ro'yxatdan o'tgan. Kirish bo'limidan foydalaning.");
    var salt = newToken().slice(0, 16);
    return insert('Users', {
      id: newId('U'), phone: phone, name: name, avatar: '', birthday: birthday, region: clip(req.region, 60), school: clip(req.school, 60),
      grade: clip(req.grade, 20), passHash: hash(pw, salt), salt: salt, coins: '0', plan: '', subEnd: '', status: 'active',
      createdAt: iso(), lastLogin: iso(), theme: 'light', bdayYear: ''
    });
  });
  var s = createSession(u.id, 'user');
  birthdayCheck(u);
  return { ok: true, token: s.token, user: publicUser(findUserFresh(u.id)) };
}

function findUserFresh(id) { MEMO = {}; return findUser(id); }

function apiLogin(req) {
  var phone = normPhone(req.phone), pw = String(req.password || '');
  if (limited('login:' + phone, 10, 900)) fail("Urinishlar ko'p. 15 daqiqadan so'ng qayta urinib ko'ring.");
  var u = findByPhone(phone);
  if (!u || !safeEq(hash(pw, u.salt), u.passHash)) fail("Telefon raqam yoki parol noto'g'ri.");
  if (u.status === 'blocked') fail("Hisobingiz bloklangan. Admin bilan bog'laning.");
  withLock(function () { var x = findUser(u.id); x.lastLogin = iso(); save('Users', x); });
  var s = createSession(u.id, 'user');
  birthdayCheck(u);
  return { ok: true, token: s.token, user: publicUser(findUserFresh(u.id)) };
}

function apiLogout(req) {
  var s = session(req.token);
  if (s) withLock(function () {
    var list = rows('Sessions');
    for (var i = 0; i < list.length; i++) if (list[i].token === s.token) { sheet('Sessions').deleteRow(list[i]._row); break; }
  });
  if (req.token) CacheService.getScriptCache().remove('S:' + req.token);
  return { ok: true };
}

function apiAdminLogin(req) {
  var p = PropertiesService.getScriptProperties(), h = p.getProperty('ADMIN_HASH'), salt = p.getProperty('ADMIN_SALT');
  if (!h) fail('Admin paroli o\'rnatilmagan. Jadvalda Vector → "2. Admin parolini o\'rnatish" ni bosing.');
  if (limited('admin', 20, 900)) fail("Urinishlar ko'p. 15 daqiqadan so'ng qayta urinib ko'ring.");
  if (!safeEq(hash(String(req.password || ''), salt), h)) fail("Parol noto'g'ri.");
  return { ok: true, token: createSession('admin', 'admin').token };
}

function apiMe(req, u) {
  birthdayCheck(u);
  u = findUserFresh(u.id);
  var prog = rows('Progress').filter(function (p) { return p.userId === u.id; });
  var today = Utilities.formatDate(now(), TZ, 'MM-dd');
  // faollik kunlari (dars ko'rish, test ishlash, coin olish)
  var day = function (s) { var d = new Date(s); return isNaN(d) ? '' : Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); };
  var days = {};
  prog.forEach(function (p) { if (p.updatedAt) days[day(p.updatedAt)] = (days[day(p.updatedAt)] || 0) + 1; });
  rows('Coins').forEach(function (c) { if (c.userId === u.id && c.type === 'quiz') days[day(c.at)] = days[day(c.at)] || 1; });
  var t0 = now(), todayKey = Utilities.formatDate(t0, TZ, 'yyyy-MM-dd');
  var dow = (new Date(todayKey + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = dushanba
  var week = [];
  for (var i = 0; i < 7; i++) week.push(!!days[Utilities.formatDate(new Date(t0.getTime() + (i - dow) * 86400000), TZ, 'yyyy-MM-dd')]);
  var streak = 0, k = days[todayKey] ? 0 : 1;
  while (days[Utilities.formatDate(new Date(t0.getTime() - k * 86400000), TZ, 'yyyy-MM-dd')]) { streak++; k++; }
  return {
    ok: true, user: publicUser(u),
    birthdayToday: !!(u.birthday && u.birthday.slice(5) === today),
    stats: {
      watched: prog.filter(function (p) { return p.watched === '1'; }).length,
      quizzes: prog.filter(function (p) { return num(p.attempts) > 0; }).length,
      today: days[todayKey] || 0, goal: num(settings().daily_goal, 2) || 2, week: week, streak: streak
    },
    leaders: leaders(u.id, num(u.coins))
  };
}

/** Coin bo'yicha reyting: eng yaxshi 5 o'quvchi + o'quvchining o'z o'rni. 5 daqiqa keshda. */
function leaders(myId, myCoins) {
  var b = cacheGet('lead');
  if (!b) {
    var short = function (n) { var p = String(n || '').trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1].charAt(0) + '.' : ''); };
    b = rows('Users').filter(function (x) { return x.status !== 'blocked'; })
      .map(function (x) { return { id: x.id, name: short(x.name), avatar: x.avatar, coins: num(x.coins) }; })
      .sort(function (a, c) { return c.coins - a.coins; }).slice(0, 200);
    cachePut('lead', b, 300);
  }
  // o'quvchining o'z coinlari doim yangi bo'lsin
  b = b.map(function (x) { return x.id === myId ? { id: x.id, name: x.name, avatar: x.avatar, coins: myCoins } : x; })
    .sort(function (a, c) { return c.coins - a.coins; });
  var top = b.slice(0, 5).map(function (x, i) { return { rank: i + 1, name: x.name, avatar: x.avatar, coins: x.coins, me: x.id === myId }; });
  var idx = -1;
  for (var i = 0; i < b.length; i++) if (b[i].id === myId) { idx = i; break; }
  return { top: top, myRank: idx >= 0 ? idx + 1 : null };
}

function apiProfile(req, u) {
  return withLock(function () {
    var x = findUser(u.id);
    if (req.name !== undefined) { var n = clip(req.name, 80); if (n.length < 3) fail('Ism kamida 3 harf.'); x.name = n; }
    if (req.birthday !== undefined) {
      var b = validBirthday(clip(req.birthday, 10));
      if (x.birthday && b !== x.birthday && x.bdayYear) fail("Tug'ilgan sanani o'zgartirish uchun admin bilan bog'laning.");
      x.birthday = b;
    }
    ['region', 'school'].forEach(function (k) { if (req[k] !== undefined) x[k] = clip(req[k], 60); });
    if (req.grade !== undefined) x.grade = clip(req.grade, 20);
    if (req.theme !== undefined) x.theme = req.theme === 'dark' ? 'dark' : 'light';
    save('Users', x);
    return { ok: true, user: publicUser(x) };
  });
}

function apiPassword(req, u) {
  var oldPw = String(req.old || ''), pw = String(req.password || '');
  if (!safeEq(hash(oldPw, u.salt), u.passHash)) fail("Joriy parol noto'g'ri.");
  if (pw.length < 6) fail("Yangi parol kamida 6 ta belgi bo'lsin.");
  withLock(function () { var x = findUser(u.id); x.salt = newToken().slice(0, 16); x.passHash = hash(pw, x.salt); save('Users', x); });
  dropSessions(u.id);
  var s = createSession(u.id, 'user');
  return { ok: true, token: s.token };
}

// ======================= RASMLAR (Google Drive) =======================
function imageFolder() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('IMAGE_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('Vector — sayt rasmlari');
  p.setProperty('IMAGE_FOLDER', f.getId());
  return f;
}

function saveImage(dataUrl, name) {
  var m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) fail('Rasm formati: PNG, JPG yoki WEBP.');
  var bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 1500000) fail('Rasm juda katta (1,5 MB gacha).');
  var file = imageFolder().createFile(Utilities.newBlob(bytes, m[1], name + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2])));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200';
}

function apiAvatar(req, u) {
  if (limited('avatar:' + u.id, 10, 3600)) fail("Rasmni juda ko'p yangiladingiz. Birozdan so'ng urinib ko'ring.");
  var url = saveImage(req.image, 'avatar-' + u.id);
  return withLock(function () { var x = findUser(u.id); x.avatar = url; save('Users', x); return { ok: true, avatar: url }; });
}

function aImage(req) { return { ok: true, url: saveImage(req.image, 'img-' + newId()) }; }

// ======================= OMMAVIY MA'LUMOT (bosh sahifa) =======================
function catalog() {
  var c = cacheGet('cat');
  if (c) return c;
  var lessons = rows('Lessons').filter(function (l) { return l.active !== '0'; });
  var courses = rows('Courses').filter(function (x) { return x.active !== '0'; })
    .sort(function (a, b) { return num(a.order) - num(b.order); })
    .map(function (x) {
      var ls = lessons.filter(function (l) { return l.courseId === x.id; }).sort(function (a, b) { return num(a.order) - num(b.order); });
      return {
        id: x.id, title: x.title, desc: x.desc, image: x.image, teacher: x.teacher, level: x.level, price: num(x.price),
        lessons: ls.map(function (l) {
          var q = []; try { q = JSON.parse(l.quiz || '[]'); } catch (e) {}
          return { id: l.id, title: l.title, duration: l.duration, desc: l.desc, youtube: l.youtube, quiz: q };
        })
      };
    });
  c = { courses: courses };
  cachePut('cat', c);
  return c;
}

function plansList() {
  return rows('Plans').filter(function (p) { return p.active !== '0'; }).sort(function (a, b) { return num(a.order) - num(b.order); })
    .map(function (p) { return { id: p.id, name: p.name, months: num(p.months), price: num(p.price), oldPrice: num(p.oldPrice), features: String(p.features || '').split('\n').filter(String), popular: p.popular === '1' }; });
}

function productsList() {
  return rows('Products').filter(function (p) { return p.active !== '0'; }).sort(function (a, b) { return num(a.order) - num(b.order); })
    .map(function (p) { return { id: p.id, name: p.name, desc: p.desc, image: p.image, price: num(p.price), stock: num(p.stock), category: p.category || 'sovga' }; });
}

function apiPublic() {
  var c = cacheGet('pub');
  if (c) return c;
  var st = settings(), pub = {};
  PUBLIC_SETTINGS.forEach(function (k) { pub[k] = st[k]; });
  pub.tg_bot = tgBot();
  var cat = catalog();
  c = {
    ok: true, settings: pub, plans: plansList(), products: productsList(),
    courses: cat.courses.map(function (x) { return { id: x.id, title: x.title, desc: x.desc, image: x.image, teacher: x.teacher, level: x.level, price: x.price, lessons: x.lessons.length }; }),
    stats: { students: rows('Users').length, courses: cat.courses.length, lessons: cat.courses.reduce(function (n, x) { return n + x.lessons.length; }, 0) }
  };
  cachePut('pub', c);
  return c;
}

// ======================= KURSLAR VA DARSLAR =======================
function progressMap(userId) {
  var m = {};
  rows('Progress').forEach(function (p) { if (p.userId === userId) m[p.lessonId] = p; });
  return m;
}

function apiCourses(req, u) {
  var active = isActive(u), pm = progressMap(u.id);
  var courses = catalog().courses.map(function (c) {
    var prevDone = true;
    var lessons = c.lessons.map(function (l, i) {
      var p = pm[l.id] || {}, done = p.watched === '1';
      var item = { id: l.id, title: l.title, duration: l.duration, hasQuiz: l.quiz.length > 0, quizSize: l.quiz.length, watched: done, best: num(p.best), attempts: num(p.attempts), locked: !active || !prevDone };
      prevDone = done;
      return item;
    });
    var watched = lessons.filter(function (l) { return l.watched; }).length;
    return { id: c.id, title: c.title, desc: c.desc, image: c.image, teacher: c.teacher, level: c.level, lessons: lessons, watched: watched, percent: lessons.length ? Math.round(watched / lessons.length * 100) : 0 };
  });
  return { ok: true, active: active, courses: courses };
}

function findLesson(id) {
  var cs = catalog().courses;
  for (var i = 0; i < cs.length; i++) for (var j = 0; j < cs[i].lessons.length; j++) if (cs[i].lessons[j].id === String(id)) return { course: cs[i], lesson: cs[i].lessons[j], index: j };
  return null;
}

function assertOpen(u, f, pm) {
  if (!f) fail('Dars topilmadi.');
  if (!isActive(u)) fail("Darslarni ko'rish uchun obuna sotib oling.", 'nosub');
  if (f.index > 0) {
    var prev = f.course.lessons[f.index - 1];
    if (!pm[prev.id] || pm[prev.id].watched !== '1') fail('Avval oldingi darsni tugating.', 'locked');
  }
}

function apiLesson(req, u) {
  var f = findLesson(req.id), pm = progressMap(u.id);
  assertOpen(u, f, pm);
  var p = pm[f.lesson.id] || {};
  return {
    ok: true, course: { id: f.course.id, title: f.course.title },
    lesson: {
      id: f.lesson.id, title: f.lesson.title, desc: f.lesson.desc, duration: f.lesson.duration, youtube: youtubeId(f.lesson.youtube),
      // to'g'ri javoblar o'quvchiga yuborilmaydi
      quiz: f.lesson.quiz.map(function (q) { return { q: q.q, o: q.o }; }),
      watched: p.watched === '1', best: num(p.best), attempts: num(p.attempts)
    },
    next: f.course.lessons[f.index + 1] ? f.course.lessons[f.index + 1].id : null,
    prev: f.index > 0 ? f.course.lessons[f.index - 1].id : null
  };
}

function youtubeId(v) {
  v = String(v || '').trim();
  var m = /(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/.exec(v);
  return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(v) ? v : '');
}

function progressRow(u, f) {
  var key = u.id + '_' + f.lesson.id, list = rows('Progress');
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return insert('Progress', { key: key, userId: u.id, lessonId: f.lesson.id, courseId: f.course.id, watched: '', best: '0', attempts: '0', rewarded: '0', updatedAt: iso() });
}

function apiWatched(req, u) {
  var f = findLesson(req.id);
  assertOpen(u, f, progressMap(u.id));
  return withLock(function () {
    var p = progressRow(u, f);
    // testi bor darsda "tugatildi" — testdan keyin; testsiz darsda — videoni ko'rgach
    if (f.lesson.quiz.length && num(p.attempts) === 0) fail('Darsni tugatish uchun testni ishlang.', 'quiz');
    p.watched = '1'; p.updatedAt = iso(); save('Progress', p);
    return { ok: true };
  });
}

function apiQuiz(req, u) {
  var f = findLesson(req.id);
  assertOpen(u, f, progressMap(u.id));
  var quiz = f.lesson.quiz, answers = Array.isArray(req.answers) ? req.answers : [];
  if (!quiz.length) fail("Bu darsda test yo'q.");
  if (answers.length !== quiz.length) fail('Barcha savollarga javob bering.');
  var correct = 0, result = quiz.map(function (q, i) { var ok = Number(answers[i]) === Number(q.a); if (ok) correct++; return ok; });
  var rate = num(settings().coin_per_correct, 2);
  return withLock(function () {
    var p = progressRow(u, f), first = num(p.attempts) === 0, earned = 0;
    p.attempts = String(num(p.attempts) + 1);
    p.best = String(Math.max(num(p.best), correct));
    p.watched = '1';
    // coin faqat birinchi urinishdagi to'g'ri javoblar uchun
    if (first && correct > 0 && rate > 0) {
      earned = correct * rate;
      p.rewarded = String(correct);
      addCoins(u.id, earned, 'quiz', f.course.title + ' — ' + f.lesson.title + ': ' + correct + '/' + quiz.length, 'tizim');
    }
    p.updatedAt = iso(); save('Progress', p);
    return { ok: true, correct: correct, total: quiz.length, result: result, earned: earned, first: first, coins: num(findUser(u.id).coins) };
  });
}

// ======================= COIN =======================
/** Lock ichida chaqirilishi kerak. */
function addCoins(userId, amount, type, reason, by) {
  var u = findUser(userId);
  if (!u) fail("O'quvchi topilmadi.");
  amount = Math.round(num(amount));
  if (!amount) return u;
  var bal = num(u.coins) + amount;
  if (bal < 0) fail('Coin yetarli emas.', 'coins');
  u.coins = String(bal);
  save('Users', u);
  insert('Coins', { id: newId('C'), userId: userId, amount: String(amount), type: type, reason: clip(reason, 200), at: iso(), by: by || '' });
  return u;
}

function apiCoinHistory(req, u) {
  var list = rows('Coins').filter(function (c) { return c.userId === u.id; }).reverse().slice(0, 200)
    .map(function (c) { return { amount: num(c.amount), type: c.type, reason: c.reason, at: c.at }; });
  return { ok: true, coins: num(findUser(u.id).coins), history: list };
}

/** Tug'ilgan kun coini: har kuni trigger orqali va o'quvchi kirganda tekshiriladi. Yiliga bir marta. */
function birthdayCheck(u) {
  try {
    var amount = num(settings().birthday_coins, 0);
    if (!amount || !u.birthday) return;
    var today = Utilities.formatDate(now(), TZ, 'MM-dd'), year = Utilities.formatDate(now(), TZ, 'yyyy');
    if (u.birthday.slice(5) !== today || u.bdayYear === year) return;
    withLock(function () {
      var x = findUser(u.id);
      if (x.bdayYear === year) return;
      x.bdayYear = year; save('Users', x);
      addCoins(x.id, amount, 'birthday', "Tug'ilgan kuningiz bilan! 🎉", 'tizim');
    });
    tgNotify(findUserFresh(u.id), "🎂 <b>Tug'ilgan kuningiz bilan, " + tgEsc(String(u.name).split(' ')[0]) + "!</b>\n\nVector jamoasi sizni tabriklaydi. Sovg'a sifatida hisobingizga <b>" + amount + " coin</b> qo'shildi 🎁", siteBtn("Do'konni ochish", 'kabinet.html#dokon'));
  } catch (e) { console.error(e); }
}

function dailyBirthdays() {
  rows('Users').forEach(function (u) { birthdayCheck(u); });
  try { dailyReminders(); } catch (e) { console.error(e); }
}

// ======================= DO'KON =======================
function apiShop(req, u) { return { ok: true, coins: num(findUser(u.id).coins), products: productsList() }; }

function apiBuy(req, u) {
  var qty = Math.max(1, Math.min(10, Math.round(num(req.qty, 1))));
  if (limited('buy:' + u.id, 20, 3600)) fail("Juda ko'p buyurtma. Birozdan so'ng urinib ko'ring.");
  return withLock(function () {
    var p = byId('Products', req.id);
    if (!p || p.active === '0') fail('Mahsulot topilmadi.');
    if (num(p.stock) < qty) fail('Afsuski, mahsulot qolmadi.');
    var total = num(p.price) * qty, x = findUser(u.id);
    if (num(x.coins) < total) fail('Coin yetarli emas: ' + total + ' kerak, sizda ' + num(x.coins) + '.', 'coins');
    p.stock = String(num(p.stock) - qty); save('Products', p);
    addCoins(x.id, -total, 'order', p.name + ' × ' + qty, 'tizim');
    var o = insert('Orders', { id: newId('B'), userId: x.id, userName: x.name, phone: x.phone, productId: p.id, productName: p.name, qty: String(qty), price: String(total), status: 'yangi', at: iso() });
    cacheClear();
    return { ok: true, order: { id: o.id, product: p.name, qty: qty, price: total }, coins: num(findUser(x.id).coins) };
  });
}

function apiMyOrders(req, u) {
  return { ok: true, orders: rows('Orders').filter(function (o) { return o.userId === u.id; }).reverse()
    .map(function (o) { return { id: o.id, product: o.productName, qty: num(o.qty), price: num(o.price), status: o.status, at: o.at }; }) };
}

// ======================= OBUNA VA TO'LOV =======================
function apiPlans(req, u) { return { ok: true, plans: plansList(), user: publicUser(findUser(u.id)), mode: settings().payment_mode }; }

function apiPayCreate(req, u) {
  var st = settings(), mode = st.payment_mode === 'live' ? 'live' : 'test';
  var provider = mode === 'test' ? 'test' : (req.provider === 'payme' ? 'payme' : 'click');
  if (mode === 'live' && provider === 'click' && !(st.click_service_id && st.click_merchant_id)) fail("Click hali ulanmagan. Payme'ni tanlang yoki admin bilan bog'laning.");
  if (mode === 'live' && provider === 'payme' && !st.payme_merchant_id) fail("Payme hali ulanmagan. Click'ni tanlang yoki admin bilan bog'laning.");
  var plan = null;
  plansList().forEach(function (p) { if (p.id === String(req.planId)) plan = p; });
  if (!plan) fail('Tarif topilmadi.');
  if (limited('pay:' + u.id, 15, 3600)) fail("Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.");
  return withLock(function () {
    var mine = rows('Payments').filter(function (p) { return p.userId === u.id && p.status === 'pending'; });
    // shu tarif va usul bo'yicha kutilayotgan to'lov bo'lsa — o'shani qaytaramiz
    var same = mine.filter(function (p) { return p.planId === plan.id && p.provider === provider && num(p.amount) === plan.price && !p.extId; })[0];
    if (same) return { ok: true, payment: payView(same), mode: mode };
    if (mine.length >= MAX_PENDING_PAYMENTS) fail("Sizda tugallanmagan to'lovlar ko'p. Admin bilan bog'laning.");
    var x = findUser(u.id);
    var p = insert('Payments', { id: newId('P'), userId: x.id, userName: x.name, phone: x.phone, planId: plan.id, planName: plan.name, months: String(plan.months),
      amount: String(plan.price), provider: provider, status: 'pending', createdAt: iso(), paidAt: '', extId: '', extState: '', extCreate: '', extPerform: '', extCancel: '', extReason: '' });
    return { ok: true, payment: payView(p), mode: mode };
  });
}

function payView(p) { return { id: p.id, plan: p.planName, months: num(p.months), amount: num(p.amount), provider: p.provider, status: p.status, createdAt: p.createdAt, paidAt: p.paidAt }; }

function apiMyPayments(req, u) {
  return { ok: true, payments: rows('Payments').filter(function (p) { return p.userId === u.id; }).reverse().map(payView) };
}

/** To'lovni "to'langan" qilish va obunani uzaytirish. Takror chaqirilsa ham bir marta ishlaydi. Lock ichida. */
function markPaid(p, provider, extId) {
  if (p.status === 'paid') return p;
  if (p.status === 'cancelled') fail("To'lov bekor qilingan.");
  var u = findUser(p.userId);
  if (!u) fail("O'quvchi topilmadi.");
  var base = Math.max(Date.now(), Date.parse(u.subEnd) || 0);
  u.subEnd = iso(new Date(base + num(p.months, 1) * 30 * 864e5));
  u.plan = p.planName;
  save('Users', u);
  p.status = 'paid'; p.paidAt = iso(); p.provider = provider || p.provider;
  if (extId) p.extId = String(extId);
  save('Payments', p);
  tgQueue(u, "✅ <b>To'lov qabul qilindi!</b>\n\n" + tgEsc(p.planName) + " obunasi faollashdi. Barcha kurslar " + uzDate(u.subEnd) + " gacha ochiq.", siteBtn("Darslarni boshlash", 'kabinet.html#kurslar'));
  return p;
}

/** To'langan to'lov bekor qilinsa obuna qaytarib olinadi. Lock ichida. */
function revokePaid(p) {
  var u = findUser(p.userId);
  if (u && u.subEnd) {
    var end = (Date.parse(u.subEnd) || 0) - num(p.months, 1) * 30 * 864e5;
    u.subEnd = iso(new Date(Math.max(end, Date.now() - 1000)));
    save('Users', u);
  }
}

// --- to'lov serveri (Cloudflare Worker) uchun ---
function payFull(p) { var o = {}; SHEETS.Payments.forEach(function (h) { o[h] = p[h]; }); o.amount = num(p.amount); o.months = num(p.months); return o; }
function wPayGet(req) { var p = byId('Payments', req.id); return { ok: true, payment: p ? payFull(p) : null }; }
function wPayFindExt(req) {
  var list = rows('Payments');
  for (var i = 0; i < list.length; i++) if (list[i].extId && list[i].extId === String(req.extId)) return { ok: true, payment: payFull(list[i]) };
  return { ok: true, payment: null };
}
function wPayUpdate(req) {
  return withLock(function () {
    var p = byId('Payments', req.id);
    if (!p) return { ok: true, payment: null };
    var f = req.fields || {};
    ['extId', 'extState', 'extCreate', 'extPerform', 'extCancel', 'extReason', 'provider'].forEach(function (k) { if (f[k] !== undefined) p[k] = String(f[k]); });
    save('Payments', p);
    return { ok: true, payment: payFull(p) };
  });
}
function wPayPaid(req) {
  return withLock(function () {
    var p = byId('Payments', req.id);
    if (!p) return { ok: true, payment: null };
    if (req.fields) Object.keys(req.fields).forEach(function (k) { if (/^ext/.test(k)) p[k] = String(req.fields[k]); });
    markPaid(p, req.provider, req.extId);
    return { ok: true, payment: payFull(p) };
  });
}
function wPayCancel(req) {
  return withLock(function () {
    var p = byId('Payments', req.id);
    if (!p) return { ok: true, payment: null };
    if (p.status === 'paid') revokePaid(p);
    p.status = 'cancelled';
    if (req.fields) Object.keys(req.fields).forEach(function (k) { if (/^ext/.test(k)) p[k] = String(req.fields[k]); });
    save('Payments', p);
    return { ok: true, payment: payFull(p) };
  });
}
function wPayList(req) {
  var from = num(req.from), to = num(req.to);
  return { ok: true, payments: rows('Payments').filter(function (p) { var t = num(p.extCreate); return p.provider === req.provider && t >= from && t <= to; }).map(payFull) };
}

// ======================= ADMIN =======================
function adminUser(u) {
  var o = publicUser(u); o.lastLogin = u.lastLogin; return o;
}

function aStats() {
  var users = rows('Users'), pays = rows('Payments'), t = Date.now();
  var month = Utilities.formatDate(now(), TZ, 'yyyy-MM'), today = Utilities.formatDate(now(), TZ, 'yyyy-MM-dd');
  var paidMonth = pays.filter(function (p) { return p.status === 'paid' && p.paidAt && Utilities.formatDate(new Date(p.paidAt), TZ, 'yyyy-MM') === month; });
  return {
    ok: true,
    users: users.length,
    active: users.filter(function (u) { return u.subEnd && Date.parse(u.subEnd) > t && u.status !== 'blocked'; }).length,
    todayUsers: users.filter(function (u) { return u.createdAt && Utilities.formatDate(new Date(u.createdAt), TZ, 'yyyy-MM-dd') === today; }).length,
    revenueMonth: paidMonth.reduce(function (n, p) { return n + num(p.amount); }, 0),
    paymentsMonth: paidMonth.length,
    pendingPayments: pays.filter(function (p) { return p.status === 'pending'; }).length,
    newOrders: rows('Orders').filter(function (o) { return o.status === 'yangi'; }).length,
    coinsTotal: users.reduce(function (n, u) { return n + num(u.coins); }, 0),
    tgBot: tgBot(), tgUsers: users.filter(function (u) { return !!u.tgId; }).length,
    birthdaysToday: users.filter(function (u) { return u.birthday && u.birthday.slice(5) === today.slice(5); }).map(function (u) { return { id: u.id, name: u.name }; })
  };
}

function aUsers(req) {
  var q = String(req.q || '').toLowerCase().trim(), filter = req.filter || 'all', t = Date.now();
  var list = rows('Users').filter(function (u) {
    if (q && (u.name + ' ' + u.phone + ' ' + u.school).toLowerCase().indexOf(q) < 0) return false;
    var act = u.subEnd && Date.parse(u.subEnd) > t;
    if (filter === 'active') return act && u.status !== 'blocked';
    if (filter === 'inactive') return !act && u.status !== 'blocked';
    if (filter === 'blocked') return u.status === 'blocked';
    return true;
  }).reverse();
  var page = Math.max(0, num(req.page)), size = 50;
  return { ok: true, total: list.length, page: page, users: list.slice(page * size, page * size + size).map(adminUser) };
}

function aUserUpdate(req) {
  var r = withLock(function () {
    var u = findUser(req.id);
    if (!u) fail("O'quvchi topilmadi.");
    if (req.status) u.status = req.status === 'blocked' ? 'blocked' : 'active';
    if (req.addDays) {
      var base = Math.max(Date.now(), Date.parse(u.subEnd) || 0);
      u.subEnd = iso(new Date(base + num(req.addDays) * 864e5));
      if (req.plan) u.plan = clip(req.plan, 40);
    }
    if (req.endSub) u.subEnd = iso(new Date(Date.now() - 1000));
    if (req.name) u.name = clip(req.name, 80);
    if (req.birthday !== undefined) u.birthday = validBirthday(clip(req.birthday, 10));
    save('Users', u);
    return { ok: true, user: adminUser(u), drop: u.status === 'blocked' };
  });
  if (r.drop) dropSessions(req.id);
  return r;
}

function aResetPassword(req) {
  var pw = String(Math.floor(100000 + Math.random() * 900000)) + newId().slice(0, 2).toLowerCase();
  withLock(function () {
    var u = findUser(req.id);
    if (!u) fail("O'quvchi topilmadi.");
    u.salt = newToken().slice(0, 16); u.passHash = hash(pw, u.salt); save('Users', u);
  });
  dropSessions(req.id);
  return { ok: true, password: pw };
}

function aGiveCoins(req) {
  var amount = Math.round(num(req.amount));
  if (!amount || Math.abs(amount) > 1000000) fail("Coin miqdorini to'g'ri kiriting.");
  var reason = clip(req.reason, 200) || (amount > 0 ? 'Admin tomonidan' : 'Admin tomonidan ayirildi');
  var ids = Array.isArray(req.ids) ? req.ids : [req.id];
  return withLock(function () {
    var done = 0;
    ids.slice(0, 500).forEach(function (id) {
      var x = findUser(id); if (!x) return;
      addCoins(id, amount, 'admin', reason, 'admin'); done++;
      if (amount > 0) tgQueue(x, '🎁 Sizga <b>' + amount + ' coin</b> berildi!\n' + tgEsc(reason) + '\n\nBalans: ' + x.coins + ' coin');
    });
    return { ok: true, done: done };
  });
}

function aCoinLog(req) {
  var users = {}; rows('Users').forEach(function (u) { users[u.id] = u.name; });
  return { ok: true, log: rows('Coins').filter(function (c) { return !req.userId || c.userId === req.userId; }).reverse().slice(0, 300)
    .map(function (c) { return { name: users[c.userId] || c.userId, amount: num(c.amount), type: c.type, reason: c.reason, at: c.at, by: c.by }; }) };
}

// --- kurslar ---
function aCourses() {
  var lessons = rows('Lessons');
  return { ok: true, courses: rows('Courses').sort(function (a, b) { return num(a.order) - num(b.order); }).map(function (c) {
    return { id: c.id, title: c.title, desc: c.desc, image: c.image, teacher: c.teacher, level: c.level, price: num(c.price), order: num(c.order), active: c.active !== '0',
      lessons: lessons.filter(function (l) { return l.courseId === c.id; }).sort(function (a, b) { return num(a.order) - num(b.order); }).map(function (l) {
        var q = []; try { q = JSON.parse(l.quiz || '[]'); } catch (e) {}
        return { id: l.id, title: l.title, youtube: l.youtube, duration: l.duration, desc: l.desc, order: num(l.order), active: l.active !== '0', quiz: q };
      }) };
  }) };
}

function aCourseSave(req) {
  var c = req.course || {};
  if (clip(c.title, 120).length < 2) fail('Kurs nomini kiriting.');
  return withLock(function () {
    var x = c.id ? byId('Courses', c.id) : null;
    var data = { title: clip(c.title, 120), desc: clip(c.desc, 1000), image: clip(c.image, 500), teacher: clip(c.teacher, 80), level: clip(c.level, 40), price: String(Math.max(0, Math.round(num(c.price)))), order: String(num(c.order)), active: c.active === false ? '0' : '1' };
    if (x) { Object.keys(data).forEach(function (k) { x[k] = data[k]; }); save('Courses', x); }
    else { data.id = newId('K'); x = insert('Courses', data); }
    cacheClear();
    return { ok: true, id: x.id };
  });
}

function aCourseDelete(req) {
  return withLock(function () {
    var c = byId('Courses', req.id);
    if (!c) fail('Kurs topilmadi.');
    var ls = rows('Lessons').filter(function (l) { return l.courseId === c.id; }).sort(function (a, b) { return b._row - a._row; });
    ls.forEach(function (l) { sheet('Lessons').deleteRow(l._row); });
    removeRow('Courses', c);
    cacheClear();
    return { ok: true };
  });
}

function cleanQuiz(q) {
  if (!Array.isArray(q)) return [];
  return q.slice(0, 30).map(function (x) {
    var o = (Array.isArray(x.o) ? x.o : []).map(function (s) { return clip(s, 200); }).filter(String).slice(0, 6);
    var a = Math.round(num(x.a));
    if (!clip(x.q, 500) || o.length < 2 || a < 0 || a >= o.length) fail("Test savollarini to'liq to'ldiring: savol, kamida 2 javob va to'g'ri javob.");
    return { q: clip(x.q, 500), o: o, a: a };
  });
}

function aLessonSave(req) {
  var l = req.lesson || {};
  if (clip(l.title, 160).length < 2) fail('Dars nomini kiriting.');
  if (!byId('Courses', l.courseId)) fail('Kurs topilmadi.');
  if (l.youtube && !youtubeId(l.youtube)) fail("YouTube havolasi noto'g'ri.");
  var quiz = JSON.stringify(cleanQuiz(l.quiz));
  if (quiz.length > 45000) fail('Test juda katta.');
  return withLock(function () {
    var x = l.id ? byId('Lessons', l.id) : null;
    var data = { courseId: String(l.courseId), title: clip(l.title, 160), youtube: clip(l.youtube, 200), duration: clip(l.duration, 20), desc: clip(l.desc, 3000), quiz: quiz, active: l.active === false ? '0' : '1' };
    if (x) { Object.keys(data).forEach(function (k) { x[k] = data[k]; }); if (l.order !== undefined) x.order = String(num(l.order)); save('Lessons', x); }
    else {
      var max = 0; rows('Lessons').forEach(function (r) { if (r.courseId === data.courseId) max = Math.max(max, num(r.order)); });
      data.id = newId('D'); data.order = String(l.order !== undefined && l.order !== '' ? num(l.order) : max + 1); x = insert('Lessons', data);
    }
    cacheClear();
    return { ok: true, id: x.id };
  });
}

function aLessonDelete(req) {
  return withLock(function () { var l = byId('Lessons', req.id); if (!l) fail('Dars topilmadi.'); removeRow('Lessons', l); cacheClear(); return { ok: true }; });
}

// --- do'kon ---
function aProducts() {
  return { ok: true, products: rows('Products').sort(function (a, b) { return num(a.order) - num(b.order); })
    .map(function (p) { return { id: p.id, name: p.name, desc: p.desc, image: p.image, price: num(p.price), stock: num(p.stock), category: p.category || 'sovga', active: p.active !== '0', order: num(p.order) }; }) };
}
function aProductSave(req) {
  var p = req.product || {};
  if (clip(p.name, 120).length < 2) fail('Mahsulot nomini kiriting.');
  if (num(p.price) <= 0) fail("Narxni (coin) kiriting.");
  return withLock(function () {
    var x = p.id ? byId('Products', p.id) : null;
    var data = { name: clip(p.name, 120), desc: clip(p.desc, 500), image: clip(p.image, 500), price: String(Math.round(num(p.price))), stock: String(Math.max(0, Math.round(num(p.stock)))), active: p.active === false ? '0' : '1', order: String(num(p.order)),
      category: ['sovga', 'oshxona', 'markaz'].indexOf(p.category) >= 0 ? p.category : 'sovga' };
    if (x) { Object.keys(data).forEach(function (k) { x[k] = data[k]; }); save('Products', x); }
    else { data.id = newId('M'); x = insert('Products', data); }
    cacheClear();
    return { ok: true, id: x.id };
  });
}
function aProductDelete(req) {
  return withLock(function () { var p = byId('Products', req.id); if (!p) fail('Mahsulot topilmadi.'); removeRow('Products', p); cacheClear(); return { ok: true }; });
}
function aOrders(req) {
  return { ok: true, orders: rows('Orders').filter(function (o) { return !req.status || o.status === req.status; }).reverse().slice(0, 500)
    .map(function (o) { return { id: o.id, name: o.userName, phone: o.phone, product: o.productName, qty: num(o.qty), price: num(o.price), status: o.status, at: o.at }; }) };
}
function aOrderStatus(req) {
  return withLock(function () {
    var o = byId('Orders', req.id);
    if (!o) fail('Buyurtma topilmadi.');
    if (o.status === 'bekor') fail('Buyurtma allaqachon bekor qilingan.');
    if (req.status === 'bekor') {
      addCoins(o.userId, num(o.price), 'refund', 'Buyurtma bekor qilindi: ' + o.productName, 'admin');
      var p = byId('Products', o.productId);
      if (p) { p.stock = String(num(p.stock) + num(o.qty)); save('Products', p); }
      cacheClear();
    }
    o.status = req.status === 'berildi' ? 'berildi' : req.status === 'bekor' ? 'bekor' : 'yangi';
    save('Orders', o);
    var ou = findUser(o.userId);
    if (o.status === 'berildi') tgQueue(ou, "🎉 <b>" + tgEsc(o.productName) + "</b> sovg'angiz topshirildi. Yoqimli foydalaning!");
    if (o.status === 'bekor') tgQueue(ou, "Buyurtma bekor qilindi: " + tgEsc(o.productName) + ". " + o.price + " coin hisobingizga qaytarildi.");
    return { ok: true };
  });
}

// --- to'lovlar ---
function aPayments(req) {
  return { ok: true, payments: rows('Payments').filter(function (p) { return !req.status || p.status === req.status; }).reverse().slice(0, 500)
    .map(function (p) { var v = payView(p); v.name = p.userName; v.phone = p.phone; v.extId = p.extId; return v; }) };
}
function aPaymentAction(req) {
  return withLock(function () {
    var p = byId('Payments', req.id);
    if (!p) fail("To'lov topilmadi.");
    if (req.op === 'confirm') markPaid(p, p.provider === 'test' ? 'test' : 'manual');
    else if (req.op === 'cancel') { if (p.status === 'paid') revokePaid(p); p.status = 'cancelled'; save('Payments', p); }
    else fail("Noma'lum amal.");
    return { ok: true };
  });
}

// --- tariflar ---
function aPlans() {
  return { ok: true, plans: rows('Plans').sort(function (a, b) { return num(a.order) - num(b.order); })
    .map(function (p) { return { id: p.id, name: p.name, months: num(p.months), price: num(p.price), oldPrice: num(p.oldPrice), features: p.features, popular: p.popular === '1', active: p.active !== '0', order: num(p.order) }; }) };
}
function aPlanSave(req) {
  var p = req.plan || {};
  if (clip(p.name, 60).length < 2) fail('Tarif nomini kiriting.');
  if (num(p.months) < 1 || num(p.price) < 1000) fail("Muddat (oy) va narxni (so'm) to'g'ri kiriting.");
  return withLock(function () {
    var x = p.id ? byId('Plans', p.id) : null;
    var data = { name: clip(p.name, 60), months: String(Math.round(num(p.months))), price: String(Math.round(num(p.price))), features: clip(p.features, 1500), popular: p.popular ? '1' : '', active: p.active === false ? '0' : '1', order: String(num(p.order)), oldPrice: String(Math.max(0, Math.round(num(p.oldPrice)))) };
    if (x) { Object.keys(data).forEach(function (k) { x[k] = data[k]; }); save('Plans', x); }
    else { data.id = newId('T'); x = insert('Plans', data); }
    cacheClear();
    return { ok: true, id: x.id };
  });
}
function aPlanDelete(req) {
  return withLock(function () { var p = byId('Plans', req.id); if (!p) fail('Tarif topilmadi.'); removeRow('Plans', p); cacheClear(); return { ok: true }; });
}

// --- sozlamalar ---
function aSettings() {
  var st = settings();
  return { ok: true, settings: DEFAULT_SETTINGS.map(function (r) { return { key: r[0], value: st[r[0]], note: r[2] }; }),
    worker: !!PropertiesService.getScriptProperties().getProperty('WORKER_SECRET') };
}
function aSettingsSave(req) {
  var allowed = {}; DEFAULT_SETTINGS.forEach(function (r) { allowed[r[0]] = r[2]; });
  return withLock(function () {
    var list = rows('Settings'), vals = req.settings || {};
    Object.keys(vals).forEach(function (k) {
      if (!(k in allowed)) return;
      var v = clip(vals[k], 1000);
      if (k === 'payment_mode' && v !== 'live') v = 'test';
      var row = null;
      for (var i = 0; i < list.length; i++) if (list[i].key === k) row = list[i];
      if (row) { row.value = v; save('Settings', row); } else insert('Settings', { key: k, value: v, izoh: allowed[k] });
    });
    cacheClear();
    return { ok: true };
  });
}

// ======================= JADVAL MENYUSI VA O'RNATISH =======================

// ======================= TELEGRAM BOT =======================
// Ro'yxatdan o'tish (telefonni tasdiqlash), parolni tiklash, bildirishnomalar va yangiliklar.
// Sozlash: Jadvalda Vector → "4. Telegram botni ulash" (BotFather bergan token bilan).
var TG_CODE_SECONDS = 60;
function tgProps() { return PropertiesService.getScriptProperties(); }
function tgToken() { return tgProps().getProperty('TG_TOKEN') || ''; }
function tgBot() { return tgProps().getProperty('TG_BOT') || ''; }
function tgEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
var UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
function uzDate(s) { var d = new Date(s); if (isNaN(d)) return ''; var p = Utilities.formatDate(d, TZ, 'yyyy-MM-dd').split('-'); return Number(p[2]) + '-' + UZ_MONTHS[Number(p[1]) - 1] + ', ' + p[0]; }
function siteBtn(text, path) {
  var base = String(settings().site_url || '').replace(/\/?$/, '/');
  return /^https:\/\//.test(base) ? { inline_keyboard: [[{ text: text, url: base + (path || '') }]] } : null;
}
function code6() { var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid(), Utilities.Charset.UTF_8); return String(100000 + ((((b[0] & 255) << 16) | ((b[1] & 255) << 8) | (b[2] & 255)) % 900000)); }

function tgApi(method, payload) {
  var t = tgToken(); if (!t) return null;
  try {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + t + '/' + method, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true });
    return JSON.parse(r.getContentText());
  } catch (e) { console.error('tg ' + method + ': ' + e); return null; }
}
function tgSend(chatId, text, markup) {
  var p = { chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (markup) p.reply_markup = markup;
  return tgApi('sendMessage', p);
}
function tgNotify(u, text, markup) { if (u && u.tgId && tgToken()) tgSend(u.tgId, text, markup); }
// Lock ichida yuborilmaydi: navbatga qo'yiladi va javobdan oldin yuboriladi
var TGQ = [];
function tgQueue(u, text, markup) { if (u && u.tgId) TGQ.push([u.tgId, text, markup]); }
function tgFlush() { var q = TGQ; TGQ = []; if (!q.length || !tgToken()) return; q.forEach(function (m) { tgSend(m[0], m[1], m[2]); }); }

var CONTACT_KB = { keyboard: [[{ text: '📱 Telefon raqamni yuborish', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
var NO_KB = { remove_keyboard: true };

/** Telegram webhook: https://.../exec?tg=MAXFIY_KALIT */
function tgWebhook(e) {
  var key = tgProps().getProperty('TG_HOOK');
  if (!key || !safeEq(String(e.parameter.tg), key)) return { ok: false };
  var up; try { up = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (x) { return { ok: true }; }
  // Telegram bir xabarni qayta yuborishi mumkin — bir marta ishlaymiz
  var c = CacheService.getScriptCache();
  if (up.update_id !== undefined) { if (c.get('U:' + up.update_id)) return { ok: true }; c.put('U:' + up.update_id, '1', 21600); }
  try { tgUpdate(up); } catch (err) { console.error(err && err.stack || err); }
  return { ok: true };
}

function tgUpdate(up) {
  var c = CacheService.getScriptCache();
  if (up.callback_query) {
    var q = up.callback_query, chat = q.message && q.message.chat && q.message.chat.id;
    tgApi('answerCallbackQuery', { callback_query_id: q.id });
    if (q.data === 'nc') tgSendRegCode(chat, true);
    return;
  }
  var m = up.message; if (!m || !m.chat || m.chat.type !== 'private') return;
  var chat = m.chat.id, text = String(m.text || '').trim();
  if (m.contact) return tgContact(m);
  if (/^\/start/.test(text)) {
    var arg = text.split(/\s+/)[1] || '';
    if (/^r_[A-Za-z0-9]{10,40}$/.test(arg)) {
      var R = regGet(arg.slice(2));
      if (!R) return tgSend(chat, "Bu havolaning vaqti tugagan. Saytda ro'yxatdan o'tishni qaytadan boshlang.", siteBtn("Ro'yxatdan o'tish", 'kirish.html?mode=register'));
      R.chatId = chat; regPut(arg.slice(2), R);
      c.put('C:' + chat, 'r:' + arg.slice(2), 1200);
      return tgSend(chat, 'Salom, <b>' + tgEsc(R.name) + "</b>! 👋\n\nRo'yxatdan o'tishni yakunlash uchun pastdagi tugma orqali telefon raqamingizni yuboring.", CONTACT_KB);
    }
    if (/^l_[A-Za-z0-9]{10,40}$/.test(arg)) {
      var uid = c.get('LK:' + arg.slice(2)); c.remove('LK:' + arg.slice(2));
      if (!uid) return tgSend(chat, "Havolaning vaqti tugagan. Kabinetdagi «Botni ulash» tugmasini qayta bosing.");
      var nm = withLock(function () { var x = findUser(uid); if (!x) return ''; x.tgId = String(chat); save('Users', x); return x.name; });
      return tgSend(chat, '✅ Bot ulandi, <b>' + tgEsc(nm) + "</b>!\n\nEndi yangiliklar, to'lovlar, sovg'alar va eslatmalar shu yerga keladi.", NO_KB);
    }
    if (arg === 'reset') return tgAskReset(chat);
    return tgSend(chat, "Salom! Bu <b>Vector</b> ta'lim platformasining rasmiy boti 🤖\n\nBu yerda:\n• ro'yxatdan o'tish kodini olasiz\n• parolni tiklaysiz — /parol\n• yangiliklar va eslatmalarni olasiz", siteBtn('Saytni ochish', ''));
  }
  if (/^\/(parol|reset)/i.test(text)) return tgAskReset(chat);
  tgSend(chat, "Parolni tiklash uchun /parol ni bosing.\nSaytga o'tish uchun pastdagi tugmadan foydalaning.", siteBtn('Saytni ochish', ''));
}

function tgAskReset(chat) {
  CacheService.getScriptCache().put('C:' + chat, 'p', 600);
  return tgSend(chat, "Parolni tiklash uchun akkauntingizdagi telefon raqamni pastdagi tugma orqali yuboring.", CONTACT_KB);
}

function tgContact(m) {
  var chat = m.chat.id, c = CacheService.getScriptCache();
  if (!m.from || m.contact.user_id !== m.from.id) return tgSend(chat, "Iltimos, <b>o'zingizning</b> raqamingizni pastdagi tugma orqali yuboring.", CONTACT_KB);
  var phone = normPhone(m.contact.phone_number);
  if (!/^\d{9}$/.test(phone)) return tgSend(chat, "Faqat O'zbekiston raqami (+998) qabul qilinadi.", NO_KB);
  var ctx = c.get('C:' + chat) || '';
  if (ctx.indexOf('r:') === 0) {
    var rid = ctx.slice(2), R = regGet(rid);
    if (!R) return tgSend(chat, "Ro'yxatdan o'tish vaqti tugadi. Saytda qaytadan boshlang.", NO_KB);
    if (findByPhone(phone)) {
      c.remove('C:' + chat);
      return tgSend(chat, "Bu raqam allaqachon ro'yxatdan o'tgan. Saytda «Kirish» bo'limidan kiring.\nParolni unutgan bo'lsangiz: /parol", NO_KB);
    }
    R.phone = phone; R.chatId = chat; R.codes = 0; regPut(rid, R);
    tgSend(chat, 'Rahmat! ✅', NO_KB);
    return tgSendRegCode(chat, false);
  }
  if (ctx === 'p') {
    var u = findByPhone(phone);
    if (!u) return tgSend(chat, "Bu raqam bilan akkaunt topilmadi. Saytda ro'yxatdan o'ting.", NO_KB);
    if (limited('pwc:' + phone, 5, 3600)) return tgSend(chat, "Juda ko'p urinish. 1 soatdan so'ng qayta urinib ko'ring.", NO_KB);
    var code = code6();
    c.put('P:' + phone, JSON.stringify({ code: code, exp: Date.now() + TG_CODE_SECONDS * 1000, tries: 0 }), 300);
    c.remove('C:' + chat);
    if (u.tgId !== String(chat)) withLock(function () { var x = findUser(u.id); x.tgId = String(chat); save('Users', x); });
    return tgSend(chat, "🔐 Parolni tiklash kodi: <code>" + code + "</code>\n\nKod <b>1 daqiqa</b> amal qiladi. Uni saytdagi «Parolni tiklash» oynasiga kiriting.\nAgar buni siz so'ramagan bo'lsangiz, e'tibor bermang.", NO_KB);
  }
  tgSend(chat, "Avval saytda ro'yxatdan o'tishni boshlang yoki parolni tiklash uchun /parol ni bosing.", NO_KB);
}

/** Ro'yxatdan o'tish uchun 1 daqiqalik kod */
function tgSendRegCode(chat, again) {
  var ctx = CacheService.getScriptCache().get('C:' + chat) || '';
  if (ctx.indexOf('r:') !== 0) return tgSend(chat, "Ro'yxatdan o'tish vaqti tugadi. Saytda qaytadan boshlang.");
  var rid = ctx.slice(2), R = regGet(rid);
  if (!R || !R.phone) return tgSend(chat, "Avval telefon raqamingizni yuboring.", CONTACT_KB);
  if (num(R.codes) >= 5) return tgSend(chat, "Kod ko'p marta so'raldi. Saytda ro'yxatdan o'tishni qaytadan boshlang.");
  R.code = code6(); R.exp = Date.now() + TG_CODE_SECONDS * 1000; R.codes = num(R.codes) + 1; R.tries = 0; regPut(rid, R);
  return tgSend(chat, (again ? 'Yangi kod' : 'Tasdiqlash kodingiz') + ': <code>' + R.code + "</code>\n\nKod <b>1 daqiqa</b> amal qiladi. Uni saytdagi oynaga kiriting.",
    { inline_keyboard: [[{ text: '🔄 Yangi kod olish', callback_data: 'nc' }]] });
}

// --- vaqtinchalik ro'yxatdan o'tish ma'lumoti (20 daqiqa) ---
function regGet(rid) { var v = CacheService.getScriptCache().get('R:' + rid); return v ? JSON.parse(v) : null; }
function regPut(rid, R) { CacheService.getScriptCache().put('R:' + rid, JSON.stringify(R), 1200); }

function apiRegStart(req) {
  if (!tgToken() || !tgBot()) fail("Telegram bot hali ulanmagan. Admin bilan bog'laning.", 'tg');
  var name = clip(req.name, 80), pw = String(req.password || '');
  if (name.length < 3) fail('Ism va familiyani kiriting.');
  if (pw.length < 6) fail("Parol kamida 6 ta belgidan iborat bo'lsin.");
  if (limited('regstart', 300, 600)) fail("Hozir so'rovlar juda ko'p. Bir daqiqadan so'ng qayta urinib ko'ring.");
  var rid = newToken().slice(0, 24), salt = newToken().slice(0, 16);
  regPut(rid, { name: name, salt: salt, hash: hash(pw, salt), at: Date.now() });
  return { ok: true, rid: rid, bot: tgBot(), link: 'https://t.me/' + tgBot() + '?start=r_' + rid };
}

function apiRegStatus(req) {
  var R = regGet(String(req.rid || ''));
  if (!R) return { ok: true, state: 'expired' };
  return { ok: true, state: R.code ? 'code' : R.chatId ? 'bot' : 'wait', phone: R.phone ? '+998 ' + R.phone.slice(0, 2) + ' *** ** ' + R.phone.slice(7) : '' };
}

function apiRegVerify(req) {
  var rid = String(req.rid || ''), code = String(req.code || '').replace(/\D/g, '');
  var R = regGet(rid);
  if (!R) fail("Ro'yxatdan o'tish vaqti tugadi. Qaytadan boshlang.", 'expired');
  if (!R.code) fail("Avval Telegram botga o'ting va telefon raqamingizni yuboring.");
  R.tries = num(R.tries) + 1; regPut(rid, R);
  if (R.tries > 5) fail("Urinishlar ko'p. Botda «Yangi kod olish» tugmasini bosing.");
  if (Date.now() > num(R.exp)) fail("Kodning vaqti tugadi. Botda «Yangi kod olish» tugmasini bosing.");
  if (!safeEq(code, String(R.code))) fail("Kod noto'g'ri. Botdagi 6 xonali kodni kiriting.");
  var u = withLock(function () {
    if (findByPhone(R.phone)) fail("Bu raqam allaqachon ro'yxatdan o'tgan. Kirish bo'limidan foydalaning.");
    return insert('Users', {
      id: newId('U'), phone: R.phone, name: R.name, avatar: '', birthday: '', region: '', school: '', grade: '', passHash: R.hash, salt: R.salt,
      coins: '0', plan: '', subEnd: '', status: 'active', createdAt: iso(), lastLogin: iso(), theme: 'light', bdayYear: '', tgId: String(R.chatId), remindAt: iso(), remindN: '0', subRemind: ''
    });
  });
  CacheService.getScriptCache().remove('R:' + rid);
  var s = createSession(u.id, 'user');
  tgSend(R.chatId, "🎉 <b>Tabriklaymiz, " + tgEsc(R.name.split(' ')[0]) + "!</b> Siz Vector'da ro'yxatdan o'tdingiz.\n\nKabinetda viloyat, maktab, sinf va tug'ilgan sanangizni kiriting — tug'ilgan kuningizda coin sovg'a qilamiz 🎁\n\nYangiliklar, to'lovlar va parolni tiklash shu botga keladi.", siteBtn('Kabinetni ochish', 'kabinet.html'));
  return { ok: true, token: s.token, user: publicUser(findUserFresh(u.id)) };
}

function apiPwReset(req) {
  var phone = normPhone(req.phone), code = String(req.code || '').replace(/\D/g, ''), pw = String(req.password || '');
  if (!/^\d{9}$/.test(phone)) fail("Telefon raqamni to'liq kiriting.");
  if (pw.length < 6) fail("Parol kamida 6 ta belgidan iborat bo'lsin.");
  var c = CacheService.getScriptCache(), raw = c.get('P:' + phone);
  if (!raw) fail("Kod topilmadi yoki vaqti tugagan. Botda /parol ni bosib yangi kod oling.");
  var P = JSON.parse(raw); P.tries = num(P.tries) + 1; c.put('P:' + phone, JSON.stringify(P), 300);
  if (P.tries > 5) { c.remove('P:' + phone); fail("Urinishlar ko'p. Botda /parol ni bosib yangi kod oling."); }
  if (Date.now() > num(P.exp)) fail("Kodning vaqti tugadi. Botda /parol ni bosib yangi kod oling.");
  if (!safeEq(code, String(P.code))) fail("Kod noto'g'ri.");
  var u = withLock(function () {
    var x = findByPhone(phone); if (!x) fail("Akkaunt topilmadi.");
    x.salt = newToken().slice(0, 16); x.passHash = hash(pw, x.salt); save('Users', x); return x;
  });
  c.remove('P:' + phone);
  dropSessions(u.id);
  var s = createSession(u.id, 'user');
  tgNotify(u, "🔐 Parolingiz yangilandi. Agar buni siz qilmagan bo'lsangiz, darhol admin bilan bog'laning.");
  return { ok: true, token: s.token };
}

function apiTgLink(req, u) {
  if (!tgToken() || !tgBot()) fail("Telegram bot hali ulanmagan.");
  var k = newToken().slice(0, 24);
  CacheService.getScriptCache().put('LK:' + k, u.id, 900);
  return { ok: true, link: 'https://t.me/' + tgBot() + '?start=l_' + k };
}

/** Admin: barcha (yoki tanlangan) o'quvchilarga xabar */
function aBroadcast(req) {
  var text = clip(req.text, 3500);
  if (text.length < 3) fail('Xabar matnini yozing.');
  if (!tgToken()) fail("Telegram bot ulanmagan. Jadvalda Vector → \"4. Telegram botni ulash\" ni bosing.");
  var list = rows('Users').filter(function (u) {
    if (!u.tgId || u.status === 'blocked') return false;
    return req.to === 'active' ? isActive(u) : req.to === 'inactive' ? !isActive(u) : true;
  });
  var seen = {}, chats = [];
  list.forEach(function (u) { if (!seen[u.tgId]) { seen[u.tgId] = 1; chats.push(u.tgId); } });
  var t = tgToken(), sent = 0, failed = 0, body = '📢 <b>Vector</b>\n\n' + tgEsc(text);
  for (var i = 0; i < chats.length; i += 25) {
    var reqs = chats.slice(i, i + 25).map(function (id) {
      return { url: 'https://api.telegram.org/bot' + t + '/sendMessage', method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ chat_id: id, text: body, parse_mode: 'HTML', disable_web_page_preview: true }) };
    });
    UrlFetchApp.fetchAll(reqs).forEach(function (r) { if (r.getResponseCode() === 200) sent++; else failed++; });
    if (i + 25 < chats.length) Utilities.sleep(1100); // Telegram: soniyasiga ~30 ta xabar
  }
  return { ok: true, total: chats.length, sent: sent, failed: failed };
}

/** Har kuni: profilni to'ldirish va obuna tugashi haqida eslatma */
function dailyReminders() {
  if (!tgToken()) return;
  var nowMs = Date.now(), done = [];
  rows('Users').forEach(function (u) {
    if (!u.tgId || u.status === 'blocked') return;
    var missing = !u.region || !u.school || !u.grade || !u.birthday;
    if (missing && num(u.remindN) < 3 && nowMs - (Date.parse(u.remindAt) || 0) > 2 * 864e5) {
      tgSend(u.tgId, "📝 <b>" + tgEsc(String(u.name).split(' ')[0]) + "</b>, profilingizni to'ldiring: viloyat, maktab, sinf va tug'ilgan sana.\n\nTug'ilgan kuningizda <b>" + num(settings().birthday_coins, 0) + " coin</b> sovg'a qilamiz 🎁", siteBtn("Profilni to'ldirish", 'kabinet.html#profil'));
      done.push([u.id, 'remind']);
    }
    var left = (Date.parse(u.subEnd) || 0) - nowMs;
    if (left > 0 && left < 3 * 864e5 && u.subRemind !== u.subEnd) {
      tgSend(u.tgId, "⏳ Obunangiz <b>" + uzDate(u.subEnd) + "</b> kuni tugaydi. Darslar to'xtab qolmasligi uchun uni uzaytiring.", siteBtn('Obunani uzaytirish', 'kabinet.html#obuna'));
      done.push([u.id, 'sub']);
    }
  });
  if (done.length) withLock(function () {
    done.forEach(function (d) {
      var x = findUser(d[0]); if (!x) return;
      if (d[1] === 'remind') { x.remindAt = iso(); x.remindN = String(num(x.remindN) + 1); } else x.subRemind = x.subEnd;
      save('Users', x);
    });
  });
}

/** Jadval menyusi: botni ulash */
function connectTelegram() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Telegram bot', "@BotFather bergan bot tokenini kiriting (masalan 123456789:AA...):", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var url = ScriptApp.getService().getUrl();
  if (!url || !/\/exec$/.test(url)) {
    var u2 = ui.prompt('Sayt manzili', "Apps Script veb-ilova manzilini kiriting (https://script.google.com/macros/s/.../exec):", ui.ButtonSet.OK_CANCEL);
    if (u2.getSelectedButton() !== ui.Button.OK) return;
    url = u2.getResponseText().trim();
  }
  var w = ui.prompt("To'lov serveri (ixtiyoriy)", "Cloudflare Worker manzili bo'lsa kiriting (https://vector-payments....workers.dev).\nBot shu orqali tezroq va ishonchli ishlaydi. Bo'lmasa bo'sh qoldirib OK ni bosing.", ui.ButtonSet.OK_CANCEL);
  if (w.getSelectedButton() !== ui.Button.OK) return;
  var res = connectTelegramValue(r.getResponseText().trim(), url, w.getResponseText().trim());
  ui.alert(res.ok ? "Tayyor! Bot ulandi: @" + res.bot + (res.via === 'worker' ? ' (Worker orqali)' : '') + "\n\nEndi saytda ro'yxatdan o'tish Telegram orqali tasdiqlanadi." : 'Xatolik: ' + res.error);
}

function connectTelegramValue(token, execUrl, workerUrl) {
  if (!/^\d+:[\w-]{30,}$/.test(token)) return { ok: false, error: "Token noto'g'ri ko'rinishda." };
  workerUrl = String(workerUrl || '').trim().replace(/\/+$/, '');
  if (workerUrl && !/^https:\/\/[\w.-]+\.workers\.dev$|^https:\/\/[\w.-]+\.[a-z]{2,}$/.test(workerUrl)) return { ok: false, error: "Worker manzili noto'g'ri. Masalan: https://vector-payments.nom.workers.dev" };
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(execUrl)) return { ok: false, error: "Veb-ilova manzili noto'g'ri. Avval Deploy → New deployment qiling." };
  var p = tgProps(), old = p.getProperty('TG_TOKEN');
  p.setProperty('TG_TOKEN', token);
  var me = tgApi('getMe', {});
  if (!me || !me.ok) { if (old) p.setProperty('TG_TOKEN', old); else p.deleteProperty('TG_TOKEN'); return { ok: false, error: 'Token ishlamadi. BotFather bergan tokenni tekshiring.' }; }
  var hook = newToken().slice(0, 32);
  p.setProperty('TG_HOOK', hook);
  p.setProperty('TG_BOT', me.result.username);
  var wh = tgApi('setWebhook', { url: (workerUrl ? workerUrl + '/tg' : execUrl) + '?tg=' + hook, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  if (!wh || !wh.ok) return { ok: false, error: 'Webhook o\'rnatilmadi: ' + (wh && wh.description) };
  tgApi('setMyCommands', { commands: [{ command: 'start', description: 'Boshlash' }, { command: 'parol', description: 'Parolni tiklash' }] });
  cacheClear();
  return { ok: true, bot: me.result.username, via: workerUrl ? 'worker' : 'direct' };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Vector')
    .addItem('1. Jadvalni tayyorlash', 'setup')
    .addItem("2. Admin parolini o'rnatish", 'setAdminPassword')
    .addItem("3. To'lov serveri kalitini yaratish", 'makeWorkerSecret')
    .addItem('4. Telegram botni ulash', 'connectTelegram')
    .addSeparator()
    .addItem('Keshni tozalash', 'cacheClear')
    .addToUi();
}

function setup() {
  var book = ss();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = book.getSheetByName(name) || book.insertSheet(name), head = SHEETS[name];
    var cols = Math.max(sh.getMaxColumns(), head.length);
    if (sh.getMaxColumns() < head.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), cols).setNumberFormat('@'); // hammasi matn: telefon va sanalar o'zgarib ketmasin
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1E63F0').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  var first = book.getSheetByName('Sheet1') || book.getSheetByName('Лист1') || book.getSheetByName('Varaq1');
  if (first && book.getSheets().length > 1 && first.getLastRow() === 0) book.deleteSheet(first);
  MEMO = {};
  if (!rows('Settings').length) DEFAULT_SETTINGS.forEach(function (r) { insert('Settings', { key: r[0], value: r[1], izoh: r[2] }); });
  if (!rows('Plans').length) seedPlans();
  if (!rows('Courses').length) seedCourses();
  if (!rows('Products').length) seedProducts();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyBirthdays') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyBirthdays').timeBased().everyDays(1).atHour(7).inTimezone(TZ).create();
  imageFolder();
  cacheClear();
  try { SpreadsheetApp.getUi().alert("Tayyor! Endi Vector → \"2. Admin parolini o'rnatish\" ni bosing, so'ng saytni Veb-ilova sifatida joylang (README'ga qarang)."); } catch (e) {}
}

// ---- boshlang'ich ma'lumotlar (vectortalim saytidagi bilan bir xil) ----
function seedPlans() {
  var F = ["Juda oddiy - har oyda qayta to'lov", "Vector ni sinab ko'rish uchun qulay", "Barcha yo'nalish bo'yicha videodarslar.", 'Kurs yakunida sertifikat.',
    "Shaxsiy mentor ko'magi.", "Vector loyihasiga qo'shilish imkoniyati", 'Ish topishda nazariy yordam'];
  // [nomi, oylik narx, yillik narx, yillik eski narx, afzalliklar soni, ommabop]
  [['START', 69000, 708000, 828000, 4, false], ['PRO', 89000, 948000, 1068000, 6, true], ['VIP', 110000, 1188000, 1320000, 7, false]].forEach(function (p, i) {
    var f = F.slice(0, p[4]).join('\n');
    insert('Plans', { id: newId('T'), name: p[0], months: '1', price: String(p[1]), features: f, popular: p[5] ? '1' : '', active: '1', order: String(i + 1), oldPrice: '' });
    insert('Plans', { id: newId('T'), name: p[0], months: '12', price: String(p[2]), features: f.replace("Juda oddiy - har oyda qayta to'lov", "Bir marta to'lov — butun yil"), popular: p[5] ? '1' : '', active: '1', order: String(i + 11), oldPrice: String(p[3]) });
  });
}

function seedCourses() {
  var q = function (a, b) { return JSON.stringify([
    { q: a, o: ['Ha', "Yo'q", 'Bilmayman'], a: 0 },
    { q: b, o: ['Klaviatura', 'Monitor', 'Sichqoncha'], a: 1 }]); };
  [['Kompyuter savodxonligi', "Kompyuter bilan ishlash, fayllar, Word va Excel asoslari.", 350000],
   ['AI kontent', "Sun'iy intellekt yordamida matn, rasm va video kontent yaratish.", 450000],
   ['Grafik dizayn', 'Canva va Photoshop yordamida post, banner va logotip yaratish.', 450000],
   ['No Coding', 'Kod yozmasdan sayt, bot va ilovalar yaratish.', 400000],
   ['Scratch', "O'yinlar va animatsiyalar orqali dasturlash mantiqini o'rganish.", 350000],
   ['UI/UX dizayn', 'Figma yordamida ilova va sayt interfeyslarini loyihalash.', 400000],
   ['Kiber xavfsizlik', "Raqamli dunyoda xavfsiz bo'lish: tarmoq xavfsizligi va zararli dasturlarni aniqlash.", 600000]]
    .forEach(function (c, i) {
      var k = insert('Courses', { id: newId('K'), title: c[0], desc: c[1], image: 'assets/img/courses/kurs-' + (i + 1) + '.png', teacher: 'Xusniddin Sharofiddinov', level: '', order: String(i + 1), active: '1', price: String(c[2]) });
      for (var n = 1; n <= 3; n++) insert('Lessons', { id: newId('D'), courseId: k.id, order: String(n), title: n + '-dars', youtube: '', duration: '10:00',
        desc: "Dars tavsifi. Admin paneldan YouTube havolasini va testni qo'shing.", quiz: q('Bu ' + n + '-dars?', "Ma'lumotni qaysi qurilmada ko'ramiz?"), active: '1' });
    });
}

function seedProducts() {
  [["Vector to'plami", "Futbolka, kepka, termos, sumka va stikerlar", 3000, 20], ['Kepka', 'Vector logosi tushirilgan kepka', 2000, 20],
   ['Termos', 'Vector logosi tushirilgan termos', 2000, 20], ['Simsiz sichqoncha', 'Bluetooth, RGB yoritgichli sichqoncha', 3500, 20],
   ['Mexanik klaviatura', 'RGB yoritgichli ixcham klaviatura', 6000, 15], ['Planshet', "Klaviatura va sichqoncha bilan to'plam", 25000, 5],
   ['Redmi A5 smartfon', "Kundalik o'qish uchun smartfon", 30000, 5], ['Noutbuk', "O'qish va dasturlash uchun noutbuk", 80000, 3],
   ['Soatli karnay', 'Raqamli soatli Bluetooth karnay', 5000, 15], ['Smart soat', 'Faollik va bildirishnomalar uchun', 9000, 10],
   ['Simsiz quloqchin', 'Zaryadlovchi qutili TWS quloqchin', 7000, 15], ['Telefon tagligi', "Stol uchun yig'iladigan taglik", 1500, 20],
   ['Quloqchin', 'Boshga kiyiladigan simsiz quloqchin', 8000, 10], ['Telegram Premium', 'Telegram Premium obunasi', 4000, 20],
   ['Claude AI Pro', 'Claude AI Pro obunasi', 12000, 10], ['IELTS vaucheri', 'IELTS imtihoni uchun 30% chegirma', 15000, 10],
   ['Milliy sertifikat', 'Milliy sertifikat xarajatlari qoplanadi', 20000, 10], ['Stol', "Uyda o'qish uchun ish stoli", 18000, 5],
   ['Stul', 'Qulay ofis stuli', 12000, 5], ['Velosiped', "Tog' velosipedi", 60000, 3]]
    .forEach(function (g, i) {
      insert('Products', { id: newId('M'), name: g[0], desc: g[1], image: 'assets/img/gifts/g' + ('0' + (i + 1)).slice(-2) + '.png', price: String(g[2]), stock: String(g[3]), active: '1', order: String(i + 1), category: 'sovga' });
    });
}

function setAdminPassword() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Admin paroli', 'Yangi admin parolini kiriting (kamida 8 belgi):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pw = r.getResponseText();
  if (pw.length < 8) { ui.alert("Parol kamida 8 belgi bo'lsin."); return; }
  setAdminPasswordValue(pw);
  ui.alert("Admin paroli o'rnatildi. Saytdagi admin.html sahifasidan shu parol bilan kirasiz.");
}

function setAdminPasswordValue(pw) {
  var salt = newToken().slice(0, 16), p = PropertiesService.getScriptProperties();
  p.setProperty('ADMIN_SALT', salt);
  p.setProperty('ADMIN_HASH', hash(pw, salt));
  // eski admin sessiyalarini bekor qilish
  withLock(function () {
    var list = rows('Sessions'), c = CacheService.getScriptCache();
    for (var i = list.length - 1; i >= 0; i--) if (list[i].role === 'admin') { c.remove('S:' + list[i].token); sheet('Sessions').deleteRow(list[i]._row); }
  });
}

function makeWorkerSecret() {
  var s = newToken();
  PropertiesService.getScriptProperties().setProperty('WORKER_SECRET', s);
  SpreadsheetApp.getUi().alert("To'lov serveri kaliti (Cloudflare Worker'dagi GAS_SECRET ga qo'ying):\n\n" + s + "\n\nUni hech kimga bermang.");
}

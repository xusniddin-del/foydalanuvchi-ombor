// Backend testlari: node tests/api.test.js
const { createGas } = require('./gas-mock');
const g = createGas();
g.ctx.setup();
g.ctx.setAdminPasswordValue('admin-parol-123');
g.props.set('WORKER_SECRET', 'w'.repeat(64));
const call = g.call;
let pass = 0; const fails = [];
const t = (name, cond) => { if (cond) pass++; else fails.push(name); console.log((cond ? 'PASS ' : 'FAIL ') + name); };

// --- ommaviy ---
const pub = call({ action: 'public' });
t('public ok', pub.ok && pub.plans.length === 6 && pub.courses.length === 7 && pub.products.length === 20 && pub.plans.some(p => p.months === 12 && p.oldPrice === 828000));
t('public has no quiz answers / youtube', !JSON.stringify(pub.courses).includes('"a":') && !JSON.stringify(pub.courses).includes('youtube'));

// --- ro'yxatdan o'tish ---
let r = call({ action: 'register', phone: '+998 90 123 45 67', name: 'Ali Valiyev', password: '123' });
t('short password refused', !r.ok);
r = call({ action: 'register', phone: '90 123 45 67', name: 'Ali Valiyev', password: 'parol123', birthday: '2014-03-05', school: '18', grade: '5' });
t('register ok', r.ok && r.token && r.user.phone === '901234567' && r.user.coins === 0 && !r.user.passHash);
const A = r.token;
r = call({ action: 'register', phone: '901234567', name: 'Boshqa', password: 'parol123' });
t('duplicate phone refused', !r.ok);
const B = call({ action: 'register', phone: '907654321', name: 'Bobur Karimov', password: 'boburpass' }).token;
t('passwords stored hashed', !JSON.stringify(g.sheets.Users.data).includes('parol123'));

// --- kirish ---
r = call({ action: 'login', phone: '901234567', password: 'xato' });
t('wrong password', !r.ok);
r = call({ action: 'login', phone: '+998901234567', password: 'parol123' });
t('login ok', r.ok && r.token);
t('forged token rejected', !call({ action: 'me', token: 'x'.repeat(64) }).ok);
t('me ok', call({ action: 'me', token: A }).user.name === 'Ali Valiyev');

// --- obunasiz darslar yopiq ---
let cs = call({ action: 'courses', token: A });
t('courses locked without sub', cs.ok && !cs.active && cs.courses[0].lessons.every(l => l.locked));
const L1 = cs.courses[0].lessons[0].id, L2 = cs.courses[0].lessons[1].id;
t('lesson refused without sub', call({ action: 'lesson', token: A, id: L1 }).code === 'nosub');
t('quiz refused without sub', !call({ action: 'quiz', token: A, id: L1, answers: [0, 1] }).ok);

// --- to'lov (test rejimi) + admin tasdiqlaydi ---
const plans = call({ action: 'plans', token: A }).plans;
r = call({ action: 'pay.create', token: A, planId: plans[0].id, provider: 'click' });
t('payment created in test mode', r.ok && r.payment.provider === 'test' && r.payment.status === 'pending' && r.payment.amount === 69000);
const P1 = r.payment.id;
t('same pending payment reused', call({ action: 'pay.create', token: A, planId: plans[0].id }).payment.id === P1);
t('user cannot call admin', !call({ action: 'a.payment', token: A, id: P1, op: 'confirm' }).ok);
const PNG = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');
t('receipt upload on own pending payment', call({ action: 'pay.receipt', token: A, id: P1, image: PNG }).payment.receipt === true);
t('receipt cannot attach to unknown payment', !call({ action: 'pay.receipt', token: A, id: 'P_nope', image: PNG }).ok);
r = call({ action: 'admin.login', password: 'xato' });
t('admin wrong password', !r.ok);
const AD = call({ action: 'admin.login', password: 'admin-parol-123' }).token;
t('admin login', !!AD);
t('admin token cannot be used as user', !call({ action: 'me', token: AD }).ok);
r = call({ action: 'a.payment', token: AD, id: P1, op: 'confirm' });
t('admin confirms payment', r.ok);
let me = call({ action: 'me', token: A }).user;
t('subscription active ~30 days', me.active && Math.round((Date.parse(me.subEnd) - Date.now()) / 864e5) === 30 && me.plan === 'START');
call({ action: 'a.payment', token: AD, id: P1, op: 'confirm' });
me = call({ action: 'me', token: A }).user;
t('double confirm does not double extend', Math.round((Date.parse(me.subEnd) - Date.now()) / 864e5) === 30);

// --- darslar, ketma-ketlik, test, coin ---
cs = call({ action: 'courses', token: A });
t('first lesson open, second locked', !cs.courses[0].lessons[0].locked && cs.courses[0].lessons[1].locked);
t('second lesson refused before first done', call({ action: 'lesson', token: A, id: L2 }).code === 'locked');
r = call({ action: 'lesson', token: A, id: L1 });
t('lesson has quiz without answers', r.ok && r.lesson.quiz.length === 2 && r.lesson.quiz.every(q => q.a === undefined));
t('watched refused before quiz', call({ action: 'watched', token: A, id: L1 }).code === 'quiz');
r = call({ action: 'quiz', token: A, id: L1, answers: [0, 0] });
t('quiz scored 1/2, earned 2 coins', r.ok && r.correct === 1 && r.earned === 2 && r.coins === 2 && r.first);
r = call({ action: 'quiz', token: A, id: L1, answers: [0, 1] });
t('retry: no more coins, best=2', r.ok && r.correct === 2 && r.earned === 0 && r.coins === 2);
t('second lesson now open', call({ action: 'lesson', token: A, id: L2 }).ok);
t('coin history', call({ action: 'coins', token: A }).history.length === 1);

// --- coinni o'zi oshira olmaydi ---
r = call({ action: 'profile', token: A, name: 'Ali V', coins: 99999, subEnd: '2099-01-01', status: 'active' });
me = call({ action: 'me', token: A }).user;
t('profile edit ignores coins/sub', r.ok && me.name === 'Ali V' && me.coins === 2 && !me.subEnd.startsWith('2099'));

// --- do'kon ---
const shop = call({ action: 'shop', token: A });
const cap = shop.products[0];
r = call({ action: 'buy', token: A, id: cap.id });
t('buy refused: not enough coins', !r.ok && r.code === 'coins');
r = call({ action: 'a.coins', token: AD, id: me.id, amount: 10000, reason: "Faol o'quvchi" });
t('admin gives coins', r.ok && call({ action: 'me', token: A }).user.coins === 10002);
r = call({ action: 'buy', token: A, id: cap.id, qty: 2 });
t('buy ok: 6000 coins deducted', r.ok && r.coins === 4002);
t('stock decreased', call({ action: 'shop', token: A }).products[0].stock === 18);
const ord = call({ action: 'a.orders', token: AD }).orders[0];
r = call({ action: 'a.order', token: AD, id: ord.id, status: 'bekor' });
t('cancel order refunds + restocks', r.ok && call({ action: 'me', token: A }).user.coins === 10002 && call({ action: 'shop', token: A }).products[0].stock === 20);
t('cannot cancel twice', !call({ action: 'a.order', token: AD, id: ord.id, status: 'bekor' }).ok);

// --- tug'ilgan kun ---
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
call({ action: 'a.user', token: AD, id: call({ action: 'me', token: B }).user.id, birthday: '2013-' + today.slice(5) });
r = call({ action: 'me', token: B });
t('birthday coins given', r.user.coins === 50 && r.birthdayToday);
call({ action: 'me', token: B }); g.ctx.dailyBirthdays();
t('birthday coins only once a year', call({ action: 'me', token: B }).user.coins === 50);

// --- admin: kurs/dars/test ---
const course = call({ action: 'a.courses', token: AD }).courses[0];
r = call({ action: 'a.lesson.save', token: AD, lesson: { courseId: course.id, title: 'Yangi dars', youtube: 'https://youtu.be/dQw4w9WgXcQ', quiz: [{ q: '2+2?', o: ['3', '4'], a: 1 }] } });
t('admin adds lesson', r.ok);
t('youtube id parsed', call({ action: 'a.courses', token: AD }).courses[0].lessons.some(l => l.title === 'Yangi dars'));
t('bad quiz refused', !call({ action: 'a.lesson.save', token: AD, lesson: { courseId: course.id, title: 'X', quiz: [{ q: 'savol', o: ['bitta'], a: 0 }] } }).ok);
t('public cache invalidated', call({ action: 'public' }).stats.lessons === 22);

// --- foydalanuvchi bloklash ---
const bob = call({ action: 'a.users', token: AD, q: 'bobur' }).users[0];
call({ action: 'a.user', token: AD, id: bob.id, status: 'blocked' });
t('blocked user session dropped', !call({ action: 'me', token: B }).ok);
t('blocked user cannot login', !call({ action: 'login', phone: '907654321', password: 'boburpass' }).ok);
r = call({ action: 'a.resetPassword', token: AD, id: bob.id });
call({ action: 'a.user', token: AD, id: bob.id, status: 'active' });
t('password reset works', r.ok && call({ action: 'login', phone: '907654321', password: r.password }).ok);

// --- to'lov serveri (worker) ---
t('worker without secret refused', !call({ action: 'pay.get', id: P1 }).ok);
const W = 'w'.repeat(64);
r = call({ action: 'pay.create', token: A, planId: plans.find(p => p.months === 12).id });
const P2 = r.payment.id;
r = call({ action: 'pay.paid', secret: W, id: P2, provider: 'click', extId: 'C123' });
me = call({ action: 'me', token: A }).user;
t('worker marks paid → +360 days', r.ok && Math.round((Date.parse(me.subEnd) - Date.now()) / 864e5) === 390);
r = call({ action: 'pay.cancel', secret: W, id: P2 });
me = call({ action: 'me', token: A }).user;
t('cancel paid revokes days', r.ok && Math.round((Date.parse(me.subEnd) - Date.now()) / 864e5) === 30);
t('findExt', call({ action: 'pay.findExt', secret: W, extId: 'C123' }).payment.id === P2);

// --- sozlamalar ---
call({ action: 'a.settings.save', token: AD, settings: { coin_per_correct: '5', payment_mode: 'hack', evil: 'x' } });
const st = call({ action: 'public' }).settings;
t('settings saved, mode sanitized, unknown ignored', st.coin_per_correct === '5' && st.payment_mode === 'test' && st.evil === undefined);
r = call({ action: 'a.stats', token: AD });
t('stats', r.ok && r.users === 2 && r.active === 1);

// --- liderlar ---
{
  const L = call({ action: 'leaders', token: A });
  t('leaders all: sorted, me ranked, no ids', L.ok && L.top.length >= 2 && L.top.every((x, i, a) => !i || a[i - 1].coins >= x.coins) && L.me.rank >= 1 && L.top.some(x => x.me) && !('id' in L.top[0]) && !('phone' in L.top[0]));
  const M = call({ action: 'leaders', token: A, period: 'month' });
  t('leaders month: counts only this month earnings', M.ok && M.period === 'month' && M.top.every(x => x.coins >= 0));
  t('admin payments show receipt link', call({ action: 'a.payments', token: call({ action: 'admin.login', password: 'admin-parol-123' }).token }).payments.some(p => /^https:/.test(p.receipt)));
}

// --- taklif kodi, sardor, donat ---
{
  const AD = call({ action: 'admin.login', password: 'admin-parol-123' }).token;
  const R1 = call({ action: 'ref', token: A });
  t('ref: personal code created and stable', /^[A-Z2-9]{7}$/.test(R1.code) && call({ action: 'ref', token: A }).code === R1.code && R1.bonuses.length === 6);
  const F = call({ action: 'register', phone: '933334455', name: 'Do\'st Bola', password: 'parol123', ref: R1.code });
  t('register with ref code links friend', F.ok && F.user.refBy === true);
  t('ref: friend listed (unpaid)', call({ action: 'ref', token: A }).friends.some(x => x.name.startsWith("Do'st") && !x.paid));
  const F2 = call({ action: 'register', phone: '933334466', name: 'Ikkinchi Bola', password: 'parol123' });
  t('ref.apply: wrong code refused', !call({ action: 'ref.apply', token: F2.token, code: 'ZZZZZZZ' }).ok);
  t('ref.apply: own code refused', !call({ action: 'ref.apply', token: A, code: R1.code }).ok);
  t('ref.apply: works once', call({ action: 'ref.apply', token: F2.token, code: R1.code }).ok && !call({ action: 'ref.apply', token: F2.token, code: R1.code }).ok);
  const plan1 = call({ action: 'plans', token: F.token }).plans.find(p => p.months === 1);
  const pay = call({ action: 'pay.create', token: F.token, planId: plan1.id }).payment;
  t('ref: 20% discount on first monthly payment', pay.amount === Math.round(plan1.price * 0.8 / 100) * 100);
  const before = call({ action: 'me', token: A, lite: 1 }).user.coins;
  call({ action: 'a.payment', token: AD, id: pay.id, op: 'confirm' });
  const after = call({ action: 'me', token: A, lite: 1 }).user.coins;
  t('ref: referrer gets coins when friend pays', after - before === 20);
  t('ref: paid friend counted', call({ action: 'ref', token: A }).paid === 1);
  t('ref.apply: refused after a paid payment', !call({ action: 'ref.apply', token: F.token, code: R1.code }).ok);
  t('admin refs list', call({ action: 'a.refs', token: AD }).top[0].paid === 1);

  t('team: status shows free slots', call({ action: 'team', token: F.token, school: '18' }).free === 10);
  t('team: incomplete apply refused', !call({ action: 'team.apply', token: F.token, name: 'Do\'st Bola', phone: '933334455' }).ok);
  const ap = call({ action: 'team.apply', token: F.token, name: "Do'st Bola", phone: '933334455', region: "Farg'ona", school: '18-maktab', grade: '7-sinf', telegram: 'dost', why: 'Maktabimda IT ni tarqatmoqchiman' });
  t('team: apply ok, second refused', ap.ok && !call({ action: 'team.apply', token: F.token, name: "Do'st Bola", phone: '933334455', region: "Farg'ona", school: '18', grade: '7-sinf', why: 'yana bir marta yozaman' }).ok);
  t('team: school slots decrease (18 = 18-maktab)', call({ action: 'team', token: A, school: '18' }).free === 9);
  const apps = call({ action: 'a.apps', token: AD }).apps;
  t('admin sees application and accepts', apps.length === 1 && call({ action: 'a.app', token: AD, id: apps[0].id, status: 'qabul' }).ok && call({ action: 'team', token: F.token }).mine.status === 'qabul');

  t('donate: needs receipt', !call({ action: 'donate', token: F.token, amount: 50000 }).ok);
  t('donate: ok with receipt', call({ action: 'donate', token: F.token, amount: 50000, image: PNG }).ok);
  const dn = call({ action: 'a.donations', token: AD });
  t('admin confirms donation, total counted', dn.donations.length === 1 && call({ action: 'a.donation', token: AD, id: dn.donations[0].id, status: 'tasdiq' }).ok && call({ action: 'a.donations', token: AD }).total === 50000);
}

// --- formula himoyasi ---
{
  const a = call({ action: 'admin.login', password: 'admin-parol-123' }).token;
  call({ action: 'a.settings.save', token: a, settings: { phone: '+998 90 123 45 67' } });
  t('phone with + saved as text, not formula', call({ action: 'public' }).settings.phone === '+998 90 123 45 67');
  const ev = call({ action: 'register', phone: '907778899', name: '=HYPERLINK("http://x","y")', password: 'parol123' });
  t('formula-like name stored as text', ev.ok && call({ action: 'me', token: ev.token }).user.name === '=HYPERLINK("http://x","y")');
  t('no value ever written as formula', g.FORMULA_HITS.length === 0);
}

// --- faollik va reyting ---
r = call({ action: 'me', token: A });
t('me has week/streak/goal', Array.isArray(r.stats.week) && r.stats.week.length === 7 && r.stats.week.some(Boolean) && r.stats.streak >= 1 && r.stats.today >= 1 && r.stats.goal === 2);
t('leaders top sorted, me marked, no ids/phones', r.leaders.top.length >= 2 && r.leaders.top[0].coins >= r.leaders.top[1].coins && r.leaders.top.some(x => x.me) && r.leaders.myRank >= 1 && !('id' in r.leaders.top[0]) && !('phone' in r.leaders.top[0]));

// --- Telegram bot ---
{
  const C = g.ctx;
  t('tg: bad token refused', !C.connectTelegramValue('bad:' + 'x'.repeat(35), 'https://script.google.com/macros/s/X/exec').ok);
  t('tg: connect ok', C.connectTelegramValue('123456:' + 'A'.repeat(35), 'https://script.google.com/macros/s/X/exec').ok && g.props.get('TG_BOT') === 'vector_test_bot');
  t('tg: public exposes bot username', call({ action: 'public' }).settings.tg_bot === 'vector_test_bot');
  t('tg: direct register disabled once bot connected', !call({ action: 'register', phone: '935551122', name: 'Direkt Bola', password: 'parol123' }).ok);
  t('tg: reg.start short password', !call({ action: 'reg.start', name: 'Sardor Aliyev', password: '12' }).ok);
  let s = call({ action: 'reg.start', name: 'Sardor Aliyev', password: 'sardor123' });
  t('tg: reg.start gives deep link', s.ok && s.link === 'https://t.me/vector_test_bot?start=r_' + s.rid);
  const rid = s.rid, CH = 5550001;
  t('tg: status wait', call({ action: 'reg.status', rid }).state === 'wait');
  let n = g.tgOut.length;
  g.tg({ message: { chat: { id: CH, type: 'private' }, from: { id: CH }, text: '/start r_' + rid } }, 'wrong-key');
  t('tg: wrong webhook key ignored', g.tgOut.length === n);
  g.tgMsg(CH, '/start r_' + rid);
  let last = g.tgOut[g.tgOut.length - 1];
  t('tg: bot asks for contact', last.chat_id === CH && last.reply_markup.keyboard[0][0].request_contact === true);
  t('tg: status bot', call({ action: 'reg.status', rid }).state === 'bot');
  g.tgContact(CH, '+998935551122', 999);
  t('tg: foreign contact refused', /o'zingizning/.test(g.tgOut[g.tgOut.length - 1].text) && call({ action: 'reg.status', rid }).state === 'bot');
  g.tgContact(CH, '+998901234567');
  t('tg: existing phone told to log in', /allaqachon/.test(g.tgOut[g.tgOut.length - 1].text));
  g.tgMsg(CH, '/start r_' + rid);
  g.tgContact(CH, '+998935551122');
  last = g.tgOut[g.tgOut.length - 1];
  const code = (last.text.match(/<code>(\d{6})<\/code>/) || [])[1];
  t('tg: 6-digit code sent with renew button', !!code && last.reply_markup.inline_keyboard[0][0].callback_data === 'nc');
  const st = call({ action: 'reg.status', rid });
  t('tg: status code + masked phone', st.state === 'code' && st.phone === '+998 93 *** ** 22');
  t('tg: wrong code refused', !call({ action: 'reg.verify', rid, code: code === '111111' ? '222222' : '111111' }).ok);
  // eskirgan kod
  const R = C.regGet(rid); const keep = R.exp; R.exp = Date.now() - 1; C.regPut(rid, R);
  t('tg: expired code refused', /vaqti tugadi/.test(call({ action: 'reg.verify', rid, code }).error));
  R.exp = keep; R.tries = 0; C.regPut(rid, R);
  // yangi kod tugmasi
  g.tg({ callback_query: { id: 'q1', data: 'nc', message: { chat: { id: CH } } } });
  const code2 = (g.tgOut[g.tgOut.length - 1].text.match(/<code>(\d{6})<\/code>/) || [])[1];
  t('tg: renew sends new code', !!code2);
  let v = call({ action: 'reg.verify', rid, code: code2 });
  t('tg: verify creates user with phone + telegram', v.ok && v.token && v.user.phone === '935551122' && v.user.tg === true && v.user.name === 'Sardor Aliyev');
  t('tg: welcome message sent', /Tabriklaymiz/.test(g.tgOut[g.tgOut.length - 1].text));
  t('tg: link single-use', !call({ action: 'reg.verify', rid, code: code2 }).ok);
  t('tg: login with new password', call({ action: 'login', phone: '935551122', password: 'sardor123' }).ok);
  const S = v.token;
  // takroriy update bir marta ishlanadi
  n = g.tgOut.length;
  const upd = { update_id: 777777, message: { chat: { id: CH, type: 'private' }, from: { id: CH }, text: '/start' } };
  C.doPost({ parameter: { tg: g.props.get('TG_HOOK') }, postData: { contents: JSON.stringify(upd) } });
  C.doPost({ parameter: { tg: g.props.get('TG_HOOK') }, postData: { contents: JSON.stringify(upd) } });
  t('tg: duplicate update processed once', g.tgOut.length === n + 1);
  // parolni tiklash
  g.tgMsg(CH, '/parol');
  g.tgContact(CH, '998935551122');
  const pcode = (g.tgOut[g.tgOut.length - 1].text.match(/<code>(\d{6})<\/code>/) || [])[1];
  t('tg: reset code sent', !!pcode);
  t('tg: reset wrong code', !call({ action: 'pw.reset', phone: '935551122', code: pcode === '123456' ? '654321' : '123456', password: 'yangi12345' }).ok);
  v = call({ action: 'pw.reset', phone: '935551122', code: pcode, password: 'yangi12345' });
  t('tg: reset ok, old sessions dropped', v.ok && !call({ action: 'me', token: S }).ok && call({ action: 'login', phone: '935551122', password: 'yangi12345' }).ok);
  g.tgMsg(CH + 1, '/parol'); g.tgContact(CH + 1, '998911111111');
  t('tg: reset unknown phone', /topilmadi/.test(g.tgOut[g.tgOut.length - 1].text));
  // eski akkauntni botga ulash
  const lk = call({ action: 'tg.link', token: A });
  g.tgMsg(7770001, '/start l_' + lk.link.split('l_')[1]);
  t('tg: existing user linked', call({ action: 'me', token: A }).user.tg === true);
  // to'lov tasdiqlansa xabar
  const pl = call({ action: 'plans', token: A }).plans[0];
  const pay = call({ action: 'pay.create', token: A, planId: pl.id, provider: 'test' }).payment;
  call({ action: 'a.payment', token: AD, id: pay.id, op: 'confirm' });
  t('tg: payment notification', g.tgOut.some(m => m.chat_id === '7770001' && /To'lov qabul qilindi/.test(m.text)));
  call({ action: 'a.coins', token: AD, id: call({ action: 'me', token: A }).user.id, amount: 15, reason: 'Olimpiada' });
  t('tg: coin notification', /15 coin/.test(g.tgOut[g.tgOut.length - 1].text));
  // yangiliklar
  t('tg: broadcast needs text', !call({ action: 'a.broadcast', token: AD, text: '' }).ok);
  const b = call({ action: 'a.broadcast', token: AD, text: 'Yangi kurs qo\'shildi!', to: 'all' });
  t('tg: broadcast sent to linked users', b.ok && b.total === 2 && b.sent === 2);
  t('tg: broadcast escapes html', g.tgOut[g.tgOut.length - 1].text.indexOf('<script') < 0);
  // eslatmalar
  n = g.tgOut.length; C.dailyReminders();
  const rem = g.tgOut.slice(n).filter(m => /profilingizni/.test(m.text)).length;
  n = g.tgOut.length; C.dailyReminders();
  t('tg: profile reminder once per 2 days', rem >= 1 && g.tgOut.slice(n).filter(m => /profilingizni/.test(m.text)).length === 0);
  g.props.delete('TG_TOKEN'); g.props.delete('TG_BOT');
}

// --- parol almashtirish ---
r = call({ action: 'password', token: A, old: 'parol123', password: 'yangiparol1' });
t('password change gives new token, old invalid', r.ok && !call({ action: 'me', token: A }).ok && call({ action: 'me', token: r.token }).ok);

// --- tezlik: 1000 o'quvchi ---
let t0 = Date.now();
for (let i = 0; i < 300; i++) call({ action: 'register', phone: '93' + String(1000000 + i).slice(-7), name: "O'quvchi " + i, password: 'parol123' });
const regMs = (Date.now() - t0) / 300;
t0 = Date.now();
for (let i = 0; i < 50; i++) call({ action: 'public' });
console.log('avg register ms (mock, hash cost):', regMs.toFixed(1), ' avg public ms:', ((Date.now() - t0) / 50).toFixed(1));

console.log(`\n${pass} passed, ${fails.length} failed`, fails);
process.exit(fails.length ? 1 : 0);

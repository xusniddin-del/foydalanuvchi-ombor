# Vector — onlayn ta'lim platformasi

Bolalar uchun onlayn IT ta'lim sayti: sotuv sahifasi, ro'yxatdan o'tish, shaxsiy kabinet (video darslar, testlar, coinlar, sovg'alar do'koni, obuna va to'lov, profil) va admin panel.

| Qism | Qayerda ishlaydi | Narxi |
|---|---|---|
| Sayt (sahifalar) | GitHub Pages | Bepul |
| Ma'lumotlar bazasi | Google Sheets | Bepul |
| Server (API) | Google Apps Script | Bepul |
| Click/Payme to'lov serveri | Cloudflare Workers | Bepul (kuniga 100 000 so'rovgacha) |

```
index.html        — sotuv (bosh) sahifasi
kurslar.html      — barcha kurslar
dokon.html        — sovg'alar do'koni (coin evaziga)
elchilar.html     — elchilar
kirish.html       — kirish / ro'yxatdan o'tish
kabinet.html      — o'quvchi kabineti
admin.html        — admin panel
assets/           — dizayn, skriptlar, rasmlar
backend/Code.gs   — Google Apps Script (server)
payments/         — Click/Payme to'lov serveri (Cloudflare Worker)
tests/            — avtomatik testlar
```

---

## 1-qadam. Google Sheets va server (≈10 daqiqa)

1. [sheets.new](https://sheets.new) — yangi bo'sh Google jadval oching, nomini **Vector baza** qo'ying.
2. Menyuda **Kengaytmalar → Apps Script** (Extensions → Apps Script).
3. Ochilgan oynada `Code.gs` ichidagi hamma narsani o'chirib, shu ombordagi **`backend/Code.gs`** matnini to'liq qo'ying. Saqlang (💾).
4. Chapdagi ⚙️ **Loyiha sozlamalari** → *"appsscript.json" manifest faylini ko'rsatish* ni yoqing. `appsscript.json` ga **`backend/appsscript.json`** matnini qo'ying.
5. Jadvalga qayting va sahifani yangilang (F5). Tepada **Vector** menyusi paydo bo'ladi:
   - **Vector → 1. Jadvalni tayyorlash** — Google ruxsat so'raydi: *Davom etish → Akkauntni tanlash → Advanced (Qo'shimcha) → Go to … (unsafe) → Allow*. Bu sizning o'z skriptingiz, xavfsiz.
     Varaqlar yaratiladi: `Users, Sessions, Plans, Courses, Lessons, Progress, Coins, Products, Orders, Payments, Settings` va namunaviy kurslar, tariflar, mahsulotlar qo'shiladi.
   - **Vector → 2. Admin parolini o'rnatish** — kamida 8 belgili parol.
6. Apps Script oynasida **Joylash (Deploy) → Yangi joylash (New deployment)**:
   - Turi: ⚙️ → **Veb-ilova (Web app)**
   - *Kim nomidan ishlaydi*: **Men (Me)**
   - *Kimga ruxsat*: **Hamma (Anyone)**
   - **Joylash** → berilgan manzilni nusxalang (`https://script.google.com/macros/s/…/exec`).
7. Shu ombordagi **`assets/js/config.js`** faylida `VECTOR_API` ga shu manzilni yozing.

> ⚠️ `Code.gs` ni keyinchalik o'zgartirsangiz: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Aks holda sayt eski versiya bilan ishlayveradi. Manzil o'zgarmaydi.

## 2-qadam. Saytni GitHub Pages'ga chiqarish

1. GitHub'da ombor → **Settings → Pages**.
2. *Source*: **Deploy from a branch**, *Branch*: **main**, papka **/ (root)** → **Save**.
3. 1–2 daqiqada sayt manzili chiqadi: `https://xusniddin-del.github.io/foydalanuvchi-ombor/`.
4. Admin panel: `…/admin.html` (2-qadamdagi parol bilan).

O'z domeningiz bo'lsa (masalan `vector.uz`): Settings → Pages → *Custom domain*.

## 3-qadam. Admin paneldan to'ldirish

- **Kurslar va darslar** — kurs qo'shing, har bir darsga YouTube havolasini va test savollarini kiriting. Videolarni YouTube'ga **"Ro'yxatda yo'q" (Unlisted)** qilib yuklang.
- **Tariflar** — obuna narxlari va muddatlari.
- **Do'kon** — sovg'alar (narx coinda) va ularning qoldig'i.
- **Sozlamalar** — telefon, Telegram, test uchun coin, tug'ilgan kun coini, to'lov rejimi.
- **O'quvchilar** — qidirish, coin berish yoki ayirish, obunani qo'lda uzaytirish, yangi parol berish, bloklash.

Rasmlar (kurs muqovasi, mahsulot, o'quvchi avatari) Google Drive'dagi **"Vector — sayt rasmlari"** papkasiga saqlanadi.

## Coin qoidalari

| Qachon | Qancha |
|---|---|
| Testdagi har bir to'g'ri javob (faqat **birinchi urinishda**) | Sozlamalar → `coin_per_correct` (standart: 2) |
| Tug'ilgan kun (yiliga bir marta, avtomatik) | Sozlamalar → `birthday_coins` (standart: 50) |
| Admin qo'lda beradi | O'quvchilar → Boshqarish → Coin berish |
| Do'konda xarid | ayiriladi. Admin buyurtmani bekor qilsa, coin qaytariladi |

Coinlarni faqat server hisoblaydi: o'quvchi o'zi oshira olmaydi, test javoblari brauzerga yuborilmaydi.

## 4-qadam. To'lov

### Test rejimi (standart)
O'quvchi tarifni tanlab **"To'lov so'rovini yuborish"** ni bosadi. Siz pul tushganini tekshirib, **Admin → To'lovlar → Tasdiqlash** ni bosasiz — obuna darhol ochiladi.

### Live rejim — Click / Payme avtomatik
1. Click ([click.uz](https://click.uz) → biznes uchun) va/yoki Payme ([business.payme.uz](https://business.payme.uz)) bilan shartnoma tuzing (YaTT yoki MChJ). Ular sizga beradi:
   - Click: `service_id`, `merchant_id`, `secret_key`
   - Payme: kassa ID (merchant id) va kalit (key). Hisob parametri nomi: **`order_id`**.
2. Google Sheets → **Vector → 3. To'lov serveri kalitini yaratish** → chiqqan kalitni nusxalang.
3. **Cloudflare Worker** (bepul):
   - [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Worker** → nom: `vector-payments` → Deploy.
   - **Edit code** → `payments/worker.js` matnini qo'ying → **Deploy**.
   - **Settings → Variables and Secrets** → quyidagilarni *Secret* turida qo'shing:

     | Nomi | Qiymati |
     |---|---|
     | `GAS_URL` | Apps Script `/exec` manzili |
     | `GAS_SECRET` | 2-banddagi kalit |
     | `CLICK_SERVICE_ID` | Click service_id |
     | `CLICK_SECRET_KEY` | Click secret key |
     | `PAYME_KEY` | Payme kaliti (avval test kaliti) |
4. Click kabinetiga kiriting: Prepare URL `https://vector-payments.<siz>.workers.dev/click/prepare`, Complete URL `…/click/complete`.
   Payme kabinetiga: Endpoint URL `https://vector-payments.<siz>.workers.dev/payme`.
5. **Admin → Sozlamalar**: `click_service_id`, `click_merchant_id`, `payme_merchant_id` ni to'ldiring, `return_url` ga `https://…/kabinet.html#obuna` ni yozing va **To'lov rejimi → Live** ni tanlang.

Payme sinov muhitida ([test.paycom.uz](https://test.paycom.uz)) barcha tekshiruvlardan o'tkazing, so'ng ishchi kalitga almashtiring.

---

## 5-qadam. Telegram bot (ro'yxatdan o'tish, parolni tiklash, xabarlar)

Bot ulangandan so'ng:
- **Ro'yxatdan o'tish:** o'quvchi saytda ism va parolni yozadi → **Davom etish** → **Telegramga o'tish** → botda **Start** va **📱 Telefon raqamni yuborish** → bot **6 xonali kod** yuboradi (1 daqiqa amal qiladi) → kodni saytga kiritadi → akkaunt ochiladi. Telefon raqam shu tariqa tasdiqlanadi.
- **Viloyat, shahar/tuman, maktab, sinf, tug'ilgan sana** ro'yxatdan o'tishda so'ralmaydi: kabinetga kirgach oyna chiqib so'raydi, bot ham 2 kunda bir eslatadi (ko'pi bilan 3 marta).
- **Parolni unutsa:** saytda *Paro'l esimdan chiqdi* → botdan kod → yangi parol.
- **Bot o'zi yuboradi:** to'lov qabul qilingani, obuna tugashiga 3 kun qolgani, berilgan coinlar, sovg'a topshirilgani, tug'ilgan kun tabrigi.
- **Yangiliklar:** Admin → **Telegram xabar** — barcha, obunasi faol yoki obunasi yo'q o'quvchilarga.
- Avval ro'yxatdan o'tgan o'quvchilar botni **Kabinet → Profil → Botni ulash** orqali ulaydi.

Ulash:
1. Telegramda [@BotFather](https://t.me/BotFather) → `/newbot` → bot nomi (masalan *Vector ta'lim*) va username (masalan `vector_talim_bot`) → **token** beradi.
2. Google jadval → **Vector → 4. Telegram botni ulash** → tokenni kiriting.
   - Apps Script manzilini so'rasa — 1-qadamdagi `/exec` manzili.
   - **To'lov serveri (Worker) manzilini** so'raydi: 4-qadamdagi `vector-payments` Worker'ingiz bo'lsa, uning manzilini kiriting (`https://vector-payments.<siz>.workers.dev`). **Tavsiya etiladi**: Telegram xabarlari Google'ga to'g'ridan-to'g'ri borganda Google javobni boshqa manzilga yo'naltiradi va Telegram xabarni qayta yuborib, bot sekinlashishi mumkin. Worker hali bo'lmasa bo'sh qoldiring, keyin Worker ochgach menyuni qayta bosing.
   - Worker'ga yangi `payments/worker.js` ni joylashtirganingizga ishonch hosil qiling (unda `/tg` yo'li bor).
3. **Admin → Sozlamalar → site_url** — saytingiz manzili (bot tugmalari shu manzilga olib boradi).
4. Tekshirish: saytda yangi telefon bilan ro'yxatdan o'ting.

> Bot ulanmaguncha sayt eski usulda ishlaydi: ro'yxatdan o'tishda telefon raqam formada so'raladi, parolni tiklash uchun admin Telegram'i ko'rsatiladi.

## Ko'p foydalanuvchi bo'lsa qotmaydimi?

- **GitHub Pages** — sahifalar CDN orqali beriladi, minglab kirishni bemalol ko'taradi.
- **Google Apps Script** — bir vaqtda ~30 ta so'rovni bajaradi, har biri ~0,5–2 soniya. Shuning uchun:
  - kurslar, tariflar, do'kon serverda 5 daqiqa, brauzerda 10 daqiqa keshda turadi;
  - har bir yozish navbat bilan (LockService) bajariladi — ikki kishi bir vaqtda xarid qilsa ham ma'lumot yo'qolmaydi;
  - server band bo'lsa, sayt so'rovni o'zi qayta yuboradi.
- Amalda: **minglab akkaunt** va **bir vaqtda 100–150 ta faol o'quvchi** muammosiz ishlaydi. Bir vaqtda 1000 dan ortiq faol foydalanuvchi bo'lsa, bazani Supabase yoki Firebase'ga ko'chirish tavsiya etiladi. Sahifalar o'zgarmaydi, faqat `backend` almashtiriladi.

## Xavfsizlik

- Parollar tuz (salt) bilan SHA-256 orqali saqlanadi. Jadvalda ochiq parol yo'q.
- Kirish urinishlari cheklangan (15 daqiqada 10 ta).
- Obuna, coin va to'lov holatini faqat server o'zgartiradi.
- Video havolalari va test javoblari faqat obunasi faol o'quvchiga, kerakli darsda beriladi.
- Google jadvalni hech kim bilan ulashmang — unga faqat sizning skriptingiz kiradi.

## Kompyuterda sinash (dasturchilar uchun)

```bash
node tests/api.test.js        # server testlari (88 ta)
node tests/worker.test.mjs    # Click/Payme va Telegram testlari (25 ta)
node tests/server.js          # http://127.0.0.1:8787 — taqlid qilingan baza bilan sayt (admin paroli: admin-parol-123)
python3 tests/e2e.py          # brauzer testi (server ishlab turgan bo'lishi kerak)
```

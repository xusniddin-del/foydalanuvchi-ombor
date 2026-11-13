"""Brauzer testi: avval `node tests/server.js`, so'ng `python3 tests/e2e.py [skrinshot_papka]`"""
import re, sys, os
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8787"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/vector-shots"
os.makedirs(OUT, exist_ok=True)
res, errors = [], []
def check(n, c): res.append((n, bool(c))); print(("PASS " if c else "FAIL ") + n)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1366, "height": 860})
    ctx.route(re.compile(r"https://(fonts\.googleapis|fonts\.gstatic|www\.youtube-nocookie).*"), lambda r: r.abort())
    for u in ["/kurslar.html", "/dokon.html", "/elchilar.html"]:
        pg0 = ctx.new_page(); pg0.on("pageerror", lambda e: errors.append(str(e))); pg0.goto(BASE + u); pg0.wait_for_timeout(700)
        check("page renders: " + u, pg0.locator(".card").count() >= 3); pg0.close()
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "ERR_FAILED" not in m.text and "net::" not in m.text and errors.append(m.text))

    # bosh sahifa
    pg.goto(BASE + "/"); pg.wait_for_timeout(1200)
    check("landing: 3 top courses from API", pg.locator(".course").count() == 3)
    check("landing: 3 monthly plans", pg.locator(".plan").count() == 3 and "69.000" in pg.locator("#planList").inner_text())
    pg.click("#toggle [data-p='12']"); pg.wait_for_timeout(500)
    check("landing: yearly toggle shows yearly prices", "708.000" in pg.locator("#planList").inner_text() and "828.000" in pg.locator("#planList").inner_text())
    check("landing: language switch mounted", pg.locator("[data-vector-lang]").count() >= 1)
    pg.screenshot(path=f"{OUT}/01-landing.png", full_page=True)

    # ro'yxatdan o'tish
    pg.click(".vh-right >> text=Ro'yxatdan o'tish"); pg.wait_for_timeout(500)
    f = pg.locator("#register")
    check("auth: only register form visible", f.is_visible() and not pg.locator("#login").is_visible())
    f.locator("[name=name]").fill("Ali Valiyev"); f.locator("[name=phone]").fill("901234567")
    f.locator("[name=birthday]").fill("2014-03-05"); f.locator("[name=grade]").select_option("5-sinf")
    f.locator("[name=region]").select_option(index=5); f.locator("[name=city]").fill("Marg'ilon"); f.locator("[name=school]").fill("18")
    f.locator("[name=password]").fill("parol123"); f.locator("[name=password2]").fill("parol124")
    pg.screenshot(path=f"{OUT}/02-register.png")
    f.locator("[type=submit]").click(); pg.wait_for_timeout(400)
    check("register: password mismatch shown", "bir xil emas" in f.locator(".msg[role=alert]").inner_text())
    f.locator("[name=password2]").fill("parol123"); f.locator("[type=submit]").click()
    pg.wait_for_url("**/kabinet.html**", timeout=8000); pg.wait_for_timeout(1500)
    check("cabinet: profile name top-left", "Ali Valiyev" in pg.locator("#meSide").inner_text())
    check("cabinet: no-subscription notice", pg.locator(".notice").count() >= 1)
    pg.screenshot(path=f"{OUT}/03-kabinet.png", full_page=True)

    # kurs yopiq
    pg.goto(BASE + "/kabinet.html#kurslar"); pg.wait_for_timeout(1000)
    pg.locator(".ccard").first.click(); pg.wait_for_timeout(1000)
    check("course: lessons locked without sub", pg.locator(".lesson.locked").count() == 3)

    # obuna so'rovi (test rejim)
    pg.goto(BASE + "/kabinet.html#obuna"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{OUT}/04-obuna.png", full_page=True)
    pg.click("[data-pv=test]"); pg.wait_for_timeout(1500)
    check("payment request listed as pending", pg.locator("text=Kutilmoqda").count() >= 1)

    # admin tasdiqlaydi
    a = ctx.new_page(); a.on("pageerror", lambda e: errors.append("ADMIN " + str(e)))
    a.goto(BASE + "/admin.html"); a.wait_for_timeout(600)
    a.fill("[name=p]", "xato"); a.click("[type=submit]"); a.wait_for_timeout(500)
    check("admin wrong password refused", a.locator(".err").is_visible())
    a.fill("[name=p]", "admin-parol-123"); a.click("[type=submit]"); a.wait_for_timeout(1500)
    check("admin dashboard", a.locator(".stat").count() == 6)
    a.screenshot(path=f"{OUT}/05-admin.png", full_page=True)
    a.goto(BASE + "/admin.html#tolovlar"); a.wait_for_timeout(1200)
    a.locator("[data-ok]").first.click(); a.wait_for_timeout(300); a.locator(".modal [data-ok]").click(); a.wait_for_timeout(1500)
    check("admin confirmed payment", a.locator("[data-ok]").count() == 0)
    # admin coin beradi
    a.goto(BASE + "/admin.html#oquvchilar"); a.wait_for_timeout(1200)
    a.screenshot(path=f"{OUT}/06-admin-users.png")
    a.locator("[data-u]").first.click(); a.wait_for_timeout(300)
    a.fill("#fc [name=amount]", "5000"); a.fill("#fc [name=reason]", "Faol o'quvchi"); a.click("#fc button"); a.wait_for_timeout(1200)
    # admin darsga video + test qo'shadi
    a.goto(BASE + "/admin.html#kurslar"); a.wait_for_timeout(1200)
    a.locator("[data-el]").first.click(); a.wait_for_timeout(400)
    a.fill(".modal [name=youtube]", "https://youtu.be/dQw4w9WgXcQ")
    a.screenshot(path=f"{OUT}/07-admin-lesson.png")
    a.click("#sv"); a.wait_for_timeout(1200)
    check("admin lesson saved with video", "Video bor" in a.locator(".lrow").first.inner_text())

    # o'quvchi darsni ko'radi va test ishlaydi
    pg.goto(BASE + "/kabinet.html#kurslar"); pg.wait_for_timeout(1000)
    pg.locator(".ccard").first.click(); pg.wait_for_timeout(1000)
    check("course: first lesson open after payment", pg.locator("a.lesson").count() == 1 and pg.locator(".lesson.locked").count() == 2)
    pg.locator("a.lesson").first.click(); pg.wait_for_timeout(1200)
    check("lesson: video iframe", pg.locator(".video iframe").count() == 1)
    pg.locator("input[name=q0][value='0']").check(); pg.locator("input[name=q1][value='1']").check()
    pg.screenshot(path=f"{OUT}/08-dars.png", full_page=True)
    pg.click("#quiz [type=submit]"); pg.wait_for_timeout(1500)
    check("quiz: 2/2 and +4 coins", "2/2" in pg.locator(".modal").inner_text() and "+4 coin" in pg.locator(".modal").inner_text())
    pg.screenshot(path=f"{OUT}/09-quiz-result.png")
    pg.keyboard.press("Escape")

    # do'kon
    pg.goto(BASE + "/kabinet.html#dokon"); pg.wait_for_timeout(1200)
    check("shop: balance 5 004", "5 004" in pg.locator(".page-h").inner_text())
    pg.locator("[data-buy]").first.click(); pg.wait_for_timeout(300); pg.click("#okBuy"); pg.wait_for_timeout(1500)
    check("shop: bought, coins 2 004", "2 004" in pg.locator("#pills").inner_text() and pg.locator("text=Tayyorlanmoqda").count() == 1)
    pg.screenshot(path=f"{OUT}/10-dokon.png", full_page=True)

    # coin tarixi va profil
    pg.goto(BASE + "/kabinet.html#coin"); pg.wait_for_timeout(1000)
    check("coin history has 3 rows", pg.locator(".list-row").count() == 3)
    pg.goto(BASE + "/kabinet.html#profil"); pg.wait_for_timeout(1000)
    pg.click("[data-t=dark]"); pg.wait_for_timeout(600)
    check("dark theme applied", pg.evaluate("document.documentElement.dataset.theme") == "dark")
    pg.screenshot(path=f"{OUT}/11-profil-dark.png", full_page=True)
    pg.click("[data-t=light]"); pg.wait_for_timeout(400)

    # telefon ko'rinishi
    m = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True)
    m.route(re.compile(r"https://(fonts\.googleapis|fonts\.gstatic|www\.youtube-nocookie).*"), lambda r: r.abort())
    mp = m.new_page()
    mp.goto(BASE + "/"); mp.wait_for_timeout(1200)
    check("mobile: no horizontal scroll", mp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    mp.screenshot(path=f"{OUT}/12-mobile-landing.png")
    tok = pg.evaluate("localStorage.getItem('vx_token')")
    mp.evaluate(f"localStorage.setItem('vx_token', '{tok}')")
    mp.goto(BASE + "/kabinet.html#bosh"); mp.wait_for_timeout(1500)
    check("mobile cabinet: no horizontal scroll", mp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    mp.screenshot(path=f"{OUT}/13-mobile-kabinet.png")

    # chiqish
    pg.goto(BASE + "/kabinet.html#profil"); pg.wait_for_timeout(900)
    pg.click("#logout2"); pg.wait_for_timeout(1200)
    check("logout → landing, token cleared", pg.evaluate("localStorage.getItem('vx_token')") is None)
    b.close()

print("\nJS ERRORS:", errors[:10])
print("%d/%d passed" % (sum(c for _, c in res), len(res)))

package uz.vectortalim.sms

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telephony.SubscriptionManager
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

/** 3 ta ekran: Ulash, Asosiy, Sozlamalar (AndroidX'siz) */
class MainActivity : Activity() {
    private val ui = Handler(Looper.getMainLooper())
    private var screen = "main"
    private val refresh = object : Runnable {
        override fun run() { if (screen == "main" && Prefs.token(this@MainActivity).isNotEmpty()) render(); ui.postDelayed(this, 3000) }
    }

    // ranglar
    private val BRAND = Color.parseColor("#1E63F0")
    private val BG = Color.parseColor("#F3F6FC")
    private val INK = Color.parseColor("#0F172A")
    private val MUTED = Color.parseColor("#64748B")
    private val GREEN = Color.parseColor("#16A34A")
    private val RED = Color.parseColor("#DC2626")
    private val ORANGE = Color.parseColor("#EA7A0C")

    override fun attachBaseContext(base: Context) { super.attachBaseContext(Lang.wrap(base)) }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (Build.VERSION.SDK_INT >= 21) { window.statusBarColor = BRAND }
        Notif.channels(this)
        render()
    }

    override fun onResume() {
        super.onResume()
        ui.removeCallbacks(refresh); ui.postDelayed(refresh, 3000)
        Thread { Updates.maybeCheck(this) ; ui.post { if (screen == "main") render() } }.start()
        render()
    }

    override fun onPause() { super.onPause(); ui.removeCallbacks(refresh) }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (screen == "settings") { screen = "main"; render() } else @Suppress("DEPRECATION") super.onBackPressed()
    }

    // ---------- yordamchilar ----------
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun round(color: Int, r: Int, stroke: Int = 0): GradientDrawable = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(r).toFloat(); if (stroke != 0) setStroke(dp(1), stroke)
    }
    private fun lp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, top: Int = 0) =
        LinearLayout.LayoutParams(w, h).apply { topMargin = dp(top) }
    private fun col(pad: Int = 0) = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(pad), dp(pad), dp(pad), dp(pad)) }
    private fun row() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    private fun text(s: CharSequence, size: Float = 15f, color: Int = INK, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color); if (bold) typeface = Typeface.DEFAULT_BOLD; setLineSpacing(0f, 1.15f)
    }
    private fun card() = col(16).apply { background = round(Color.WHITE, 18, Color.parseColor("#E2E8F0")) }
    private fun button(s: String, primary: Boolean = true, onClick: () -> Unit) = Button(this).apply {
        text = s; isAllCaps = false; textSize = 16f; typeface = Typeface.DEFAULT_BOLD
        setTextColor(if (primary) Color.WHITE else BRAND)
        background = round(if (primary) BRAND else Color.parseColor("#EAF1FF"), 14)
        setPadding(dp(16), dp(12), dp(16), dp(12))
        setOnClickListener { onClick() }
    }
    private fun page(content: View) {
        val sv = ScrollView(this).apply { setBackgroundColor(BG); isFillViewport = true }
        sv.addView(content)
        setContentView(sv)
    }
    private fun header(title: String, right: View? = null): View {
        val r = row().apply { setPadding(dp(4), dp(4), dp(4), dp(8)) }
        r.addView(text(title, 22f, INK, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (right != null) r.addView(right)
        return r
    }
    private fun safeBlock(): View {
        val c = card().apply { background = round(Color.parseColor("#F0F7FF"), 18, Color.parseColor("#BFD5FF")) }
        c.addView(text(getString(R.string.safe_title), 16f, INK, true))
        listOf(R.string.safe_1, R.string.safe_2, R.string.safe_3, R.string.safe_4, R.string.safe_5, R.string.safe_6).forEach {
            c.addView(text("✓  " + getString(it), 14f, Color.parseColor("#334155")), lp(top = 6))
        }
        return c
    }

    private fun render() {
        if (Prefs.token(this).isEmpty()) { screen = "pair"; renderPair() }
        else if (screen == "settings") renderSettings()
        else { screen = "main"; renderMain() }
    }

    // ---------- 1. Ulash ----------
    private fun renderPair() {
        val root = col(20)
        root.addView(header(getString(R.string.pair_title)))
        root.addView(text(getString(R.string.pair_sub), 15f, MUTED), lp(top = 4))
        val code = EditText(this).apply {
            hint = getString(R.string.pair_hint); inputType = InputType.TYPE_CLASS_NUMBER; filters = arrayOf(InputFilter.LengthFilter(6))
            textSize = 30f; gravity = Gravity.CENTER; letterSpacing = 0.35f; typeface = Typeface.MONOSPACE; setTextColor(INK)
            background = round(Color.WHITE, 16, Color.parseColor("#CBD5E1")); setPadding(dp(12), dp(14), dp(12), dp(14))
        }
        root.addView(code, lp(top = 18))
        val msg = text("", 14f, RED)
        root.addView(msg, lp(top = 8))
        lateinit var btn: Button
        btn = button(getString(R.string.pair_btn)) {
            val v = code.text.toString().trim()
            if (v.length != 6) { msg.text = getString(R.string.pair_bad); return@button }
            btn.isEnabled = false; btn.text = getString(R.string.pair_wait); msg.text = ""
            Thread {
                val res = try { Api.call(Api.base(this).put("action", "sms.pair").put("code", v)) } catch (e: Exception) { null }
                ui.post {
                    btn.isEnabled = true; btn.text = getString(R.string.pair_btn)
                    if (res == null) { msg.text = getString(R.string.err_net); return@post }
                    if (!res.optBoolean("ok")) { msg.text = res.optString("error"); return@post }
                    Prefs.setToken(this, res.optString("dt"))
                    res.optJSONObject("cfg")?.let { Prefs.setCfg(this, it) }
                    screen = "main"
                    askPermissions()
                    turnOn()
                    render()
                    if (!Prefs.batteryShown(this)) { Prefs.setBatteryShown(this); batteryDialog() }
                }
            }.start()
        }
        root.addView(btn, lp(top = 10))
        root.addView(safeBlock(), lp(top = 22))
        page(root)
    }

    // ---------- 2. Asosiy ----------
    private fun renderMain() {
        val on = Prefs.isOn(this)
        val root = col(20)
        val gear = text("⚙", 24f, INK).apply { setPadding(dp(10), dp(4), dp(10), dp(4)); setOnClickListener { screen = "settings"; render() } }
        root.addView(header(getString(R.string.app_name), gear))

        // holat
        val cfg = Prefs.cfg(this)
        val (stText, stColor) = when {
            !on -> Pair("", MUTED)
            !Prefs.online(this) -> Pair(getString(R.string.offline), ORANGE)
            Prefs.srvPaused(this) -> Pair(getString(R.string.paused_srv), ORANGE)
            !Hours.inHours(cfg) -> Pair(getString(R.string.out_hours, Hours.from(cfg), Hours.to(cfg)), MUTED)
            Prefs.limitReached(this) -> Pair(getString(R.string.limit_reached), ORANGE)
            else -> Pair(getString(R.string.online), GREEN)
        }
        if (stText.isNotEmpty()) root.addView(text("● " + stText, 14f, stColor, true), lp(top = 2))

        if (!hasSms()) {
            val c = card().apply { background = round(Color.parseColor("#FEF2F2"), 18, Color.parseColor("#FECACA")) }
            c.addView(text(getString(R.string.perm_need), 15f, RED, true))
            c.addView(button(getString(R.string.perm_btn)) { askPermissions() }, lp(top = 10))
            root.addView(c, lp(top = 12))
        }

        // katta tugma
        val size = dp(210)
        val big = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(if (on) GREEN else Color.parseColor("#CBD5E1")); setStroke(dp(10), if (on) Color.parseColor("#BBF7D0") else Color.parseColor("#E2E8F0")) }
            isClickable = true
            setOnClickListener { if (Prefs.isOn(this@MainActivity)) turnOff() else turnOn(); render() }
        }
        big.addView(text(getString(if (on) R.string.on else R.string.off), 34f, Color.WHITE, true).apply { gravity = Gravity.CENTER })
        big.addView(text(getString(if (on) R.string.tap_off else R.string.tap_on), 13f, Color.WHITE).apply { gravity = Gravity.CENTER })
        val wrap = LinearLayout(this).apply { gravity = Gravity.CENTER; setPadding(0, dp(22), 0, dp(22)) }
        wrap.addView(big, LinearLayout.LayoutParams(size, size))
        root.addView(wrap)

        // raqamlar
        val stats = row()
        val s1 = card(); s1.addView(text(getString(R.string.today), 13f, MUTED)); s1.addView(text(Prefs.today(this).toString(), 26f, INK, true))
        val s2 = card(); s2.addView(text(getString(R.string.sim), 13f, MUTED)); s2.addView(text(Prefs.simName(this).ifEmpty { getString(R.string.sim_default) }, 17f, INK, true).apply { maxLines = 2 })
        stats.addView(s1, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply { rightMargin = dp(6) })
        stats.addView(s2, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply { leftMargin = dp(6) })
        root.addView(stats)

        Updates.available(this)?.let { root.addView(updateCard(it), lp(top = 12)) }

        // oxirgi SMS'lar
        val lc = card()
        lc.addView(text(getString(R.string.recent), 16f, INK, true))
        val log = Prefs.log(this)
        if (log.length() == 0) lc.addView(text(getString(R.string.empty), 14f, MUTED), lp(top = 8))
        for (i in 0 until log.length()) {
            val o = log.getJSONObject(i)
            val st = o.optString("st")
            val (label, color) = when (st) {
                "sent" -> Pair(getString(R.string.st_sent), BRAND)
                "delivered" -> Pair(getString(R.string.st_delivered), GREEN)
                "failed" -> Pair(getString(R.string.st_failed), RED)
                else -> Pair(getString(R.string.st_sending), ORANGE)
            }
            val r = row().apply { setPadding(0, dp(10), 0, 0) }
            r.addView(text(o.optString("phone"), 15f, INK), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            r.addView(text(Hours.clock(o.optLong("t")) + "  ", 13f, MUTED))
            r.addView(text(label, 13f, color, true))
            lc.addView(r)
        }
        root.addView(lc, lp(top = 12))
        page(root)
    }

    private fun updateCard(o: JSONObject): View {
        val c = card().apply { background = round(Color.parseColor("#FFF7ED"), 18, Color.parseColor("#FED7AA")) }
        c.addView(text("🎉 " + getString(R.string.upd_title) + " · " + o.optString("name"), 16f, INK, true))
        val n = Updates.notes(this, o)
        if (n.isNotEmpty()) c.addView(text(n, 14f, Color.parseColor("#7C2D12")), lp(top = 6))
        c.addView(text(getString(R.string.upd_note), 12.5f, MUTED), lp(top = 4))
        c.addView(button(getString(R.string.upd_btn)) { openUrl(Updates.url(o)) }, lp(top = 10))
        return c
    }

    // ---------- 3. Sozlamalar ----------
    private fun renderSettings() {
        val root = col(20)
        val back = text("‹ " + getString(R.string.back), 16f, BRAND, true).apply { setPadding(dp(4), dp(4), dp(10), dp(4)); setOnClickListener { screen = "main"; render() } }
        root.addView(back)
        root.addView(header(getString(R.string.settings)))

        // til
        val lang = card(); lang.addView(text(getString(R.string.lang), 13f, MUTED))
        val lr = row()
        listOf("uz" to "O'zbekcha", "ru" to "Русский").forEach { (k, t) ->
            val sel = Prefs.lang(this) == k
            val b = button(t, sel) { Prefs.setLang(this, k); Notif.channels(this); recreate() }
            lr.addView(b, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(dp(3), dp(8), dp(3), 0) })
        }
        lang.addView(lr); root.addView(lang, lp(top = 8))

        // SIM
        val sim = card(); sim.addView(text(getString(R.string.sim_choose), 13f, MUTED))
        val opts = ArrayList<Pair<Int, String>>()
        opts.add(Pair(-1, getString(R.string.sim_default)))
        if (Build.VERSION.SDK_INT >= 22 && checkSelfPermissionCompat(Manifest.permission.READ_PHONE_STATE)) {
            try {
                @Suppress("MissingPermission")
                val subs = SubscriptionManager.from(this).activeSubscriptionInfoList
                subs?.forEach { s -> opts.add(Pair(s.subscriptionId, "SIM " + (s.simSlotIndex + 1) + " · " + (s.carrierName ?: s.displayName ?: ""))) }
            } catch (e: Exception) { }
        }
        opts.forEach { (id, name) ->
            val sel = Prefs.subId(this) == id
            sim.addView(text((if (sel) "◉  " else "○  ") + name, 16f, if (sel) BRAND else INK, sel).apply {
                setPadding(0, dp(12), 0, dp(4)); setOnClickListener { Prefs.setSub(this@MainActivity, id, if (id >= 0) name.substringAfter("· ") else ""); render() }
            })
        }
        if (Build.VERSION.SDK_INT >= 23 && !checkSelfPermissionCompat(Manifest.permission.READ_PHONE_STATE)) {
            sim.addView(button("2 SIM", false) { requestPermissions(arrayOf(Manifest.permission.READ_PHONE_STATE), 2) }, lp(top = 10))
        }
        root.addView(sim, lp(top = 12))

        // ish vaqti
        val cfg = Prefs.cfg(this)
        val hrs = card()
        hrs.addView(text(getString(R.string.hours), 13f, MUTED))
        hrs.addView(text(Hours.from(cfg) + " – " + Hours.to(cfg), 20f, INK, true), lp(top = 4))
        hrs.addView(text(getString(R.string.limit) + ": " + cfg.optInt("limit", 100) + "   ·   " + getString(R.string.gap) + ": " + cfg.optInt("gap", 25) + " " + getString(R.string.sec), 14f, INK), lp(top = 4))
        hrs.addView(text(getString(R.string.hours_note), 13f, MUTED), lp(top = 6))
        root.addView(hrs, lp(top = 12))

        // batareya
        val bat = card(); bat.addView(text(getString(R.string.battery), 13f, MUTED))
        bat.addView(button(getString(R.string.battery_btn), false) { batteryDialog() }, lp(top = 8))
        root.addView(bat, lp(top = 12))

        // uzish va versiya
        val un = card()
        un.addView(button(getString(R.string.unpair), false) {
            AlertDialog.Builder(this).setMessage(getString(R.string.unpair_q))
                .setPositiveButton(getString(R.string.yes)) { _, _ -> turnOff(); Prefs.unpairLocal(this); screen = "pair"; render() }
                .setNegativeButton(getString(R.string.no), null).show()
        })
        un.addView(text(getString(R.string.version) + " " + App.verName(this), 13f, MUTED).apply { gravity = Gravity.CENTER }, lp(top = 12))
        root.addView(un, lp(top = 12))
        page(root)
    }

    // ---------- amallar ----------
    private fun checkSelfPermissionCompat(p: String) = Build.VERSION.SDK_INT < 23 || checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED
    private fun hasSms() = checkSelfPermissionCompat(Manifest.permission.SEND_SMS)

    private fun askPermissions() {
        if (Build.VERSION.SDK_INT < 23) return
        val need = ArrayList<String>()
        if (!hasSms()) need.add(Manifest.permission.SEND_SMS)
        if (Build.VERSION.SDK_INT >= 33 && !checkSelfPermissionCompat(Manifest.permission.POST_NOTIFICATIONS)) need.add(Manifest.permission.POST_NOTIFICATIONS)
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, res: IntArray) {
        super.onRequestPermissionsResult(code, perms, res)
        if (code == 1 && !hasSms()) AlertDialog.Builder(this).setMessage(getString(R.string.perm_denied)).setPositiveButton(getString(R.string.ok), null).show()
        if (Prefs.isOn(this) && hasSms()) SmsService.start(this)
        render()
    }

    private fun turnOn() {
        Prefs.setOn(this, true)
        if (!hasSms()) { askPermissions(); return }
        try { SmsService.start(this) } catch (e: Exception) { }
    }

    private fun turnOff() {
        Prefs.setOn(this, false)
        SmsService.stop(this)
    }

    private fun openUrl(u: String) { try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) } catch (e: Exception) { } }

    private fun batteryDialog() {
        val m = Build.MANUFACTURER.lowercase()
        val txt = when {
            m.contains("xiaomi") || m.contains("redmi") || m.contains("poco") -> R.string.bat_xiaomi
            m.contains("samsung") -> R.string.bat_samsung
            m.contains("huawei") || m.contains("honor") -> R.string.bat_huawei
            else -> R.string.bat_generic
        }
        AlertDialog.Builder(this).setTitle(getString(R.string.bat_title)).setMessage(getString(txt))
            .setPositiveButton(getString(R.string.bat_open)) { _, _ ->
                val i = if (Build.VERSION.SDK_INT >= 23) Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                        else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                try { startActivity(i) } catch (e: Exception) { try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (e2: Exception) { } }
            }
            .setNegativeButton(getString(R.string.ok), null).show()
    }
}

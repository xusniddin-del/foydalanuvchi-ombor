package uz.vectortalim.sms

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.telephony.TelephonyManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Server va yangilanish manzillari */
object Cfg {
    const val API = "https://script.google.com/macros/s/AKfycbyXEyhb12KQZCvmSVu5xBO7Ae_mIiMSlDG5HBoHbM36h3I9db0qcvV8e-zn0pIlMk1lLA/exec"
    const val VERSION_URL = "https://vectortalim.uz/sms-version.json"
    const val DOWNLOAD_URL = "https://vectortalim.uz/Vector-SMS.apk"
    val TZ: TimeZone = TimeZone.getTimeZone("Asia/Tashkent")
}

/** Sozlamalar va holat (SharedPreferences). Yangilanganda saqlanib qoladi. */
object Prefs {
    private val lock = Any()
    private fun sp(c: Context) = c.applicationContext.getSharedPreferences("vsms", Context.MODE_PRIVATE)

    fun token(c: Context): String = sp(c).getString("dt", "") ?: ""
    fun setToken(c: Context, t: String) { sp(c).edit().putString("dt", t).apply() }

    fun isOn(c: Context): Boolean = sp(c).getBoolean("on", false)
    fun setOn(c: Context, v: Boolean) { sp(c).edit().putBoolean("on", v).putInt("failStreak", 0).apply() }

    fun lang(c: Context): String = sp(c).getString("lang", "uz") ?: "uz"
    fun setLang(c: Context, v: String) { sp(c).edit().putString("lang", v).apply() }

    fun subId(c: Context): Int = sp(c).getInt("subId", -1)
    fun setSub(c: Context, id: Int, name: String) { sp(c).edit().putInt("subId", id).putString("simName", name).apply() }
    fun simName(c: Context): String {
        val saved = sp(c).getString("simName", "") ?: ""
        if (saved.isNotEmpty() && subId(c) >= 0) return saved
        return try {
            val tm = c.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            tm.networkOperatorName ?: ""
        } catch (e: Exception) { "" }
    }

    fun cfg(c: Context): JSONObject = try { JSONObject(sp(c).getString("cfg", "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
    fun setCfg(c: Context, o: JSONObject) { sp(c).edit().putString("cfg", o.toString()).apply() }

    fun lastOk(c: Context): Long = sp(c).getLong("lastOk", 0L)
    fun online(c: Context): Boolean = sp(c).getBoolean("online", false)
    fun setOnline(c: Context, ok: Boolean, res: JSONObject?) {
        val e = sp(c).edit().putBoolean("online", ok)
        if (ok) e.putLong("lastOk", System.currentTimeMillis())
        if (res != null) e.putBoolean("srvPaused", res.optBoolean("paused", false)).putBoolean("limitReached", res.optBoolean("limitReached", false))
        e.apply()
    }
    fun srvPaused(c: Context) = sp(c).getBoolean("srvPaused", false)
    fun limitReached(c: Context) = sp(c).getBoolean("limitReached", false)

    fun lastSendAt(c: Context): Long = sp(c).getLong("lastSendAt", 0L)
    fun setLastSendAt(c: Context, t: Long) { sp(c).edit().putLong("lastSendAt", t).apply() }

    fun failStreak(c: Context): Int = sp(c).getInt("failStreak", 0)
    fun setFailStreak(c: Context, n: Int) { sp(c).edit().putInt("failStreak", n).apply() }

    fun nextReq(c: Context): Int = synchronized(lock) { val n = sp(c).getInt("req", 1) + 1; sp(c).edit().putInt("req", if (n > 1_000_000) 1 else n).apply(); n }

    // bugun yuborilganlar
    fun today(c: Context): Int { val s = sp(c); return if (s.getString("day", "") == Hours.day()) s.getInt("dayN", 0) else 0 }
    fun incToday(c: Context) = synchronized(lock) { val n = today(c) + 1; sp(c).edit().putString("day", Hours.day()).putInt("dayN", n).apply() }

    // oxirgi 10 ta SMS
    fun log(c: Context): JSONArray = try { JSONArray(sp(c).getString("log", "[]") ?: "[]") } catch (e: Exception) { JSONArray() }
    fun logPut(c: Context, id: String, phone: String?, st: String) = synchronized(lock) {
        val old = log(c); val out = JSONArray(); var found: JSONObject? = null
        for (i in 0 until old.length()) { val o = old.getJSONObject(i); if (o.optString("id") == id) found = o }
        if (found != null) {
            for (i in 0 until old.length()) { val o = old.getJSONObject(i); if (o.optString("id") == id) o.put("st", st).put("t", System.currentTimeMillis()); out.put(o) }
        } else {
            out.put(JSONObject().put("id", id).put("phone", phone ?: "").put("st", st).put("t", System.currentTimeMillis()))
            for (i in 0 until minOf(old.length(), 9)) out.put(old.getJSONObject(i))
        }
        sp(c).edit().putString("log", out.toString()).apply()
    }

    // serverga hali yetmagan hisobotlar (internet bo'lmasa saqlanadi)
    fun reports(c: Context): JSONArray = try { JSONArray(sp(c).getString("rep", "[]") ?: "[]") } catch (e: Exception) { JSONArray() }
    fun addReport(c: Context, o: JSONObject) = synchronized(lock) { val a = reports(c); a.put(o); sp(c).edit().putString("rep", a.toString()).apply() }
    fun dropReports(c: Context, n: Int) = synchronized(lock) {
        val a = reports(c); val out = JSONArray()
        for (i in n until a.length()) out.put(a.get(i))
        sp(c).edit().putString("rep", out.toString()).apply()
    }

    // yangilanish
    fun upd(c: Context): JSONObject = try { JSONObject(sp(c).getString("upd", "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
    fun setUpd(c: Context, o: JSONObject) { sp(c).edit().putString("upd", o.toString()).putLong("updAt", System.currentTimeMillis()).apply() }
    fun updAt(c: Context): Long = sp(c).getLong("updAt", 0L)
    fun notifiedUpd(c: Context): Long = sp(c).getLong("updN", 0L)
    fun setNotifiedUpd(c: Context, v: Long) { sp(c).edit().putLong("updN", v).apply() }

    fun batteryShown(c: Context) = sp(c).getBoolean("bat", false)
    fun setBatteryShown(c: Context) { sp(c).edit().putBoolean("bat", true).apply() }

    fun unpairLocal(c: Context) { sp(c).edit().remove("dt").putBoolean("on", false).remove("rep").apply() }
}

/** Ish vaqti — Toshkent vaqti bilan */
object Hours {
    private fun fmt(p: String) = SimpleDateFormat(p, Locale.US).apply { timeZone = Cfg.TZ }
    fun day(): String = fmt("yyyy-MM-dd").format(Date())
    fun nowHm(): String = fmt("HH:mm").format(Date())
    fun from(c: JSONObject) = c.optString("from", "09:00")
    fun to(c: JSONObject) = c.optString("to", "21:00")
    fun inHours(c: JSONObject): Boolean {
        val t = nowHm(); val f = from(c); val e = to(c)
        return if (f <= e) t >= f && t < e else t >= f || t < e
    }
    fun clock(ms: Long): String = fmt("HH:mm").format(Date(ms))
}

/** Serverga so'rov (Apps Script POST → 302 → GET) */
object Api {
    @Throws(IOException::class)
    fun call(body: JSONObject): JSONObject {
        var conn = URL(Cfg.API).openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = false
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.connectTimeout = 20000
        conn.readTimeout = 45000
        conn.setRequestProperty("Content-Type", "text/plain;charset=utf-8")
        conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        var code = conn.responseCode
        var hops = 0
        while (code in 300..399 && hops < 5) {
            val loc = conn.getHeaderField("Location") ?: break
            conn.disconnect()
            conn = URL(loc).openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 20000
            conn.readTimeout = 45000
            code = conn.responseCode
            hops++
        }
        val stream = if (code < 400) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        conn.disconnect()
        return try { JSONObject(text) } catch (e: Exception) { throw IOException("bad json $code") }
    }

    @Throws(IOException::class)
    fun get(url: String): String {
        val conn = URL(url + (if (url.contains("?")) "&" else "?") + "t=" + System.currentTimeMillis()).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000
        conn.readTimeout = 20000
        val t = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        conn.disconnect()
        return t
    }

    fun base(c: Context): JSONObject = JSONObject()
        .put("dt", Prefs.token(c)).put("ver", App.verName(c)).put("model", Build.MANUFACTURER + " " + Build.MODEL).put("sim", Prefs.simName(c))
}

/** Tilni almashtirish: o'zbekcha asosiy (telefon tili ruscha bo'lsa ham) */
object Lang {
    fun wrap(base: Context): Context {
        val loc = Locale(Prefs.lang(base))
        Locale.setDefault(loc)
        val cfg = Configuration(base.resources.configuration)
        cfg.setLocale(loc)
        return base.createConfigurationContext(cfg)
    }
}

object App {
    fun verName(c: Context): String = try { c.packageManager.getPackageInfo(c.packageName, 0).versionName ?: "1.0" } catch (e: Exception) { "1.0" }
    fun verCode(c: Context): Long = try {
        val pi = c.packageManager.getPackageInfo(c.packageName, 0)
        if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong()
    } catch (e: Exception) { 1L }
}

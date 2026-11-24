package uz.vectortalim.sms

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.telephony.SmsManager
import org.json.JSONArray
import org.json.JSONObject

/**
 * Doimiy xizmat: ish vaqtida har 30 soniyada navbatni so'raydi, SMS'larni SIM kartadan yuboradi.
 * Ish vaqtidan tashqari har 15 daqiqada faqat «tirikman» (ping) deydi.
 */
class SmsService : Service() {
    private lateinit var thread: HandlerThread
    private lateinit var h: Handler
    private val tick = Runnable { loop() }

    override fun attachBaseContext(base: Context) { super.attachBaseContext(Lang.wrap(base)) }

    override fun onCreate() {
        super.onCreate()
        Notif.channels(this)
        thread = HandlerThread("vector-sms")
        thread.start()
        h = Handler(thread.looper)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startFg()
        if (!Prefs.isOn(this) || Prefs.token(this).isEmpty()) { stopSelf(); return START_NOT_STICKY }
        h.removeCallbacks(tick)
        h.post(tick)
        return START_STICKY
    }

    private fun startFg() {
        val n = Notif.running(this)
        if (Build.VERSION.SDK_INT >= 34) startForeground(Notif.ID_RUN, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(Notif.ID_RUN, n)
    }

    override fun onDestroy() {
        h.removeCallbacksAndMessages(null)
        thread.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun loop() {
        if (!Prefs.isOn(this) || Prefs.token(this).isEmpty()) { stopSelf(); return }
        var delay = 30_000L
        try {
            Reports.flush(this)
            Updates.maybeCheck(this)
            val inHours = Hours.inHours(Prefs.cfg(this))
            val res = Api.call(Api.base(this).put("action", "sms.pull").put("on", true).put("ping", !inHours))
            if (!res.optBoolean("ok")) {
                if (res.optString("code") == "unpaired") { Notif.alert(this, getString(R.string.app_name), getString(R.string.n_unpaired)); Prefs.unpairLocal(this); stopSelf(); return }
                Prefs.setOnline(this, false, null)
                delay = 60_000L
            } else {
                res.optJSONObject("cfg")?.let { Prefs.setCfg(this, it) }
                Prefs.setOnline(this, true, res)
                val items = res.optJSONArray("items")
                delay = if (items != null && items.length() > 0) {
                    sendAll(items)
                    1_000L
                } else if (Hours.inHours(Prefs.cfg(this)) && !res.optBoolean("paused")) 30_000L else 15 * 60_000L
            }
        } catch (e: Exception) {
            Prefs.setOnline(this, false, null)
            delay = 60_000L
        }
        Notif.update(this)
        if (Prefs.isOn(this)) h.postDelayed(tick, delay)
    }

    private fun sendAll(items: JSONArray) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vector-sms:send")
        wl.acquire(10 * 60_000L)
        try {
            for (i in 0 until items.length()) {
                if (!Prefs.isOn(this) || Prefs.failStreak(this) >= 3) {
                    // qolganlari serverda 10 daqiqadan keyin qaytadan navbatga tushadi
                    break
                }
                val o = items.getJSONObject(i)
                val gap = Prefs.cfg(this).optLong("gap", 25L).coerceIn(15L, 120L) * 1000L
                val wait = Prefs.lastSendAt(this) + gap - System.currentTimeMillis()
                if (wait > 0) Thread.sleep(wait)
                Sender.send(this, o.getString("id"), o.getString("phone"), o.getString("text"))
                Prefs.setLastSendAt(this, System.currentTimeMillis())
                Notif.update(this)
            }
        } finally {
            if (wl.isHeld) wl.release()
        }
    }

    companion object {
        fun start(c: Context) {
            val i = Intent(c, SmsService::class.java)
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
        }
        fun stop(c: Context) { c.stopService(Intent(c, SmsService::class.java)) }
    }
}

/** SMS'ni tanlangan SIM'dan yuborish */
object Sender {
    const val SENT = "uz.vectortalim.sms.SENT"
    const val DELIVERED = "uz.vectortalim.sms.DELIVERED"

    private fun manager(c: Context): SmsManager {
        val sub = Prefs.subId(c)
        return if (Build.VERSION.SDK_INT >= 31) {
            val m = c.getSystemService(SmsManager::class.java)
            if (sub >= 0) m.createForSubscriptionId(sub) else m
        } else if (sub >= 0 && Build.VERSION.SDK_INT >= 22) {
            @Suppress("DEPRECATION") SmsManager.getSmsManagerForSubscriptionId(sub)
        } else {
            @Suppress("DEPRECATION") SmsManager.getDefault()
        }
    }

    private fun pi(c: Context, action: String, id: String, part: Int, n: Int): PendingIntent {
        val i = Intent(c, SmsResultReceiver::class.java).setAction(action)
            .setData(Uri.parse("vsms://" + action + "/" + id + "/" + part)) // har bir PendingIntent alohida bo'lsin
            .putExtra("id", id).putExtra("part", part).putExtra("n", n)
        // yetkazish hisobotiga tizim «pdu» qo'shadi — shuning uchun MUTABLE (intent aniq komponentga yo'naltirilgan)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        return PendingIntent.getBroadcast(c, Prefs.nextReq(c), i, flags)
    }

    fun send(c: Context, id: String, phone: String, text: String) {
        Prefs.logPut(c, id, phone, "sending")
        try {
            val sm = manager(c)
            val parts = sm.divideMessage(text)
            val n = parts.size
            Tracker.start(id, n)
            if (n <= 1) {
                sm.sendTextMessage(phone, null, text, pi(c, SENT, id, 0, 1), pi(c, DELIVERED, id, 0, 1))
            } else {
                val sent = ArrayList<PendingIntent>()
                val deliv = ArrayList<PendingIntent>()
                for (k in 0 until n) { sent.add(pi(c, SENT, id, k, n)); deliv.add(pi(c, DELIVERED, id, k, n)) }
                sm.sendMultipartTextMessage(phone, null, parts, sent, deliv)
            }
        } catch (e: Exception) {
            Results.done(c, id, false, (e.javaClass.simpleName + ": " + (e.message ?: "")).take(180))
        }
    }
}

/** Ko'p qismli SMS: hamma qism yuborilgandagina «yuborildi» */
object Tracker {
    private class St(val n: Int) { var done = 0; var failed = false; var err = "" }
    private val map = HashMap<String, St>()
    fun start(id: String, n: Int) = synchronized(map) { map[id] = St(n) }
    /** null — hali hamma qism kelmadi; aks holda (ok, xato) */
    fun part(id: String, n: Int, ok: Boolean, err: String): Pair<Boolean, String>? = synchronized(map) {
        val s = map.getOrPut(id) { St(n) }
        s.done++
        if (!ok) { s.failed = true; s.err = err }
        if (s.done >= s.n) { map.remove(id); Pair(!s.failed, s.err) } else null
    }
}

object Results {
    fun done(c: Context, id: String, ok: Boolean, err: String) {
        Prefs.logPut(c, id, null, if (ok) "sent" else "failed")
        Prefs.addReport(c, JSONObject().put("id", id).put("status", if (ok) "sent" else "failed").put("error", err))
        if (ok) {
            Prefs.incToday(c)
            Prefs.setFailStreak(c, 0)
        } else {
            val n = Prefs.failStreak(c) + 1
            Prefs.setFailStreak(c, n)
            if (n >= 3) {
                // ketma-ket 3 xato: balans tugagan yoki SIM muammosi — to'xtaymiz
                Prefs.setOn(c, false)
                Prefs.setFailStreak(c, 3)
                val lc = Lang.wrap(c)
                Notif.alert(c, lc.getString(R.string.n_stopped_title), lc.getString(R.string.n_stopped))
                SmsService.stop(c)
            }
        }
    }
    fun delivered(c: Context, id: String) {
        Prefs.logPut(c, id, null, "delivered")
        Prefs.addReport(c, JSONObject().put("id", id).put("status", "delivered"))
    }
}

/** SMS natijasi (SENT / DELIVERED) */
class SmsResultReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val id = i.getStringExtra("id") ?: return
        val n = i.getIntExtra("n", 1)
        val part = i.getIntExtra("part", 0)
        when (i.action) {
            Sender.SENT -> {
                val ok = resultCode == Activity.RESULT_OK
                val r = Tracker.part(id, n, ok, if (ok) "" else errName(resultCode))
                if (r != null) Results.done(c, id, r.first, r.second)
            }
            Sender.DELIVERED -> if (part == n - 1 && resultCode == Activity.RESULT_OK) Results.delivered(c, id)
        }
        val pr = goAsync()
        Thread { try { Reports.flush(c) } catch (e: Exception) { } finally { pr.finish() } }.start()
    }

    private fun errName(code: Int): String = when (code) {
        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Umumiy xato (balans yoki operator)"
        SmsManager.RESULT_ERROR_RADIO_OFF -> "Aloqa o'chiq (parvoz rejimi?)"
        SmsManager.RESULT_ERROR_NULL_PDU -> "Xabar tuzilmadi"
        SmsManager.RESULT_ERROR_NO_SERVICE -> "Tarmoq yo'q"
        else -> "Xato kodi $code"
    }
}

/** Telefon qayta yoqilganda (yoki dastur yangilanganda) xizmat o'zi ishga tushadi */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (Prefs.isOn(c) && Prefs.token(c).isNotEmpty()) {
            try { SmsService.start(c) } catch (e: Exception) { }
        }
    }
}

/** Hisobotlarni serverga yuborish (internet bo'lmasa keyinroq) */
object Reports {
    private val lock = Any()
    fun flush(c: Context) = synchronized(lock) {
        if (Prefs.token(c).isEmpty()) return@synchronized
        var guard = 0
        while (guard++ < 5) {
            val all = Prefs.reports(c)
            if (all.length() == 0) return@synchronized
            val n = minOf(all.length(), 40)
            val items = JSONArray()
            for (k in 0 until n) items.put(all.get(k))
            val res = try { Api.call(Api.base(c).put("action", "sms.report").put("items", items)) } catch (e: Exception) { return@synchronized }
            if (res.optBoolean("ok") || res.optString("code") == "unpaired") Prefs.dropReports(c, n) else return@synchronized
        }
    }
}

/** Yangilanish: repo ildizidagi sms-version.json (6 soatda bir) */
object Updates {
    fun maybeCheck(c: Context, force: Boolean = false) {
        if (!force && System.currentTimeMillis() - Prefs.updAt(c) < 6 * 3600_000L) return
        try {
            val o = JSONObject(Api.get(Cfg.VERSION_URL))
            Prefs.setUpd(c, o)
            val code = o.optLong("code", 0L)
            if (code > App.verCode(c) && Prefs.notifiedUpd(c) != code) {
                Prefs.setNotifiedUpd(c, code)
                val lc = Lang.wrap(c)
                Notif.alert(c, lc.getString(R.string.upd_title) + " · " + o.optString("name"), notes(c, o))
            }
        } catch (e: Exception) { }
    }
    fun available(c: Context): JSONObject? { val o = Prefs.upd(c); return if (o.optLong("code", 0L) > App.verCode(c)) o else null }
    fun notes(c: Context, o: JSONObject): String = o.optJSONObject("notes")?.optString(Prefs.lang(c), "") ?: ""
    fun url(o: JSONObject): String = o.optString("url", Cfg.DOWNLOAD_URL).ifEmpty { Cfg.DOWNLOAD_URL }
}

/** Bildirishnomalar */
object Notif {
    const val ID_RUN = 1
    const val ID_ALERT = 2
    private const val CH_RUN = "run"
    private const val CH_ALERT = "alert"

    fun channels(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val lc = Lang.wrap(c)
        val nm = c.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_RUN, lc.getString(R.string.ch_service), NotificationManager.IMPORTANCE_LOW))
        nm.createNotificationChannel(NotificationChannel(CH_ALERT, lc.getString(R.string.ch_alerts), NotificationManager.IMPORTANCE_HIGH))
    }

    private fun builder(c: Context, ch: String): Notification.Builder =
        if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, ch) else @Suppress("DEPRECATION") Notification.Builder(c)

    private fun open(c: Context): PendingIntent {
        val i = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0))
    }

    fun running(c: Context): Notification {
        val lc = Lang.wrap(c)
        val n = Prefs.today(c)
        return builder(c, CH_RUN)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle(lc.getString(R.string.app_name))
            .setContentText(if (n > 0) lc.getString(R.string.n_running, n) else lc.getString(R.string.n_waiting))
            .setOngoing(true)
            .setContentIntent(open(c))
            .build()
    }

    fun update(c: Context) {
        if (!Prefs.isOn(c)) return
        try { (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID_RUN, running(c)) } catch (e: Exception) { }
    }

    fun alert(c: Context, title: String, text: String) {
        channels(c)
        val n = builder(c, CH_ALERT)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(open(c))
            .build()
        try { (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID_ALERT, n) } catch (e: Exception) { }
    }
}

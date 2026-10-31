package expo.modules.watchnetwork

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Keeps the watch polled while the app is in the background.
 *
 * React Native pauses JavaScript timers when the app is backgrounded, so the poll loop lives here and
 * delivers every result to JavaScript as an event. The JS side stays fully event driven and needs no
 * timers of its own while monitoring. Polling runs on a single thread with a fixed delay after each
 * request finishes, so requests can never overlap.
 *
 * The persistent notification is what Android requires for this and what tells the wearer that
 * monitoring is active. JS updates its text so it never claims a live connection that is down.
 */
class WatchMonitorService : Service() {
  private var executor: ScheduledExecutorService? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val url = intent?.getStringExtra(EXTRA_URL)
    if (url == null) {
      // Restarted by the system with no configuration: JS is not there to receive anything.
      stopSelf()
      return START_NOT_STICKY
    }
    val interval = intent.getLongExtra(EXTRA_INTERVAL, 1000L)
    val timeout = intent.getIntExtra(EXTRA_TIMEOUT, 3000)
    val title = intent.getStringExtra(EXTRA_TITLE) ?: "SafeFall AI"
    val text = intent.getStringExtra(EXTRA_TEXT) ?: ""

    enterForeground(title, text)
    acquireLocks()
    WatchLink.acquire(applicationContext)

    executor?.shutdownNow()
    executor = Executors.newSingleThreadScheduledExecutor().also { pool ->
      pool.scheduleWithFixedDelay({
        val result = WatchLink.get(url, timeout)
        try {
          listener?.invoke(result)
        } catch (_: Exception) {
          // A failed delivery must not cancel the scheduled task.
        }
      }, 0, interval, TimeUnit.MILLISECONDS)
    }
    isRunning = true
    return START_NOT_STICKY
  }

  private fun enterForeground(title: String, text: String) {
    createChannel()
    val notification = buildNotification(title, text)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(CHANNEL_ID, "Watch monitoring", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shown while SafeFall AI is reading your watch"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(title: String, text: String): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val tap = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setContentIntent(tap)
      .build()
  }

  private fun acquireLocks() {
    if (wakeLock == null) {
      val power = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "safefall:watch-monitor").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
    if (wifiLock == null) {
      val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF
      wifiLock = wifiManager.createWifiLock(mode, "safefall:watch-monitor").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
  }

  override fun onDestroy() {
    executor?.shutdownNow()
    executor = null
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    wifiLock?.let { if (it.isHeld) it.release() }
    wifiLock = null
    WatchLink.release(applicationContext)
    isRunning = false
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL_ID = "watch-monitoring"
    private const val NOTIFICATION_ID = 7301
    private const val EXTRA_URL = "url"
    private const val EXTRA_INTERVAL = "intervalMs"
    private const val EXTRA_TIMEOUT = "timeoutMs"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"

    @Volatile var isRunning = false
      private set

    @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

    fun start(context: Context, url: String, intervalMs: Long, timeoutMs: Int, title: String, text: String) {
      val intent = Intent(context, WatchMonitorService::class.java)
        .putExtra(EXTRA_URL, url)
        .putExtra(EXTRA_INTERVAL, intervalMs)
        .putExtra(EXTRA_TIMEOUT, timeoutMs)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, WatchMonitorService::class.java))
    }

    fun updateNotification(context: Context, title: String, text: String) {
      if (!isRunning) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(android.R.drawable.stat_notify_sync)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(
          context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
          },
        )
        .build()
      manager.notify(NOTIFICATION_ID, notification)
    }
  }
}

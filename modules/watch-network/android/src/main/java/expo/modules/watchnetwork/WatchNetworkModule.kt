package expo.modules.watchnetwork

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WatchNetworkModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WatchNetwork")

    Events("onPoll")

    OnCreate {
      WatchMonitorService.listener = { result -> sendEvent("onPoll", result) }
    }

    OnDestroy {
      WatchMonitorService.listener = null
    }

    /** One request for Test Connection. Holds the Wi-Fi network briefly if nothing else does. */
    AsyncFunction("fetchOnce") { url: String, timeoutMs: Int ->
      val owned = !WatchMonitorService.isRunning
      if (owned) {
        WatchLink.acquire(context)
        // requestNetwork reports the network asynchronously; give it a moment to arrive.
        Thread.sleep(300)
      }
      try {
        WatchLink.get(url, timeoutMs)
      } finally {
        if (owned) WatchLink.release(context)
      }
    }

    AsyncFunction("startMonitoring") { url: String, intervalMs: Double, timeoutMs: Int, title: String, text: String ->
      WatchMonitorService.start(context, url, intervalMs.toLong(), timeoutMs, title, text)
    }

    AsyncFunction("stopMonitoring") {
      WatchMonitorService.stop(context)
    }

    AsyncFunction("updateMonitoringNotification") { title: String, text: String ->
      WatchMonitorService.updateNotification(context, title, text)
    }

    AsyncFunction("getDiagnostics") {
      WatchLink.diagnostics(context)
    }

    AsyncFunction("openBatterySettings") {
      val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}

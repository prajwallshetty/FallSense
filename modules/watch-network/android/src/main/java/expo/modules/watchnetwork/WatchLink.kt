package expo.modules.watchnetwork

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.PowerManager
import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL

/**
 * Reaches the watch over the Wi-Fi network specifically.
 *
 * The watch hotspot has no internet, so Android keeps mobile data as the default network and an
 * ordinary socket to 192.168.4.1 can go out over cellular and fail. Holding a request for the Wi-Fi
 * network, and opening each watch connection on that Network object, routes only the watch traffic
 * over Wi-Fi. Everything else, including cloud sync, stays on the default network. This deliberately
 * does not use bindProcessToNetwork, which would push cloud traffic onto a network with no internet.
 */
object WatchLink {
  private const val MAX_BODY_BYTES = 4096

  @Volatile private var wifi: Network? = null
  private var callback: ConnectivityManager.NetworkCallback? = null

  @Synchronized
  fun acquire(context: Context) {
    if (callback != null) return
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val request = NetworkRequest.Builder()
      .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
      .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
      .build()
    val cb = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        wifi = network
      }

      override fun onLost(network: Network) {
        if (wifi == network) wifi = null
      }
    }
    cm.requestNetwork(request, cb)
    callback = cb
  }

  @Synchronized
  fun release(context: Context) {
    val cb = callback ?: return
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    try {
      cm.unregisterNetworkCallback(cb)
    } catch (_: IllegalArgumentException) {
      // Already unregistered.
    }
    callback = null
    wifi = null
  }

  /** One GET. Never throws: every failure comes back as a result the app can show. */
  fun get(urlString: String, timeoutMs: Int): Map<String, Any?> {
    val started = System.nanoTime()
    val network = wifi
    val via = if (network != null) "wifi" else "default"
    fun latency() = (System.nanoTime() - started) / 1_000_000.0
    fun failure(kind: String, detail: String) =
      mapOf("ok" to false, "error" to kind, "detail" to detail, "via" to via, "latencyMs" to latency())

    var connection: HttpURLConnection? = null
    try {
      val url = URL(urlString)
      connection = (if (network != null) network.openConnection(url) else url.openConnection()) as HttpURLConnection
      connection.connectTimeout = timeoutMs
      connection.readTimeout = timeoutMs
      connection.requestMethod = "GET"
      connection.useCaches = false
      connection.instanceFollowRedirects = false
      connection.setRequestProperty("Connection", "close")

      val status = connection.responseCode
      if (status !in 200..299) return failure("http", "The watch answered with status $status")
      val body = connection.inputStream.use { stream ->
        val buffer = ByteArray(MAX_BODY_BYTES)
        var total = 0
        while (total < buffer.size) {
          val n = stream.read(buffer, total, buffer.size - total)
          if (n < 0) break
          total += n
        }
        String(buffer, 0, total, Charsets.UTF_8)
      }
      return mapOf("ok" to true, "status" to status, "body" to body, "via" to via, "latencyMs" to latency())
    } catch (e: SocketTimeoutException) {
      return failure("timeout", "The watch did not respond in time")
    } catch (e: IOException) {
      return failure("network", e.message ?: "Could not reach the watch")
    } catch (e: IllegalArgumentException) {
      return failure("network", e.message ?: "Invalid watch address")
    } finally {
      connection?.disconnect()
    }
  }

  private fun transportName(caps: NetworkCapabilities?): String = when {
    caps == null -> "none"
    caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
    else -> "other"
  }

  /**
   * What the phone's routing looks like right now. This reports the conditions on this device, which
   * vary by manufacturer, instead of assuming Wi-Fi and mobile data work together.
   */
  fun diagnostics(context: Context): Map<String, Any?> {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val active = cm.activeNetwork
    val defaultCaps = active?.let { cm.getNetworkCapabilities(it) }
    val wifiNetwork = wifi
    val wifiCaps = wifiNetwork?.let { cm.getNetworkCapabilities(it) }
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return mapOf(
      "wifiNetworkHeld" to (wifiNetwork != null),
      "wifiHasInternet" to (wifiCaps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ?: false),
      "defaultTransport" to transportName(defaultCaps),
      "defaultHasInternet" to (defaultCaps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ?: false),
      "ignoringBatteryOptimizations" to power.isIgnoringBatteryOptimizations(context.packageName),
      "sdkInt" to Build.VERSION.SDK_INT,
    )
  }
}

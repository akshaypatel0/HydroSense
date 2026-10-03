package com.hydrosense.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * HydroSense Native Android Container with:
 * 1. Hardware-accelerated offline WebView
 * 2. Full Bluetooth Classic RFCOMM (SPP) Bridge for HC-05 Arduino communication
 * 3. Native Android Notification System for critical water tank alerts & level updates
 */
class MainActivity : ComponentActivity() {

    companion object {
        private const val TAG = "HydroSenseActivity"
        const val NOTIFICATION_CHANNEL_ID = "hydrosense_tank_alerts"
        const val NOTIFICATION_CHANNEL_NAME = "HydroSense Tank Alerts"
    }

    private lateinit var webView: WebView
    lateinit var sppService: BluetoothSPPService
    private var bluetoothAdapter: BluetoothAdapter? = null

    // Permission request launchers
    private val requestBluetoothPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.values.all { it }
        Log.d(TAG, "Bluetooth permissions outcome: $allGranted")
        notifyWebPermissionStatus("bluetooth", allGranted)
    }

    private val requestNotificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        Log.d(TAG, "Notification permission outcome: $isGranted")
        notifyWebPermissionStatus("notifications", isGranted)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Set matching theme colors
        window.statusBarColor = Color.parseColor("#090D16")
        window.navigationBarColor = Color.parseColor("#090D16")

        // Initialize Notification Channel
        createNotificationChannel()

        // Initialize Bluetooth Adapter & Service
        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
        sppService = BluetoothSPPService(this, bluetoothAdapter)

        // Forward Bluetooth events to WebView JavaScript listeners
        sppService.onRawLine = { line ->
            runOnUiThread {
                try {
                    val escaped = line
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("\n", "\\n")
                        .replace("\r", "")
                    webView.evaluateJavascript(
                        "window.onAndroidBluetoothData && window.onAndroidBluetoothData(\"$escaped\");",
                        null
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Error posting raw line to WebView: ${e.message}")
                }
            }
        }

        sppService.onStatusChange = { status, message ->
            runOnUiThread {
                try {
                    val escStatus = status.replace("\"", "\\\"")
                    val escMsg = (message ?: "").replace("\"", "\\\"")
                    webView.evaluateJavascript(
                        "window.onAndroidBluetoothStatus && window.onAndroidBluetoothStatus(\"$escStatus\", \"$escMsg\");",
                        null
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Error posting status to WebView: ${e.message}")
                }
            }
        }

        // Setup WebView
        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#090D16"))

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                allowFileAccessFromFileURLs = true
                allowUniversalAccessFromFileURLs = true
                mediaPlaybackRequiresUserGesture = false
                loadWithOverviewMode = true
                useWideViewPort = true
                cacheMode = WebSettings.LOAD_DEFAULT
                builtInZoomControls = false
                displayZoomControls = false
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                    return false
                }
            }

            webChromeClient = WebChromeClient()
            setLayerType(View.LAYER_TYPE_HARDWARE, null)

            // Register native bridges
            val bridge = AndroidNativeBridge(this@MainActivity)
            addJavascriptInterface(bridge, "AndroidBluetooth")
            addJavascriptInterface(bridge, "AndroidBridge")

            // Load offline HydroSense assets
            loadUrl("file:///android_asset/web/index.html")
        }

        setContentView(webView)

        // Smooth back navigation within WebView
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        // Check runtime permissions on startup
        checkAndRequestPermissions()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                importance
            ).apply {
                description = "Critical water level alerts, tank overflow warnings, and hardware updates"
                enableLights(true)
                lightColor = Color.CYAN
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 150, 250)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun hasBluetoothPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            NotificationManagerCompat.from(this).areNotificationsEnabled()
        }
    }

    fun checkAndRequestPermissions() {
        // Request Notifications on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!hasNotificationPermission()) {
                requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        // Request Bluetooth permissions
        if (!hasBluetoothPermission()) {
            requestBluetoothPermissions()
        }
    }

    fun requestBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestBluetoothPermissionsLauncher.launch(
                arrayOf(
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN
                )
            )
        } else {
            requestBluetoothPermissionsLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun notifyWebPermissionStatus(type: String, granted: Boolean) {
        runOnUiThread {
            webView.evaluateJavascript(
                "window.onAndroidPermissionResult && window.onAndroidPermissionResult(\"$type\", $granted);",
                null
            )
        }
    }

    @SuppressLint("MissingPermission")
    fun sendNotification(title: String, message: String, tag: String? = null): Boolean {
        return try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setColor(Color.parseColor("#06B6D4"))

            val notificationManager = NotificationManagerCompat.from(this)
            val notificationId = (tag?.hashCode() ?: System.currentTimeMillis().toInt()) and 0x7FFFFFFF
            notificationManager.notify(notificationId, builder.build())
            Log.d(TAG, "Notification delivered: $title - $message")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send notification: ${e.message}", e)
            false
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        sppService.disconnect()
        webView.destroy()
        super.onDestroy()
    }

    /**
     * JavaScript Bridge methods exposed to React app
     */
    inner class AndroidNativeBridge(private val activity: MainActivity) {

        @JavascriptInterface
        fun isNativeApp(): Boolean = true

        @JavascriptInterface
        fun hasBluetoothPermission(): Boolean = activity.hasBluetoothPermission()

        @JavascriptInterface
        fun hasNotificationPermission(): Boolean = activity.hasNotificationPermission()

        @JavascriptInterface
        fun requestBluetoothPermissions() {
            activity.runOnUiThread {
                activity.requestBluetoothPermissions()
            }
        }

        @JavascriptInterface
        fun requestNotificationPermission() {
            activity.runOnUiThread {
                activity.requestNotificationPermission()
            }
        }

        @JavascriptInterface
        fun getPairedDevicesJson(): String {
            val array = JSONArray()
            try {
                val devices = activity.sppService.getPairedDevices()
                for (dev in devices) {
                    val obj = JSONObject()
                    obj.put("name", dev.name ?: "Unknown Device")
                    obj.put("address", dev.address)
                    array.put(obj)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error generating paired devices JSON: ${e.message}")
            }
            return array.toString()
        }

        @JavascriptInterface
        fun connect(macAddress: String?): Boolean {
            return if (!macAddress.isNullOrBlank()) {
                activity.sppService.connectByAddress(macAddress)
            } else {
                activity.sppService.connectAuto()
            }
        }

        @JavascriptInterface
        fun disconnect() {
            activity.sppService.disconnect()
        }

        @JavascriptInterface
        fun sendCommand(command: String): Boolean {
            return activity.sppService.sendCommand(command)
        }

        @JavascriptInterface
        fun isConnected(): Boolean {
            return activity.sppService.isConnected()
        }

        @JavascriptInterface
        fun getConnectedDeviceName(): String {
            return activity.sppService.getConnectedDeviceName() ?: ""
        }

        @JavascriptInterface
        fun postNotification(title: String, message: String, tag: String? = null): Boolean {
            return activity.sendNotification(title, message, tag)
        }
    }
}

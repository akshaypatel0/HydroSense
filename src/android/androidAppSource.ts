/**
 * Native Android HC-05 Bluetooth Classic SPP Application Source Code (v3.0.0)
 *
 * Full production Kotlin project with:
 * - Direct RFCOMM / SPP Bluetooth Classic Hardware Bridge for HC-05 (UUID: 00001101-0000-1000-8000-00805F9B34FB)
 * - Hardware-accelerated offline WebView running the complete HydroSense UI
 * - Native Android System Notifications for target reached, overflow cutoff, and reserve alerts
 * - Anti-spam hysteresis tracking
 */

export const ANDROID_MANIFEST_XML = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.hydrosense.app">

    <!-- Legacy Bluetooth Permissions (Android 11 and lower) -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" />

    <!-- Modern Bluetooth Permissions (Android 12 / API 31+) -->
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" 
        android:usesPermissionFlags="neverForLocation" />

    <!-- Native Notification Permissions (Android 13 / API 33+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />

    <!-- USB Host Feature for Android USB OTG connections -->
    <uses-feature android:name="android.hardware.usb.host" android:required="false" />
    <uses-feature android:name="android.hardware.bluetooth" android:required="false" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="HydroSense"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.HydroSense">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:theme="@style/Theme.HydroSense">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <!-- Optional USB Device attached intent for OTG -->
            <intent-filter>
                <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

export const BLUETOOTH_SERVICE_KT = `package com.hydrosense.app

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.util.UUID

/**
 * Native Android Bluetooth Classic RFCOMM / SPP Service for HC-05 module.
 * Standard SPP Serial Port UUID: 00001101-0000-1000-8000-00805F9B34FB
 * Streams bidirectional serial lines between HC-05 and the HydroSense UI.
 */
class BluetoothSPPService(
    private val context: Context,
    private val bluetoothAdapter: BluetoothAdapter?
) {
    companion object {
        private const val TAG = "HydroSenseSPP"
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val PREFS_NAME = "hydrosense_prefs"
        private const val KEY_LAST_DEVICE_MAC = "last_hc05_mac"
    }

    var onRawLine: ((String) -> Unit)? = null
    var onStatusChange: ((status: String, message: String?) -> Unit)? = null

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private var socket: BluetoothSocket? = null
    private var outputStream: OutputStream? = null
    private var readerScope: CoroutineScope? = null
    private var connectedDevice: BluetoothDevice? = null
    private var isCurrentlyConnected = false

    fun isConnected(): Boolean = isCurrentlyConnected && socket?.isConnected == true

    fun getConnectedDeviceName(): String? = connectedDevice?.name ?: connectedDevice?.address

    @SuppressLint("MissingPermission")
    fun getPairedDevices(): List<BluetoothDevice> {
        return try {
            bluetoothAdapter?.bondedDevices?.toList() ?: emptyList()
        } catch (e: Exception) {
            Log.e(TAG, "Error listing paired devices: \${e.message}")
            emptyList()
        }
    }

    @SuppressLint("MissingPermission")
    fun connectAuto(): Boolean {
        val lastMac = prefs.getString(KEY_LAST_DEVICE_MAC, null)
        val paired = getPairedDevices()
        if (lastMac != null) {
            val match = paired.find { it.address.equals(lastMac, ignoreCase = true) }
            if (match != null) {
                Log.d(TAG, "Auto-connecting to previously saved device: \${match.name} (\${match.address})")
                connect(match)
                return true
            }
        }

        val hcDevice = paired.find {
            val name = it.name?.uppercase() ?: ""
            name.contains("HC-05") || name.contains("HC-06") || name.contains("HYDRO") || name.contains("ARDUINO")
        } ?: paired.firstOrNull()

        if (hcDevice != null) {
            Log.d(TAG, "Auto-connecting to found paired device: \${hcDevice.name} (\${hcDevice.address})")
            connect(hcDevice)
            return true
        }

        return false
    }

    @SuppressLint("MissingPermission")
    fun connectByAddress(macAddress: String): Boolean {
        val paired = getPairedDevices()
        val device = paired.find { it.address.equals(macAddress, ignoreCase = true) }
            ?: try {
                bluetoothAdapter?.getRemoteDevice(macAddress)
            } catch (e: Exception) {
                null
            }

        if (device != null) {
            connect(device)
            return true
        } else {
            onStatusChange?.invoke("error", "Device with MAC $macAddress not found.")
            return false
        }
    }

    @SuppressLint("MissingPermission")
    fun connect(device: BluetoothDevice) {
        connectedDevice = device
        prefs.edit().putString(KEY_LAST_DEVICE_MAC, device.address).apply()

        disconnect()

        onStatusChange?.invoke("connecting", device.name ?: device.address)

        readerScope = CoroutineScope(Dispatchers.IO + Job())
        readerScope?.launch {
            try {
                try {
                    bluetoothAdapter?.cancelDiscovery()
                } catch (_: Exception) {}

                Log.d(TAG, "Opening RFCOMM socket to: \${device.name} [\${device.address}]")
                val newSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                newSocket.connect()

                socket = newSocket
                outputStream = newSocket.outputStream
                isCurrentlyConnected = true

                val devLabel = device.name ?: device.address ?: "HC-05 SPP"
                Log.d(TAG, "Connected to $devLabel")
                onStatusChange?.invoke("connected", devLabel)

                // Query initial status packet
                sendCommand("STATUS\\n")

                val reader = BufferedReader(InputStreamReader(newSocket.inputStream, Charsets.UTF_8))
                while (isActive && isCurrentlyConnected) {
                    val line = reader.readLine() ?: break
                    val trimmed = line.trim()
                    if (trimmed.isNotEmpty()) {
                        onRawLine?.invoke(trimmed)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed or lost: \${e.message}", e)
                isCurrentlyConnected = false
                onStatusChange?.invoke("error", e.message ?: "Bluetooth SPP connection lost")
            } finally {
                cleanUp()
            }
        }
    }

    fun sendCommand(command: String): Boolean {
        if (!isConnected()) {
            Log.w(TAG, "Cannot send command: not connected")
            return false
        }

        return try {
            val formatted = if (command.endsWith("\\n")) command else "$command\\n"
            outputStream?.write(formatted.toByteArray(Charsets.UTF_8))
            outputStream?.flush()
            Log.d(TAG, "Sent command: \${command.trim()}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Send failed: \${e.message}")
            false
        }
    }

    fun disconnect() {
        isCurrentlyConnected = false
        readerScope?.cancel()
        cleanUp()
        onStatusChange?.invoke("disconnected", null)
    }

    private fun cleanUp() {
        isCurrentlyConnected = false
        try {
            outputStream?.close()
        } catch (_: Exception) {}
        try {
            socket?.close()
        } catch (_: Exception) {}
        outputStream = null
        socket = null
    }
}`;

export const MAIN_ACTIVITY_KT = `package com.hydrosense.app

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

    private val requestBluetoothPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.values.all { it }
        notifyWebPermissionStatus("bluetooth", allGranted)
    }

    private val requestNotificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        notifyWebPermissionStatus("notifications", isGranted)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.parseColor("#090D16")
        window.navigationBarColor = Color.parseColor("#090D16")

        createNotificationChannel()

        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothAdapter = bluetoothManager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
        sppService = BluetoothSPPService(this, bluetoothAdapter)

        sppService.onRawLine = { line ->
            runOnUiThread {
                val escaped = line
                    .replace("\\\\", "\\\\\\\\")
                    .replace("\\"", "\\\\\\\"")
                    .replace("\\n", "\\\\n")
                    .replace("\\r", "")
                webView.evaluateJavascript(
                    "window.onAndroidBluetoothData && window.onAndroidBluetoothData(\\"$escaped\\");",
                    null
                )
            }
        }

        sppService.onStatusChange = { status, message ->
            runOnUiThread {
                val escStatus = status.replace("\\"", "\\\\\\\"")
                val escMsg = (message ?: "").replace("\\"", "\\\\\\\"")
                webView.evaluateJavascript(
                    "window.onAndroidBluetoothStatus && window.onAndroidBluetoothStatus(\\"$escStatus\\", \\"$escMsg\\");",
                    null
                )
            }
        }

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
                override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean = false
            }

            webChromeClient = WebChromeClient()
            setLayerType(View.LAYER_TYPE_HARDWARE, null)

            val bridge = AndroidNativeBridge(this@MainActivity)
            addJavascriptInterface(bridge, "AndroidBluetooth")
            addJavascriptInterface(bridge, "AndroidBridge")

            loadUrl("file:///android_asset/web/index.html")
        }

        setContentView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

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
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        }
    }

    fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else {
            NotificationManagerCompat.from(this).areNotificationsEnabled()
        }
    }

    fun checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission()) {
            requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (!hasBluetoothPermission()) {
            requestBluetoothPermissions()
        }
    }

    fun requestBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestBluetoothPermissionsLauncher.launch(arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN))
        } else {
            requestBluetoothPermissionsLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    private fun notifyWebPermissionStatus(type: String, granted: Boolean) {
        runOnUiThread {
            webView.evaluateJavascript("window.onAndroidPermissionResult && window.onAndroidPermissionResult(\\"$type\\", $granted);", null)
        }
    }

    @SuppressLint("MissingPermission")
    fun sendNotification(title: String, message: String, tag: String? = null): Boolean {
        return try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
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
            true
        } catch (e: Exception) {
            false
        }
    }

    override fun onDestroy() {
        sppService.disconnect()
        webView.destroy()
        super.onDestroy()
    }

    inner class AndroidNativeBridge(private val activity: MainActivity) {
        @JavascriptInterface fun isNativeApp(): Boolean = true
        @JavascriptInterface fun hasBluetoothPermission(): Boolean = activity.hasBluetoothPermission()
        @JavascriptInterface fun hasNotificationPermission(): Boolean = activity.hasNotificationPermission()
        @JavascriptInterface fun requestBluetoothPermissions() { activity.runOnUiThread { activity.requestBluetoothPermissions() } }
        @JavascriptInterface fun requestNotificationPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                activity.requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        @JavascriptInterface fun getPairedDevicesJson(): String {
            val array = JSONArray()
            try {
                for (dev in activity.sppService.getPairedDevices()) {
                    val obj = JSONObject()
                    obj.put("name", dev.name ?: "Unknown Device")
                    obj.put("address", dev.address)
                    array.put(obj)
                }
            } catch (_: Exception) {}
            return array.toString()
        }
        @JavascriptInterface fun connect(macAddress: String?): Boolean = if (!macAddress.isNullOrBlank()) activity.sppService.connectByAddress(macAddress) else activity.sppService.connectAuto()
        @JavascriptInterface fun disconnect() { activity.sppService.disconnect() }
        @JavascriptInterface fun sendCommand(command: String): Boolean = activity.sppService.sendCommand(command)
        @JavascriptInterface fun isConnected(): Boolean = activity.sppService.isConnected()
        @JavascriptInterface fun postNotification(title: String, message: String, tag: String? = null): Boolean = activity.sendNotification(title, message, tag)
    }
}`;

export const BUILD_GRADLE_KTS = `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.hydrosense.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hydrosense.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 3
        versionName = "3.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.activity:activity-ktx:1.8.2")
    implementation("androidx.webkit:webkit:1.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}`;

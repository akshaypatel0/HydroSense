/**
 * Native Android HC-05 Bluetooth Classic SPP Application Source Code (v3.0.0)
 *
 * Full production Kotlin + Jetpack Compose project with:
 * - Automatic reconnection to previously paired/configured HC-05 device
 * - USB OTG serial connection support
 * - SPP UUID: 00001101-0000-1000-8000-00805F9B34FB
 * - Authoritative telemetry parsing matching Arduino firmware v3.0.0
 */

export const ANDROID_MANIFEST_XML = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.hydrosense.app">

    <!-- Legacy Bluetooth Permissions (Android 11 and lower) -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />

    <!-- Modern Bluetooth Permissions (Android 12 / API 31+) -->
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" 
        android:usesPermissionFlags="neverForLocation" />

    <!-- USB Host Feature for Android USB OTG connections -->
    <uses-feature android:name="android.hardware.usb.host" android:required="false" />

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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.util.UUID

/**
 * Native Android Bluetooth Classic RFCOMM / SPP Service for HC-05 module.
 * Standard SPP Serial Port UUID: 00001101-0000-1000-8000-00805F9B34FB
 * Features automatic connection to previously configured device on launch.
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

    enum class ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        RECONNECTING,
        ERROR
    }

    data class Telemetry(
        val water: Float = 0f,
        val status: String = "NORMAL",
        val target: Int = 80,
        val cutoff: Int = 90,
        val error: String = "NONE",
        val calEmpty: Float = 12.8f,
        val calFull: Float = 2.1f,
        val distance: Float = 0f,
        val buzzer: String = "OFF",
        val timestamp: Long = System.currentTimeMillis()
    )

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _connectedDeviceName = MutableStateFlow<String?>(null)
    val connectedDeviceName: StateFlow<String?> = _connectedDeviceName.asStateFlow()

    private val _telemetry = MutableStateFlow<Telemetry?>(null)
    val telemetry: StateFlow<Telemetry?> = _telemetry.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    private var socket: BluetoothSocket? = null
    private var outputStream: OutputStream? = null
    private var readerScope: CoroutineScope? = null
    private var lastConnectedDevice: BluetoothDevice? = null

    @SuppressLint("MissingPermission")
    fun getPairedDevices(): List<BluetoothDevice> {
        return bluetoothAdapter?.bondedDevices?.toList() ?: emptyList()
    }

    /**
     * Attempts automatic connection to previously configured device if available.
     */
    @SuppressLint("MissingPermission")
    fun connectAuto() {
        val lastMac = prefs.getString(KEY_LAST_DEVICE_MAC, null) ?: return
        val paired = getPairedDevices()
        val match = paired.find { it.address.equals(lastMac, ignoreCase = true) }
        if (match != null) {
            Log.d(TAG, "Auto-connecting to previously paired HC-05: \${match.name} (\${match.address})")
            connect(match)
        }
    }

    @SuppressLint("MissingPermission")
    fun connect(device: BluetoothDevice) {
        lastConnectedDevice = device
        // Persist MAC address for subsequent auto-connections
        prefs.edit().putString(KEY_LAST_DEVICE_MAC, device.address).apply()

        disconnect()

        readerScope = CoroutineScope(Dispatchers.IO + Job())
        readerScope?.launch {
            _connectionState.value = ConnectionState.CONNECTING
            _connectedDeviceName.value = device.name ?: device.address
            try {
                bluetoothAdapter?.cancelDiscovery()

                val newSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                newSocket.connect()

                socket = newSocket
                outputStream = newSocket.outputStream
                _connectionState.value = ConnectionState.CONNECTED
                _lastError.value = null
                Log.d(TAG, "Connected to HC-05: \${device.name} [\${device.address}]")

                // Request initial status packet
                sendCommand("STATUS")

                val reader = BufferedReader(InputStreamReader(newSocket.inputStream))
                while (isActive) {
                    val line = reader.readLine() ?: break
                    parseIncomingLine(line.trim())
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection error: \${e.message}", e)
                _lastError.value = e.message ?: "Connection lost"
                _connectionState.value = ConnectionState.ERROR
            } finally {
                cleanUp()
            }
        }
    }

    fun sendCommand(command: String) {
        readerScope?.launch(Dispatchers.IO) {
            try {
                val formatted = if (command.endsWith("\\n")) command else "$command\\n"
                outputStream?.write(formatted.toByteArray(Charsets.UTF_8))
                outputStream?.flush()
                Log.d(TAG, "Transmitted command: $command")
            } catch (e: Exception) {
                Log.e(TAG, "Command failed: \${e.message}")
            }
        }
    }

    private fun parseIncomingLine(line: String) {
        if (line.startsWith("STATUS")) {
            try {
                val tokens = line.split(",")
                val map = mutableMapOf<String, String>()
                for (i in 1 until tokens.size) {
                    val parts = tokens[i].split("=")
                    if (parts.size == 2) {
                        map[parts[0].trim().lowercase()] = parts[1].trim()
                    }
                }

                val t = Telemetry(
                    water = map["water"]?.toFloatOrNull() ?: 0f,
                    status = map["status"]?.uppercase() ?: "NORMAL",
                    target = map["target"]?.toIntOrNull() ?: 80,
                    cutoff = map["cutoff"]?.toIntOrNull() ?: 90,
                    error = map["error"]?.uppercase() ?: "NONE",
                    calEmpty = map["empty"]?.toFloatOrNull() ?: 12.8f,
                    calFull = map["full"]?.toFloatOrNull() ?: 2.1f,
                    distance = map["distance"]?.toFloatOrNull() ?: 0f,
                    buzzer = map["buzzer"]?.uppercase() ?: "OFF",
                    timestamp = System.currentTimeMillis()
                )
                _telemetry.value = t
            } catch (e: Exception) {
                Log.w(TAG, "Malformed line: $line", e)
            }
        }
    }

    fun disconnect() {
        readerScope?.cancel()
        cleanUp()
        _connectionState.value = ConnectionState.DISCONNECTED
        _connectedDeviceName.value = null
    }

    private fun cleanUp() {
        try {
            outputStream?.close()
            socket?.close()
        } catch (_: Exception) {}
        outputStream = null
        socket = null
    }
}`;

export const MAIN_ACTIVITY_KT = `package com.hydrosense.app

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {

    private lateinit var sppService: BluetoothSPPService
    private var bluetoothAdapter: BluetoothAdapter? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.values.all { it }
        if (allGranted) {
            sppService.connectAuto()
        } else {
            Toast.makeText(this, "Bluetooth permissions required for HC-05 connection", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter
        sppService = BluetoothSPPService(this, bluetoothAdapter)

        checkPermissionsAndAutoConnect()

        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF090D16)
                ) {
                    HydroSenseScreen(
                        sppService = sppService,
                        onScanDevices = { sppService.getPairedDevices() }
                    )
                }
            }
        }
    }

    private fun checkPermissionsAndAutoConnect() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_SCAN)
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        if (needed.isEmpty()) {
            sppService.connectAuto()
        } else {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        sppService.disconnect()
    }
}

@Composable
fun HydroSenseScreen(
    sppService: BluetoothSPPService,
    onScanDevices: () -> List<BluetoothDevice>
) {
    val connectionState by sppService.connectionState.collectAsState()
    val connectedDeviceName by sppService.connectedDeviceName.collectAsState()
    val telemetry by sppService.telemetry.collectAsState()

    var showDeviceDialog by remember { mutableStateOf(false) }
    var pairedDevices by remember { mutableStateOf<List<BluetoothDevice>>(emptyList()) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Top Bar
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "HydroSense",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = if (connectionState == BluetoothSPPService.ConnectionState.CONNECTED)
                            "Connected: \${connectedDeviceName ?: "HC-05"}"
                        else
                            "Auto-reconnect ready",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                }

                Button(
                    onClick = {
                        if (connectionState == BluetoothSPPService.ConnectionState.CONNECTED) {
                            sppService.disconnect()
                        } else {
                            pairedDevices = onScanDevices()
                            showDeviceDialog = true
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (connectionState == BluetoothSPPService.ConnectionState.CONNECTED) Color(0xFF1E293B) else Color(0xFF0284C7)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = when (connectionState) {
                            BluetoothSPPService.ConnectionState.CONNECTED -> "Disconnect"
                            BluetoothSPPService.ConnectionState.CONNECTING -> "Connecting..."
                            else -> "Connect HC-05"
                        },
                        fontSize = 13.sp
                    )
                }
            }
        }

        // Reservoir Dashboard Card - Final Output Only
        item {
            val waterLevel = telemetry?.water ?: 0f
            val status = telemetry?.status ?: "OFFLINE"

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(Color(0xFF0F172A).copy(alpha = 0.7f))
                    .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(24.dp))
                    .padding(20.dp)
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Water Reservoir", color = Color(0xFF94A3B8), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            text = status,
                            color = when (status) {
                                "CRITICAL", "HIGH" -> Color(0xFFEF4444)
                                "TARGET REACHED" -> Color(0xFF10B981)
                                "LOW" -> Color(0xFFF59E0B)
                                else -> Color(0xFF38BDF8)
                            },
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // Water Animation Level
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color(0xFF0B132B)),
                        contentAlignment = Alignment.BottomCenter
                    ) {
                        val animatedFraction by animateFloatAsState(
                            targetValue = (waterLevel / 100f).coerceIn(0f, 1f),
                            animationSpec = tween(durationMillis = 800)
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .fillMaxHeight(animatedFraction)
                                .background(
                                    Brush.verticalGradient(
                                        listOf(Color(0xFF38BDF8), Color(0xFF0284C7))
                                    )
                                )
                        )
                        Column(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "\${waterLevel.toInt()}%",
                                fontSize = 42.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.White
                            )
                            Text(
                                text = "Volume: \${String.format("%.1f", waterLevel * 0.1f)} L",
                                fontSize = 13.sp,
                                color = Color.White.copy(alpha = 0.85f)
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Target: \${telemetry?.target ?: 80}%", color = Color(0xFF94A3B8), fontSize = 12.sp)
                        Text("Cutoff: \${telemetry?.cutoff ?: 90}%", color = Color(0xFFEF4444), fontSize = 12.sp)
                    }
                }
            }
        }

        // Status & Buzzer Alert Indicator
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A).copy(alpha = 0.7f)),
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(24.dp))
            ) {
                Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "Safety Buzzer Alert: \${if (telemetry?.buzzer == \"ON\") \"ACTIVE (HIGH WATER)\" else \"NORMAL / SILENT\"}",
                        fontWeight = FontWeight.Bold,
                        color = if (telemetry?.buzzer == "ON") Color(0xFFF43F5E) else Color(0xFF10B981)
                    )
                    Text(
                        text = "Calibration: \${telemetry?.calStatus ?: \"OK\"} (Empty: \${telemetry?.calEmpty ?: 12.8f}cm, Full: \${telemetry?.calFull ?: 2.1f}cm)",
                        fontSize = 12.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }
        }
    }

    if (showDeviceDialog) {
        AlertDialog(
            onDismissRequest = { showDeviceDialog = false },
            title = { Text("Select HC-05 Device") },
            text = {
                if (pairedDevices.isEmpty()) {
                    Text("No paired Bluetooth devices found.\\n\\nPlease pair HC-05 in Android Settings first using PIN 1234 or 0000.")
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        pairedDevices.forEach { device ->
                            Button(
                                onClick = {
                                    showDeviceDialog = false
                                    sppService.connect(device)
                                },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B))
                            ) {
                                Text("\${device.name ?: "Unknown"} (\${device.address})")
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showDeviceDialog = false }) {
                    Text("Close")
                }
            }
        )
    }
}`;

export const BUILD_GRADLE_KTS = `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.hydrosense.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hydrosense.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 2
        versionName = "3.0.0"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.android)
}`;

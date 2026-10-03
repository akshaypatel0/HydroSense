package com.hydrosense.app

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
        val calStatus: String = "OK",
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
            Log.d(TAG, "Auto-connecting to previously paired HC-05: ${match.name} (${match.address})")
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
                Log.d(TAG, "Connected to HC-05: ${device.name} [${device.address}]")

                // Request initial status packet
                sendCommand("STATUS")

                val reader = BufferedReader(InputStreamReader(newSocket.inputStream))
                while (isActive) {
                    val line = reader.readLine() ?: break
                    parseIncomingLine(line.trim())
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection error: ${e.message}", e)
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
                val formatted = if (command.endsWith("\n")) command else "$command\n"
                outputStream?.write(formatted.toByteArray(Charsets.UTF_8))
                outputStream?.flush()
                Log.d(TAG, "Transmitted command: $command")
            } catch (e: Exception) {
                Log.e(TAG, "Command failed: ${e.message}")
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
                    calStatus = map["cal"]?.uppercase() ?: "OK",
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
}

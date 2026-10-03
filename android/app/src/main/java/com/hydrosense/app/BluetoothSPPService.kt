package com.hydrosense.app

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
            Log.e(TAG, "Error listing paired devices: ${e.message}")
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
                Log.d(TAG, "Auto-connecting to previously saved device: ${match.name} (${match.address})")
                connect(match)
                return true
            }
        }

        // Fallback: look for common HC-05 / Arduino Bluetooth device names
        val hcDevice = paired.find {
            val name = it.name?.uppercase() ?: ""
            name.contains("HC-05") || name.contains("HC-06") || name.contains("HYDRO") || name.contains("ARDUINO")
        } ?: paired.firstOrNull()

        if (hcDevice != null) {
            Log.d(TAG, "Auto-connecting to found paired device: ${hcDevice.name} (${hcDevice.address})")
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

                Log.d(TAG, "Opening RFCOMM socket to: ${device.name} [${device.address}]")
                val newSocket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                newSocket.connect()

                socket = newSocket
                outputStream = newSocket.outputStream
                isCurrentlyConnected = true

                val devLabel = device.name ?: device.address ?: "HC-05 SPP"
                Log.d(TAG, "Connected to $devLabel")
                onStatusChange?.invoke("connected", devLabel)

                // Query initial status packet
                sendCommand("STATUS\n")

                val reader = BufferedReader(InputStreamReader(newSocket.inputStream, Charsets.UTF_8))
                while (isActive && isCurrentlyConnected) {
                    val line = reader.readLine() ?: break
                    val trimmed = line.trim()
                    if (trimmed.isNotEmpty()) {
                        onRawLine?.invoke(trimmed)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed or lost: ${e.message}", e)
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
            val formatted = if (command.endsWith("\n")) command else "$command\n"
            outputStream?.write(formatted.toByteArray(Charsets.UTF_8))
            outputStream?.flush()
            Log.d(TAG, "Sent command: ${command.trim()}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Send failed: ${e.message}")
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
}

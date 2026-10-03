package com.hydrosense.app

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
                            "Connected: ${connectedDeviceName ?: "HC-05"}"
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

        // Reservoir Dashboard Card
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
                            animationSpec = tween(durationMillis = 800),
                            label = "waterAnimation"
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
                                text = "${waterLevel.toInt()}%",
                                fontSize = 42.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.White
                            )
                            Text(
                                text = "Volume: ${String.format("%.1f", waterLevel * 0.1f)} L",
                                fontSize = 13.sp,
                                color = Color.White.copy(alpha = 0.85f)
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Target: ${telemetry?.target ?: 80}%", color = Color(0xFF94A3B8), fontSize = 12.sp)
                        Text("Cutoff: ${telemetry?.cutoff ?: 90}%", color = Color(0xFFEF4444), fontSize = 12.sp)
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
                        text = "Safety Buzzer Alert: ${if (telemetry?.buzzer == "ON") "ACTIVE (HIGH WATER)" else "NORMAL / SILENT"}",
                        fontWeight = FontWeight.Bold,
                        color = if (telemetry?.buzzer == "ON") Color(0xFFF43F5E) else Color(0xFF10B981)
                    )
                    Text(
                        text = "Calibration: ${telemetry?.calStatus ?: "OK"} (Empty: ${telemetry?.calEmpty ?: 12.8f}cm, Full: ${telemetry?.calFull ?: 2.1f}cm)",
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
                    Text("No paired Bluetooth devices found.\n\nPlease pair HC-05 in Android Settings first using PIN 1234 or 0000.")
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
                                Text("${device.name ?: "Unknown"} (${device.address})")
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
}

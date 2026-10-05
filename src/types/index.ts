/**
 * HydroSense – Smart Water Tank Monitoring & Control
 * Core Types & Data Contracts
 * Arduino Uno + HC-05 Bluetooth Classic SPP at 9600 baud.
 */

export type AlarmState = 'ON' | 'OFF';
export type MotorState = 'ON' | 'OFF';
export type ControlMode = 'AUTO' | 'MANUAL';

export type WaterLevelStatus =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'CRITICAL'
  | 'SENSOR_ERROR'
  | 'SENSOR_ABSENT';

export type CalibrationStatus = 'OK' | 'UNCALIBRATED' | 'CALIBRATING';

export interface TelemetryData {
  water: number | null;          // Direct water level percentage from Arduino (0 - 100%), null if sensor error
  liters?: number;               // Calculated volume in litres: Level × Capacity / 100
  distance?: number;             // Distance in cm from ultrasonic sensor (ONLY for Diagnostics)
  motor: MotorState;             // Live motor status: 'ON' | 'OFF' confirmed by Arduino
  mode: ControlMode;             // Control mode: 'AUTO' | 'MANUAL'
  autoStart: number;             // Configured auto start level % (default 10%, 0-90%)
  autoTarget: number;            // Configured auto target level % (default 80%, 1-95%)
  status: WaterLevelStatus;      // LOW, NORMAL, HIGH, CRITICAL, SENSOR_ERROR
  isTankFull?: boolean;          // True if level >= 95% or critical
  target: number;                // Target mark (e.g. 80%)
  cutoff: number;                // Safety cutoff mark (fixed at 95%)
  buzzer: AlarmState;            // Safety buzzer status
  continuousBuzzer?: boolean;    // Active during critical alarms
  error: string;                 // 'NONE', 'SENSOR:ABSENT', 'SENSOR:OUT_OF_RANGE', etc.
  isSensorUnavailable: boolean;  // True when sensor is absent or out of range
  sensorErrorDetail?: string;    // Human-readable detail (e.g., "No ultrasonic echo detected.")
  calStatus: CalibrationStatus;  // 'OK' | 'UNCALIBRATED'
  calEmpty: number;              // Empty tank distance in cm
  calFull: number;               // Full tank distance in cm
  timestamp: number;             // Local receipt timestamp
  rawLine: string;               // Original raw packet received
  autoEvent?: string;            // e.g. "AUTO:MOTOR_ON", "AUTO:MOTOR_OFF:TARGET_REACHED", etc.
}

export type OutgoingCommand =
  | 'MOTOR_ON'
  | 'MOTOR_OFF'
  | 'MODE:AUTO'
  | 'MODE:MANUAL'
  | `AUTO_START:${number}`
  | `AUTO_TARGET:${number}`
  | 'CAL_EMPTY'
  | 'CAL_FULL'
  | 'STATUS';

export type TransportType = 'bluetooth_spp' | 'usb_serial' | 'test_bench';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  transport: TransportType;
  deviceName?: string;
  baudRate: number;
  packetsReceived: number;
  packetsSent: number;
  bytesReceived: number;
  lastPacketTime: number | null;
  lastRawText?: string;
  lastRawLineTime?: number | null;
  lastValidTelemetryTime?: number | null;
  readerActive?: boolean;
  hasReceivedValidTelemetry?: boolean;
  noDataAlert?: boolean;
  errorMessage?: string;
  autoReconnectEnabled?: boolean;
}

export interface TankConfig {
  tankCapacityLiters: number;    // Tank capacity in litres (500L, 750L, 1000L, etc.)
  lowThresholdPercent: number;   // Low visual threshold mark (e.g. 25%)
  dailyTargetLiters?: number;    // Optional daily water usage goal in litres
  autoStartLevel: number;        // Auto start level % (default 10%)
  autoTargetLevel: number;       // Auto target level % (default 80%, max 95%)
  autoReconnect: boolean;        // Whether to automatically reconnect to HC-05
}

export type LogSeverity = 'info' | 'warning' | 'critical' | 'command';

export interface EventLogItem {
  id: string;
  timestamp: number;
  severity: LogSeverity;
  source: 'HARDWARE' | 'COMMAND' | 'SYSTEM' | 'SAFETY';
  message: string;
  details?: Record<string, unknown>;
}

export interface PendingCommand {
  id: string;
  command: OutgoingCommand | string;
  sentAt: number;
  expectedState?: {
    motor?: MotorState;
    mode?: ControlMode;
    autoStart?: number;
    autoTarget?: number;
    target?: number;
    cutoff?: number;
    calibration?: 'empty' | 'full';
  };
  timeoutTimer?: number;
}

export type ActiveNavTab = 'home' | 'control' | 'usage' | 'settings';

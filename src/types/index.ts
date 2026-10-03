/**
 * HydroSense – Smart Water Monitor
 * Core Types & Data Contracts
 * Final Arduino Uno Firmware Protocol Specification (9600 baud, HC-05 & USB)
 * Pure water-level monitoring, buzzer alert, and acoustic EEPROM calibration.
 * (No pump or motor references)
 */

export type AlarmState = 'ON' | 'OFF';

export type WaterLevelStatus =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'CRITICAL'
  | 'SENSOR_ABSENT';

export type CalibrationStatus = 'OK' | 'UNCALIBRATED' | 'CALIBRATING';

export interface TelemetryData {
  water: number | null;         // Direct water level percentage from Arduino (0 - 100%), or null if SENSOR:ABSENT
  liters?: number;              // Current volume in liters (null if sensor unavailable)
  status: WaterLevelStatus;     // LOW (0-25%), NORMAL (25-90%), HIGH (90-95%), CRITICAL (>95% or >=98.90%), SENSOR_ABSENT
  isTankFull?: boolean;         // True if level >= 98.90% (Immediate Attention)
  target: number;               // High warning mark (90%)
  cutoff: number;               // Critical warning mark (95%)
  buzzer: AlarmState;           // Hardware buzzer alert status ('ON' | 'OFF')
  continuousBuzzer?: boolean;   // Active at >= 98.90% until measured level drops below 97.50%
  error: string;                // 'NONE', 'SENSOR:ABSENT', etc.
  isSensorUnavailable: boolean; // True when SENSOR:ABSENT is received
  calStatus: CalibrationStatus; // 'OK' | 'UNCALIBRATED'
  calEmpty: number;             // Distance in cm considered 0% empty (e.g. 14.00 cm)
  calFull: number;              // Distance in cm considered 100% full (e.g. 2.42 cm)
  distance?: number;            // Distance from sensor to water surface in cm (e.g. 2.74 cm)
  timestamp: number;            // Local receipt timestamp
  rawLine: string;              // Original newline-terminated packet
}

export type OutgoingCommand =
  | 'CAL_EMPTY'
  | 'CAL_FULL'
  | 'STATUS'
  | `TARGET:${number}`
  | `CUTOFF:${number}`;

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
  tankCapacityLiters: number;   // Max water capacity in liters (default 500 L or user configured)
  lowThresholdPercent: number;  // Low visual threshold mark (e.g. 25%)
  dailyTargetLiters?: number;   // Optional daily water usage goal in liters (e.g. 120 L)
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
  command: OutgoingCommand;
  sentAt: number;
  expectedState: {
    target?: number;
    cutoff?: number;
    calibration?: 'empty' | 'full';
  };
  timeoutTimer?: number;
}

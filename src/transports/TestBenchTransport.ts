/**
 * Hardware Test Bench & Loopback Transport
 *
 * Implements the exact same state machine as the final Arduino Uno firmware:
 * - Live data: DISTANCE:2.74,LEVEL:97.2
 * - Missing sensor: SENSOR:ABSENT
 * - Startup: WATER TANK MONITOR READY
 * - Calibration: CALIBRATION:EMPTY=14.00,FULL=2.42
 * - Acknowledgements: ACK:CAL_EMPTY:OK / ERROR, ACK:CAL_FULL:OK / ERROR
 * - Thresholds: 0-90% Normal/Low, >90-95% High, >95-98.9% Critical, >=98.9% Tank Full with continuous buzzer until < 97.5%
 */

import { formatCommand, parseStatusLine } from '../protocol/protocolParser';
import { AlarmState, ConnectionState, OutgoingCommand, TelemetryData, WaterLevelStatus } from '../types';
import { IHardwareTransport, TransportCallbacks } from './types';

export class TestBenchTransport implements IHardwareTransport {
  private timer: number | null = null;
  private callbacks: TransportCallbacks;

  // Authoritative Hardware State (identical to final Arduino Uno firmware)
  private calEmpty: number = 14.00;
  private calFull: number = 2.42;
  private distance: number = 2.74;
  private water: number = 97.2;
  private status: WaterLevelStatus = 'CRITICAL';
  private target: number = 90;
  private cutoff: number = 95;
  private isSensorAbsent: boolean = false;
  private continuousBuzzer: boolean = false;
  private buzzer: AlarmState = 'OFF';
  private outputFormatMode: 'bluetooth_compact' | 'usb_human' = 'bluetooth_compact';

  private lastTelemetry: TelemetryData | null = null;

  private state: ConnectionState = {
    status: 'disconnected',
    transport: 'test_bench',
    deviceName: 'Arduino Uno (Loopback Test Bench at 9600 baud)',
    baudRate: 9600,
    packetsReceived: 0,
    packetsSent: 0,
    bytesReceived: 0,
    lastPacketTime: null,
    lastRawText: undefined,
    lastRawLineTime: null,
    lastValidTelemetryTime: null,
    readerActive: false,
    hasReceivedValidTelemetry: false,
    noDataAlert: false,
  };

  constructor(callbacks: TransportCallbacks) {
    this.callbacks = callbacks;
  }

  public getState(): ConnectionState {
    return { ...this.state };
  }

  public setOutputFormatMode(mode: 'bluetooth_compact' | 'usb_human'): void {
    this.outputFormatMode = mode;
  }

  public async connect(): Promise<boolean> {
    this.updateState({
      status: 'connecting',
      bytesReceived: 0,
      packetsReceived: 0,
      readerActive: false,
      hasReceivedValidTelemetry: false,
    });
    await new Promise((r) => setTimeout(r, 200));

    this.updateState({
      status: 'connected',
      deviceName: 'Arduino Uno (Loopback Test Bench at 9600 baud)',
      readerActive: true,
    });

    // 1. Emit startup notice exactly like Arduino Uno
    const startupLine = 'WATER TANK MONITOR READY';
    this.state.bytesReceived += startupLine.length + 2;
    this.state.lastRawText = startupLine;
    this.state.lastRawLineTime = Date.now();
    this.callbacks.onRawLineReceived(startupLine, 'RX');

    // 2. Initial broadcast
    this.calculateWaterAndStatus();
    this.broadcastTelemetry();

    // 3. Periodic broadcast every 1s
    this.timer = window.setInterval(() => {
      this.tickHardwarePhysics();
      this.broadcastTelemetry();
    }, 1000);

    return true;
  }

  public async disconnect(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.buzzer = 'OFF';
    this.continuousBuzzer = false;
    this.updateState({
      status: 'disconnected',
      readerActive: false,
    });
  }

  public async sendCommand(command: OutgoingCommand): Promise<boolean> {
    if (this.state.status !== 'connected') {
      this.callbacks.onError('Test bench is not connected.');
      return false;
    }

    const formatted = formatCommand(command);
    this.callbacks.onRawLineReceived(formatted.trim(), 'TX');
    this.state.packetsSent++;

    const trimmed = command.trim();
    const upper = trimmed.toUpperCase();

    // 1. CAL_EMPTY
    if (upper === 'CAL_EMPTY') {
      if (this.isSensorAbsent) {
        this.emitAck('CAL_EMPTY', 'ERROR', 'SENSOR_UNAVAILABLE');
      } else {
        this.calEmpty = Math.round(this.distance * 100) / 100;
        this.calculateWaterAndStatus();
        this.emitAck('CAL_EMPTY', 'OK');
        // Report updated calibration line
        this.emitCalibrationReport();
      }
    }
    // 2. CAL_FULL
    else if (upper === 'CAL_FULL') {
      if (this.isSensorAbsent) {
        this.emitAck('CAL_FULL', 'ERROR', 'SENSOR_UNAVAILABLE');
      } else if (this.distance < this.calEmpty) {
        this.calFull = Math.round(this.distance * 100) / 100;
        this.calculateWaterAndStatus();
        this.emitAck('CAL_FULL', 'OK');
        // Report updated calibration line
        this.emitCalibrationReport();
      } else {
        this.emitAck('CAL_FULL', 'ERROR', 'FULL_MUST_BE_LESS_THAN_EMPTY');
      }
    }
    // 3. STATUS (Request stored calibration values & immediate status)
    else if (upper === 'STATUS') {
      this.emitCalibrationReport();
      setTimeout(() => {
        this.broadcastTelemetry();
      }, 50);
      return true;
    }

    return true;
  }

  private emitAck(cmd: string, status: 'OK' | 'ERROR', reason?: string): void {
    const ackLine = `ACK:${cmd}:${status}${reason ? `:${reason}` : ''}`;
    this.state.bytesReceived += ackLine.length + 2;
    this.state.lastRawText = ackLine;
    this.state.lastRawLineTime = Date.now();
    this.callbacks.onRawLineReceived(ackLine, 'RX');
  }

  private emitCalibrationReport(): void {
    const calLine = `CALIBRATION:EMPTY=${this.calEmpty.toFixed(2)},FULL=${this.calFull.toFixed(2)}`;
    this.state.bytesReceived += calLine.length + 2;
    this.state.lastRawText = calLine;
    this.state.lastRawLineTime = Date.now();
    this.callbacks.onRawLineReceived(calLine, 'RX');

    this.callbacks.onCalibrationUpdate?.({
      calEmpty: this.calEmpty,
      calFull: this.calFull,
    });
  }

  private tickHardwarePhysics(): void {
    if (this.isSensorAbsent) return;

    // Small physical fluctuation
    const noise = (Math.random() - 0.5) * 0.02;
    this.distance = Math.round((this.distance + noise) * 100) / 100;
    this.calculateWaterAndStatus();
  }

  private calculateWaterAndStatus(): void {
    if (this.isSensorAbsent) {
      this.status = 'SENSOR_ABSENT';
      this.buzzer = 'OFF';
      this.continuousBuzzer = false;
      return;
    }

    const usableHeight = this.calEmpty - this.calFull;
    if (usableHeight <= 0.5) {
      this.water = 0;
    } else {
      const waterHeight = this.calEmpty - this.distance;
      const pct = (waterHeight / usableHeight) * 100;
      this.water = Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
    }

    // Continuous buzzer hysteresis:
    // Triggers at >= 98.90% and maintains until falling below 97.50%
    if (this.water >= 98.90) {
      this.continuousBuzzer = true;
    } else if (this.continuousBuzzer && this.water < 97.50) {
      this.continuousBuzzer = false;
    }

    this.buzzer = this.continuousBuzzer || this.water > 95.0 ? 'ON' : 'OFF';

    // Status: Low (0-25%), Normal (25-90%), High (90-95%), Critical (>95% or >=98.90%)
    if (this.water >= 98.90) {
      this.status = 'CRITICAL';
    } else if (this.water > 95.0) {
      this.status = 'CRITICAL';
    } else if (this.water > 90.0) {
      this.status = 'HIGH';
    } else if (this.water <= 25.0) {
      this.status = 'LOW';
    } else {
      this.status = 'NORMAL';
    }
  }

  public broadcastTelemetry(): void {
    let line: string;

    if (this.isSensorAbsent) {
      // Exact Arduino message when ultrasonic sensor is absent/disconnected
      line = 'SENSOR:ABSENT';
    } else if (this.outputFormatMode === 'bluetooth_compact') {
      // Exact final Arduino HC-05 format: DISTANCE:2.74,LEVEL:97.2
      line = `DISTANCE:${this.distance.toFixed(2)},LEVEL:${this.water.toFixed(1)}`;
    } else {
      // USB format: Distance: 8.25 cm | Water Level: 48.9%
      line = `Distance: ${this.distance.toFixed(2)} cm | Water Level: ${this.water.toFixed(1)}%`;
    }

    this.state.bytesReceived += line.length + 2;
    this.state.lastRawText = line;
    this.state.lastRawLineTime = Date.now();
    this.callbacks.onRawLineReceived(line, 'RX');

    const parsed = parseStatusLine(line, this.lastTelemetry);
    if (parsed.telemetry) {
      this.lastTelemetry = parsed.telemetry;
      this.state.packetsReceived++;
      this.state.lastPacketTime = Date.now();
      this.state.lastValidTelemetryTime = Date.now();
      this.state.hasReceivedValidTelemetry = true;
      this.callbacks.onTelemetry(parsed.telemetry);
    }

    this.callbacks.onStatusChange(this.getState());
  }

  public injectFault(faultType: 'SENSOR:ABSENT' | 'HIGH_92' | 'CRITICAL_96' | 'TANK_FULL_99' | 'HYSTERESIS_97' | 'CLEAR'): void {
    if (faultType === 'SENSOR:ABSENT') {
      this.isSensorAbsent = true;
      this.calculateWaterAndStatus();
    } else if (faultType === 'HIGH_92') {
      this.isSensorAbsent = false;
      this.setWaterLevel(92.0);
    } else if (faultType === 'CRITICAL_96') {
      this.isSensorAbsent = false;
      this.setWaterLevel(96.0);
    } else if (faultType === 'TANK_FULL_99') {
      this.isSensorAbsent = false;
      this.setWaterLevel(99.2);
    } else if (faultType === 'HYSTERESIS_97') {
      this.isSensorAbsent = false;
      // Set to 97.4% (below 97.5% buzzer reset mark)
      this.setWaterLevel(97.2);
    } else if (faultType === 'CLEAR') {
      this.isSensorAbsent = false;
      this.setWaterLevel(50.0);
    }
    this.broadcastTelemetry();
  }

  public setWaterLevel(level: number): void {
    this.isSensorAbsent = false;
    this.water = Math.min(100, Math.max(0, level));
    const usableHeight = this.calEmpty - this.calFull;
    const waterDepth = (this.water / 100) * usableHeight;
    this.distance = Math.round((this.calEmpty - waterDepth) * 100) / 100;
    this.calculateWaterAndStatus();
    this.broadcastTelemetry();
  }

  private updateState(partial: Partial<ConnectionState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.callbacks.onStatusChange(this.getState());
  }
}

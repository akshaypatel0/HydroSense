/**
 * Hardware Test Bench & Loopback Transport
 *
 * Implements the exact same state machine as the Arduino smart water tank firmware:
 * - Live data: DISTANCE:8.25,LEVEL:48.9,MOTOR:OFF
 * - Motor commands: MOTOR_ON, MOTOR_OFF (with ACK:MOTOR_ON:OK, ACK:MOTOR_OFF:OK)
 * - Modes: MODE:AUTO, MODE:MANUAL
 * - Auto thresholds: AUTO_START:10, AUTO_TARGET:80
 * - Auto events: AUTO:MOTOR_ON, AUTO:MOTOR_OFF:TARGET_REACHED, AUTO:MOTOR_OFF:SAFETY_LIMIT
 * - Sensor errors: SENSOR:ABSENT, SENSOR:OUT_OF_RANGE
 * - Calibration: CAL_EMPTY, CAL_FULL, STATUS
 */

import { formatCommand, parseStatusLine } from '../protocol/protocolParser';
import {
  AlarmState,
  ConnectionState,
  ControlMode,
  MotorState,
  OutgoingCommand,
  TelemetryData,
  WaterLevelStatus,
} from '../types';
import { IHardwareTransport, TransportCallbacks } from './types';

export class TestBenchTransport implements IHardwareTransport {
  private timer: number | null = null;
  private callbacks: TransportCallbacks;

  // Authoritative hardware state
  private calEmpty: number = 13.02;
  private calFull: number = 2.42;
  private distance: number = 7.72; // ~50%
  private water: number = 50.0;
  private motor: MotorState = 'OFF';
  private mode: ControlMode = 'AUTO';
  private autoStart: number = 10;
  private autoTarget: number = 80;
  private status: WaterLevelStatus = 'NORMAL';
  private isSensorAbsent: boolean = false;
  private buzzer: AlarmState = 'OFF';

  private state: ConnectionState = {
    status: 'disconnected',
    transport: 'test_bench',
    deviceName: 'Arduino Uno Test Bench (9600 baud)',
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

  private updateState(updates: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...updates };
    this.callbacks.onStatusChange?.(this.getState());
  }

  public async connect(): Promise<boolean> {
    this.updateState({
      status: 'connecting',
      bytesReceived: 0,
      packetsReceived: 0,
      readerActive: false,
      hasReceivedValidTelemetry: false,
    });
    await new Promise((r) => setTimeout(r, 150));

    this.updateState({
      status: 'connected',
      deviceName: 'Arduino Uno Test Bench (9600 baud)',
      readerActive: true,
    });

    // Calculate initial state and broadcast immediately
    this.calculateWaterAndStatus();
    this.broadcastTelemetry();

    // Periodic simulation tick every 1000ms
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
    this.updateState({
      status: 'disconnected',
      readerActive: false,
    });
  }

  public async sendCommand(command: OutgoingCommand | string): Promise<boolean> {
    if (this.state.status !== 'connected') {
      this.callbacks.onError('Test bench is not connected.');
      return false;
    }

    const formatted = formatCommand(command);
    this.callbacks.onRawLineReceived(formatted.trim(), 'TX');
    this.state.packetsSent++;

    const trimmed = command.trim();
    const upper = trimmed.toUpperCase();

    // 1. MOTOR_ON
    if (upper === 'MOTOR_ON') {
      if (this.water >= 95.0) {
        this.emitAck('MOTOR_ON', 'ERROR', 'SAFETY_LIMIT_95');
        return false;
      }
      this.motor = 'ON';
      this.emitAck('MOTOR_ON', 'OK');
      setTimeout(() => this.broadcastTelemetry(), 50);
      return true;
    }

    // 2. MOTOR_OFF
    if (upper === 'MOTOR_OFF') {
      this.motor = 'OFF';
      this.emitAck('MOTOR_OFF', 'OK');
      setTimeout(() => this.broadcastTelemetry(), 50);
      return true;
    }

    // 3. MODE:AUTO / MODE:MANUAL
    if (upper === 'MODE:AUTO') {
      this.mode = 'AUTO';
      this.emitLine('MODE:AUTO');
      setTimeout(() => this.broadcastTelemetry(), 50);
      return true;
    }
    if (upper === 'MODE:MANUAL') {
      this.mode = 'MANUAL';
      this.emitLine('MODE:MANUAL');
      setTimeout(() => this.broadcastTelemetry(), 50);
      return true;
    }

    // 4. AUTO_START:X
    if (upper.startsWith('AUTO_START:')) {
      const val = parseFloat(trimmed.split(':')[1]);
      if (!isNaN(val) && val >= 0 && val <= 90) {
        this.autoStart = val;
        this.emitLine(`AUTO_START:${val}`);
        return true;
      }
    }

    // 5. AUTO_TARGET:X
    if (upper.startsWith('AUTO_TARGET:')) {
      const val = parseFloat(trimmed.split(':')[1]);
      if (!isNaN(val) && val >= 1 && val <= 95) {
        this.autoTarget = Math.min(95, val);
        this.emitLine(`AUTO_TARGET:${this.autoTarget}`);
        return true;
      }
    }

    // 6. CAL_EMPTY
    if (upper === 'CAL_EMPTY') {
      if (this.isSensorAbsent) {
        this.emitAck('CAL_EMPTY', 'ERROR', 'SENSOR_UNAVAILABLE');
      } else {
        this.calEmpty = Math.round(this.distance * 100) / 100;
        this.calculateWaterAndStatus();
        this.emitAck('CAL_EMPTY', 'OK');
        this.emitLine(`CALIBRATION:EMPTY=${this.calEmpty.toFixed(2)},FULL=${this.calFull.toFixed(2)}`);
      }
      return true;
    }

    // 7. CAL_FULL
    if (upper === 'CAL_FULL') {
      if (this.isSensorAbsent) {
        this.emitAck('CAL_FULL', 'ERROR', 'SENSOR_UNAVAILABLE');
      } else if (this.distance < this.calEmpty) {
        this.calFull = Math.round(this.distance * 100) / 100;
        this.calculateWaterAndStatus();
        this.emitAck('CAL_FULL', 'OK');
        this.emitLine(`CALIBRATION:EMPTY=${this.calEmpty.toFixed(2)},FULL=${this.calFull.toFixed(2)}`);
      } else {
        this.emitAck('CAL_FULL', 'ERROR', 'FULL_MUST_BE_LESS_THAN_EMPTY');
      }
      return true;
    }

    // 8. STATUS
    if (upper === 'STATUS') {
      this.emitLine(`CALIBRATION:EMPTY=${this.calEmpty.toFixed(2)},FULL=${this.calFull.toFixed(2)}`);
      setTimeout(() => this.broadcastTelemetry(), 50);
      return true;
    }

    return true;
  }

  private emitLine(line: string): void {
    this.state.bytesReceived += line.length + 2;
    this.state.lastRawText = line;
    this.state.lastRawLineTime = Date.now();
    this.callbacks.onRawLineReceived(line, 'RX');
  }

  private emitAck(cmd: string, status: 'OK' | 'ERROR', reason?: string): void {
    const ackLine = `ACK:${cmd}:${status}${reason ? `:${reason}` : ''}`;
    this.emitLine(ackLine);
    const parsed = parseStatusLine(ackLine);
    if (parsed.ack) {
      // Notified via raw line
    }
  }

  private tickHardwarePhysics(): void {
    if (this.isSensorAbsent) return;

    // If motor is running, tank level rises by ~0.8% per second
    if (this.motor === 'ON') {
      this.water = Math.min(100, this.water + 0.8);
      // Recalculate distance corresponding to new water level
      const usableHeight = this.calEmpty - this.calFull;
      this.distance = this.calEmpty - (this.water / 100) * usableHeight;

      // AUTO mode cutoff check
      if (this.mode === 'AUTO') {
        if (this.water >= this.autoTarget && this.water < 95.0) {
          this.motor = 'OFF';
          this.emitLine('AUTO:MOTOR_OFF:TARGET_REACHED');
        } else if (this.water >= 95.0) {
          this.motor = 'OFF';
          this.emitLine('AUTO:MOTOR_OFF:SAFETY_LIMIT');
        }
      } else if (this.water >= 95.0) {
        // Even in manual mode, Arduino enforces 95% safety cutoff!
        this.motor = 'OFF';
        this.emitLine('ACK:MOTOR_OFF:SAFETY_LIMIT');
      }
    } else {
      // Slight natural drop or water usage simulation (~0.1% occasionally)
      if (this.water > 0 && Math.random() < 0.25) {
        this.water = Math.max(0, this.water - 0.2);
        const usableHeight = this.calEmpty - this.calFull;
        this.distance = this.calEmpty - (this.water / 100) * usableHeight;
      }

      // AUTO mode trigger start if level falls below autoStart
      if (this.mode === 'AUTO' && this.water <= this.autoStart && this.water < this.autoTarget) {
        this.motor = 'ON';
        this.emitLine('AUTO:MOTOR_ON');
      }
    }

    // Small sensor noise (±0.02 cm) to simulate real-world HC-SR04 readings
    const noise = (Math.random() - 0.5) * 0.04;
    this.distance = Math.round((this.distance + noise) * 100) / 100;

    this.calculateWaterAndStatus();
  }

  private calculateWaterAndStatus(): void {
    if (this.isSensorAbsent) {
      this.status = 'SENSOR_ERROR';
      this.buzzer = 'OFF';
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

    this.buzzer = this.water >= 95.0 ? 'ON' : 'OFF';

    if (this.water >= 95.0) {
      this.status = 'CRITICAL';
    } else if (this.water > 80.0) {
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
      line = 'SENSOR:ABSENT';
    } else {
      // Exact user-specified Arduino format:
      // DISTANCE:8.25,LEVEL:48.9,MOTOR:OFF
      line = `DISTANCE:${this.distance.toFixed(2)},LEVEL:${this.water.toFixed(1)},MOTOR:${this.motor}`;
    }

    this.state.bytesReceived += line.length + 2;
    this.state.packetsReceived++;
    this.state.lastPacketTime = Date.now();
    this.state.lastRawText = line;
    this.state.lastRawLineTime = Date.now();
    this.state.lastValidTelemetryTime = Date.now();
    this.state.hasReceivedValidTelemetry = true;

    this.callbacks.onRawLineReceived(line, 'RX');

    const result = parseStatusLine(line);
    if (result.telemetry) {
      // Enrich with current test bench mode and targets
      result.telemetry.mode = this.mode;
      result.telemetry.autoStart = this.autoStart;
      result.telemetry.autoTarget = this.autoTarget;
      this.callbacks.onTelemetry(result.telemetry);
    }

    this.callbacks.onStatusChange(this.getState());
  }

  // Helper methods to simulate hardware conditions from Diagnostics
  public toggleSensorAbsent(absent: boolean): void {
    this.isSensorAbsent = absent;
    if (absent && this.motor === 'ON') {
      this.motor = 'OFF';
      this.emitLine('AUTO:MOTOR_OFF:SENSOR_INVALID');
    }
    this.broadcastTelemetry();
  }

  public setWaterLevel(targetLevel: number): void {
    this.water = Math.min(100, Math.max(0, targetLevel));
    const usableHeight = this.calEmpty - this.calFull;
    this.distance = this.calEmpty - (this.water / 100) * usableHeight;
    this.calculateWaterAndStatus();
    this.broadcastTelemetry();
  }
}
